// An export from the terminal, with no extension: the same collector the extension runs (src/core/),
// driven from Node against a browser this script opens and signs in to, writing the same folder the
// ZIP would hold. For working on the collector, or for an export without the popup.
//
//   npm run export                        test results and lab histories into ./maccabi-export-<today>/
//   npm run export -- --all               every section the extension collects, except that nothing is
//                                         ordered: the medical file already on the site is taken as it is
//   npm run export -- --steps visits,referrals
//                                         just those steps (names from STEP_ORDER in src/core/steps.ts), in the
//                                         run's own order, with any step they read from (STEP_NEEDS)
//   npm run export -- --out ~/health      the export folder goes under that directory
//   npm run export -- --keep              leave the browser open at the end
//   npm run export -- --no-browser        no browser at all: sign in here with the password and send every
//                                         request from Node, so it can run on a schedule
//   npm run export -- --no-browser --sms  the same, signed in with an SMS code instead of the password: the ID
//                                         number alone is read, Maccabi texts a code, and the script asks
//                                         for it (--phone N picks the phone when more than one can take it)
//
// Without a browser (--no-browser), the sign-in and the requests are scripts/maccabi-session.mjs: the
// SAML sign-in replayed over fetch with a cookie jar, as Oren Yomtov's maccabi-health first did, and the
// portal's own bootstrap for the API token. It needs no Chrome and no extension, and works wherever Node
// does -- a server, a container, a cron job. The ID number and the password come from .env or 1Password
// exactly as for the browser (credentials() in maccabi-browser.mjs, unchanged); with --sms only the ID
// number is read (idNumber()), and the code is asked for once and never stored. Every request it sends,
// the sign-in chain included, is paced like the extension's (core.PACE_MS, one at a time), and listed in
// docs/endpoints/scripts-endpoints.json.
//
// With a browser (the default), the browser and the sign-in are scripts/maccabi-browser.mjs: a real Chrome, Chromium or Edge with a
// profile outside the repo, so a live session is reused, and the username and password from 1Password
// references in .env, filled once. The requests themselves are sent from inside the Maccabi Online
// page, as the extension sends them from the tab: the site's bot protection accepts page requests, and
// the legacy /online/ services answer only a tab that has their page loaded. So the browser window is
// real and visible; nothing here is headless in the --headless sense, only in that no one has to click.
//
// What the extension's run does and this does not: order the medical file (the one request that changes
// anything on the account, and what makes Maccabi send an SMS), pause when the tab is hidden (the script
// keeps the window; leave it be), resume a run across sessions (a rerun into the same folder skips the
// files it already has, which is the same thing for an export that takes minutes), and build the ZIP (a
// folder is what the assistants open anyway; zip it yourself if you want one).
//
// Nothing here prints a credential or a record: what it reports is step names, counts and problem lines,
// with the member id written as {mid} as the export's own files write it.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { createInterface } from 'node:readline/promises';
import { folderSink, keepAlive, pageTransport, sessionOf } from './headless-lib.mjs';
import { START, credentials, idNumber, openBrowser, signIn } from './maccabi-browser.mjs';
import { MaccabiSession, choosePhone } from './maccabi-session.mjs';
import { root, sleep } from './stage.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const KEEP = flag('--keep');
const ALL = flag('--all');
const STEPS_ARG = option('--steps');
if (flag('--steps') && (!STEPS_ARG || STEPS_ARG.startsWith('--'))) {
  console.error('--steps takes the step names, separated by commas: --steps visits,referrals');
  process.exit(1);
}
const OUT = resolve(option('--out') || '.');
const NO_BROWSER = flag('--no-browser');
const SMS = flag('--sms');
const PHONE = option('--phone');
if (SMS && !NO_BROWSER) {
  console.error('--sms is a --no-browser road: npm run export -- --no-browser --sms');
  process.exit(1);
}
if (flag('--phone') && (!SMS || !/^\d+$/.test(PHONE || ''))) {
  console.error('--phone goes with --sms and takes the number of the phone in the list the sign-in prints: --no-browser --sms --phone 2');
  process.exit(1);
}

/** The site logs the tab out after ~6 min without a click; a mousedown every 2 min keeps it (see keepSessionAlive in tab.ts). A browser's timer: a Node session has no page to go idle, and its own requests reset the gateway's clock. */
const ALIVE_MS = 120_000;

/** The TypeScript sources, bundled for Node: src/cli/index.ts re-exports what this script uses. */
async function loadCore() {
  const out = join(root, 'dist-cli');
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    define: { __DEV_BRIDGE__: 'false' },
    build: {
      outDir: out,
      emptyOutDir: true,
      minify: false,
      target: 'es2022',
      lib: { entry: join(root, 'src/cli/index.ts'), formats: ['es'], fileName: () => 'core.mjs' },
      rollupOptions: { external: ['fflate'] },
    },
  });
  return import(pathToFileURL(join(out, 'core.mjs')).href);
}

// ---- the run --------------------------------------------------------------------------------------

/** How long a loaded legacy page is left to register itself in the server session before its services are called (as navigate in tab.ts). */
const SETTLE_MS = 1500;

/** Navigates and waits until the page has loaded at a matching path; the token is only issued and renewed on /sonline/. */
async function goTo(page, url, pathRe) {
  await page.navigate(url);
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const at = await page.probe('({ path: location.pathname, state: document.readyState })', null);
    if (at && pathRe.test(at.path) && at.state === 'complete') {
      await sleep(SETTLE_MS);
      return;
    }
  }
  throw new Error('The page did not reach ' + new URL(url).pathname + ' (signed out?)');
}

/**
 * The browser as the run's driver: sign-in through the page, requests from the page, the page's own
 * idle-timer click, the legacy page loaded in the tab.
 */
async function browserDriver(core) {
  const page = await openBrowser({ startUrl: START, keep: KEEP });
  await sleep(2000);
  await signIn(page);
  const session = await sessionOf(page, core);
  if (!session) throw new Error('Signed in, but no session token on the page.');
  return {
    session,
    transport: pageTransport(page, core),
    aliveMs: ALIVE_MS,
    keepAlive: () => keepAlive(page, core),
    primeLegacy: () => goTo(page, core.SUMMARY_PAGE, /^\/online\//i),
    async backToPortal() {
      await goTo(page, START, /^\/sonline\//i);
      return sessionOf(page, core);
    },
  };
}

/**
 * Node as the run's driver: the sign-in over fetch with the password, or with the ID number and an SMS
 * code (--sms), requests with the cookie jar and the bearer token, the legacy page fetched. No keep-alive:
 * the run's own requests are never further apart than the gateway's idle window (the longest wait inside
 * one is the collector's RATE_LIMIT_MAX_MS), and Maccabi's hour cannot be extended by anything.
 */
async function nodeDriver(core) {
  const m = new MaccabiSession({ core, sleep });
  if (!SMS) {
    const creds = credentials();
    await m.beginSignIn(creds.username);
    await m.finishSignInWithPassword(creds.password);
    console.log('Signed in with the password.');
  } else {
    const phones = await m.beginSignIn(idNumber());
    let index;
    try {
      index = choosePhone(phones, PHONE);
    } catch (e) {
      if (e.code === 'INVALID_PHONE_CHOICE') throw new Error('--phone ' + PHONE + ' is not one of the phones that can take an SMS (1-' + phones.length + ').');
      throw e;
    }
    if (index === null) {
      // Different numbers can take it: the member's choice, not the script's. The same number listed twice is not one.
      console.log('More than one phone can take the code; choose with --phone N:');
      phones.forEach((p) => console.log(`  ${p.index + 1}. ${p.number}${p.sms ? '' : ' (no SMS)'}`));
      throw new Error('No SMS was sent.');
    }
    await m.sendCode(index);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (;;) {
        // Typed with a space in the middle, or pasted with one around it: the digits are the code.
        const code = (await rl.question('The code Maccabi texted to ' + phones[index].number + ': ')).replace(/\s+/g, '');
        try {
          await m.finishSignIn(code);
          break;
        } catch (e) {
          // Not six digits never reached Maccabi, so the SMS still stands: ask again rather than spend it.
          if (e.code !== 'INVALID_CODE_FORMAT') throw e;
          console.log('The code is six digits.');
        }
      }
    } finally {
      rl.close();
    }
    console.log('Signed in with the SMS code.');
  }
  // The sign-in's own bootstrap filled the session (token, member id, gender): nothing to ask again.
  console.log('The session ends on its own an hour after this.');
  return {
    session: m.session,
    transport: m.transport(),
    primeLegacy: () => m.primeLegacy(),
    async backToPortal() {
      m.backToPortal();
      return m.bootstrap(); // a fresh token, as the tab gets one on returning to /sonline/
    },
  };
}

/** The steps to run for what was asked, in the run's order, with the steps they read from. */
function stepsFor(core) {
  if (ALL) return core.STEP_ORDER;
  const asked = STEPS_ARG ? STEPS_ARG.split(',').map((s) => s.trim()).filter(Boolean) : ['testResults'];
  for (const s of asked) if (!core.STEP_ORDER.includes(s)) throw new Error('No such step: ' + s + '. Steps: ' + core.STEP_ORDER.join(', '));
  const needed = asked.flatMap((s) => core.STEP_NEEDS[s] || []).filter((s) => !asked.includes(s));
  if (needed.length) console.log('Also running ' + needed.join(', ') + ', which ' + asked.filter((s) => core.STEP_NEEDS[s]).join(', ') + ' reads from.');
  return core.STEP_ORDER.filter((s) => asked.includes(s) || needed.includes(s));
}

async function main() {
  const core = await loadCore();
  const wanted = stepsFor(core);
  const legacy = wanted.filter((s) => core.LEGACY_STEPS.includes(s));
  const rest = wanted.filter((s) => !core.LEGACY_STEPS.includes(s));

  const dir = join(OUT, core.exportName(Date.now()));
  mkdirSync(dir, { recursive: true });
  const sink = folderSink(core, dir, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  const driver = NO_BROWSER ? await nodeDriver(core) : await browserDriver(core);
  let session = driver.session;

  const startedAt = new Date().toISOString();
  let lastDetail = '';
  const deps = {
    transport: driver.transport,
    sink,
    html: core.domHtmlParser(await htmlParser(legacy.length > 0)),
    clock: { now: () => Date.now(), sleep },
    progress: (ev) => {
      if (ev.detail && ev.detail !== lastDetail) {
        lastDetail = ev.detail;
        process.stdout.write('  ' + ev.detail + (ev.items ? ' (' + ev.items.total + ')' : '') + '\n');
      }
    },
  };
  const c = new core.Collector(deps, session);
  const ctx = core.newCtx();
  // The page's idle timer is the browser driver's to hold off; the Node driver has none.
  const alive = driver.keepAlive ? setInterval(() => driver.keepAlive(), driver.aliveMs) : null;

  const ran = [];
  // The step a failure is filed under: the one running, or the one a page change was for.
  let current = '';
  const run = async (name) => {
    const t = Date.now();
    const before = sink.problems.length;
    console.log(name);
    current = name;
    ran.push(name);
    sink.setStep(name);
    await core.runStep(c, ctx, name);
    const filed = sink.problems.length - before;
    console.log(`  done in ${((Date.now() - t) / 1000).toFixed(1)} s` + (filed ? `, ${filed} problem${filed > 1 ? 's' : ''}` : ''));
  };
  try {
    if (legacy.length) {
      // The legacy services answer only after a /online/ page has loaded in the session, and the requests go from it.
      current = legacy[0];
      await driver.primeLegacy();
      for (const name of legacy) await run(name);
      current = rest[0] || '';
      session = (await driver.backToPortal()) || session;
      c.session = session;
    }
    for (const name of rest) await run(name);
  } catch (e) {
    // Whatever stopped the run (an ended session, a 429, a page that would not open) is a problem of the step
    // it stopped in, so the folder's README and export-errors.json say the step failed, and the files it did
    // collect are kept and described. The steps after it never ran: the README says they were not collected.
    console.error(e.message);
    if (current && !ran.includes(current)) ran.push(current);
    sink.setStep(current);
    await c.problem(current || 'run', e.message);
    process.exitCode = 1;
  } finally {
    if (alive) clearInterval(alive);
  }

  const { files, errors } = sink.writeRootFiles(startedAt, ran);
  const width = Math.max(0, ...Object.keys(files).map((k) => k.length));
  for (const [folder, n] of Object.entries(files).sort()) console.log(`  ${folder.padEnd(width)}  ${String(n).padStart(4)} files`);
  for (const p of sink.problems) console.log('  problem: ' + p.where + ': ' + p.what);
  console.log(`${errors.length ? errors.length + ' problems; ' : ''}export in ${dir}`);
}

/** happy-dom's DOMParser, for the two legacy HTML tables; a dev dependency, and only loaded when a legacy step runs. */
async function htmlParser(needed) {
  try {
    if (needed) return new (await import('happy-dom')).Window().DOMParser;
  } catch {
    /* the legacy steps say so below */
  }
  return class {
    parseFromString() {
      throw new Error('happy-dom is not installed (npm install), which the legacy steps need to parse HTML');
    }
  };
}

/** What a refused sign-in (maccabi-session.mjs SignInError) means to the member; any other code prints as it is. */
const SIGN_IN_SAYS = {
  PASSWORD_REJECTED: 'Maccabi refused the password. Nothing was retried; check MACCABI_PASSWORD (or the 1Password item) before the next run.',
  OTP_REJECTED: 'Maccabi refused the code. Nothing was retried; the next run sends a new SMS.',
  OTP_EXPIRED: 'The code expired before it was sent. The next run sends a new SMS.',
  LOGIN_BLOCKED: 'Maccabi has blocked signing in to this account for now. Sign in on the website to see why.',
  LOGIN_NOT_AVAILABLE: 'Maccabi does not offer this account an online sign-in.',
};

// Exiting kills the browser (see openBrowser), unless --keep asked for it to stay.
main().then(
  () => process.exit(),
  (e) => {
    console.error(SIGN_IN_SAYS[e.code] || e.message);
    process.exit(1);
  },
);
