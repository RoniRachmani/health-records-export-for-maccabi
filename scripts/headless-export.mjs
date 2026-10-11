// An export from the terminal, with no extension: the same collector the extension runs (src/core/),
// driven from Node against a browser this script opens and signs in to, writing the same folder the
// ZIP would hold. For a member who wants the export on a schedule, or just without a popup.
//
//   npm run export                        test results and lab histories into ./maccabi-export-<today>/
//   npm run export -- --all               every section the extension collects, except that nothing is
//                                         ordered: the medical file already on the site is taken as it is
//   npm run export -- --steps visits,referrals
//                                         just those steps (names from STEP_ORDER in src/core/steps.ts)
//   npm run export -- --out ~/health      the export folder goes under that directory
//   npm run export -- --keep              leave the browser open at the end
//
// The browser and the sign-in are scripts/maccabi-browser.mjs: a real Chrome, Chromium or Edge with a
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
import { ACTIVITY_IN_PAGE, folderSink, pageTransport, sessionOf } from './headless-lib.mjs';
import { START, openBrowser, signIn } from './maccabi-browser.mjs';
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
const OUT = resolve(option('--out') || '.');

/** The site logs the tab out after ~6 min without a click; a mousedown every 2 min keeps it (see keepSessionAlive in tab.ts). */
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

/** Navigates and waits until the page's path matches; the token is only issued and renewed on /sonline/. */
async function goTo(page, url, pathRe) {
  await page.navigate(url);
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const path = await page.probe('location.pathname', '');
    if (pathRe.test(path)) return;
  }
  throw new Error('The page did not reach ' + url);
}

async function main() {
  const core = await loadCore();
  const wanted = ALL ? core.STEP_ORDER : STEPS_ARG ? STEPS_ARG.split(',') : ['testResults'];
  for (const s of wanted) if (!core.STEP_ORDER.includes(s)) throw new Error('No such step: ' + s + '. Steps: ' + core.STEP_ORDER.join(', '));
  const legacy = wanted.filter((s) => core.LEGACY_STEPS.includes(s));
  const rest = wanted.filter((s) => !core.LEGACY_STEPS.includes(s));

  const dir = join(OUT, core.exportName(Date.now()));
  mkdirSync(dir, { recursive: true });
  const sink = folderSink(core, dir, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  const page = await openBrowser({ startUrl: START, keep: KEEP });
  await sleep(2000);
  await signIn(page);
  let session = await sessionOf(page, core);
  if (!session) throw new Error('Signed in, but no session token on the page.');

  const startedAt = new Date().toISOString();
  let lastDetail = '';
  const deps = {
    transport: pageTransport(page),
    sink,
    html: core.domHtmlParser(await htmlParser()),
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
  const alive = setInterval(() => page.probe(ACTIVITY_IN_PAGE, undefined), ALIVE_MS);

  const run = async (name) => {
    const t = Date.now();
    const before = sink.problems.length;
    console.log(name);
    await core.runStep(c, ctx, name);
    const filed = sink.problems.length - before;
    console.log(`  done in ${((Date.now() - t) / 1000).toFixed(1)} s` + (filed ? `, ${filed} problem${filed > 1 ? 's' : ''}` : ''));
  };
  try {
    if (legacy.length) {
      // The legacy services answer only after a /online/ page has loaded in the session, and the requests go from it.
      await goTo(page, core.SUMMARY_PAGE, /^\/online\//i);
      for (const name of legacy) await run(name);
      await goTo(page, START, /^\/sonline\//i);
      session = (await sessionOf(page, core)) || session;
      c.session = session;
    }
    for (const name of rest) await run(name);
  } catch (e) {
    if (e && e.sessionEnded) console.error(e.message);
    else throw e;
    process.exitCode = 1;
  } finally {
    clearInterval(alive);
  }

  const { files, errors } = sink.writeRootFiles(startedAt);
  const width = Math.max(0, ...Object.keys(files).map((k) => k.length));
  for (const [folder, n] of Object.entries(files).sort()) console.log(`  ${folder.padEnd(width)}  ${String(n).padStart(4)} files`);
  for (const p of sink.problems) console.log('  problem: ' + p.where + ': ' + p.what);
  console.log(`${errors.length ? errors.length + ' problems; ' : ''}export in ${dir}`);
}

/** happy-dom's DOMParser, for the two legacy HTML tables; a dev dependency, so only loaded when a legacy step runs. */
async function htmlParser() {
  try {
    const { Window } = await import('happy-dom');
    return new Window().DOMParser;
  } catch {
    return class {
      parseFromString() {
        throw new Error('happy-dom is not installed (npm install), which the legacy steps need to parse HTML');
      }
    };
  }
}

// Exiting kills the browser (see openBrowser), unless --keep asked for it to stay.
main().then(
  () => process.exit(),
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);
