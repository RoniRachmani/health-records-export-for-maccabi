// The weekly drift check: has Maccabi Online changed in a way that could break the export? Signs in with no
// browser, as `npm run export -- --no-browser` does, runs every section of the collector, never ordering, and keeps
// nothing it collected; records the field names and types of every answer and compares them with
// docs/endpoints/shapes.json; reads the site's front-end scripts, as `npm run endpoints` does, for the requests the
// export makes; and writes a short report of what differs.
//
//   npm run drift                          the check: .cache/drift/latest.md and a dated copy beside it
//   npm run drift -- --notify              the same, and a macOS notification with the outcome
//   npm run drift -- --steps visits,referrals   only those steps (and the steps they read from), to try it out
//   npm run drift -- --no-scan             without the endpoint scan
//   npm run drift -- --install --day tue --time 03:30   runs it weekly, with --notify, from this checkout (launchd);
//                                          --repo DIR installs it for another checkout; --update with it runs
//                                          scripts/drift-update.mjs instead, which first brings that checkout to
//                                          GitHub's main (for a checkout kept only for the check)
//   npm run drift -- --uninstall           stops that
//
// It exits 0 when nothing differs, 1 when something does, and 2 when it could not check (a sign-in that failed, the
// credentials out of reach, a run that stopped). What counts as a difference is in driftReport (drift-lib.mjs). It
// never writes shapes.json: what moved is for a person to read, then accept with `npm run live -- --shapes` and a
// change to the fake site or the collector. It keeps no record: the run's sink holds JSON in memory and documents
// as digests, and the scan's scripts are held in memory too. The report names endpoints, fields, steps, folders,
// statuses and counts, never a value, and a report with Hebrew or a long number in it is not written.
//
// Like the no-browser export, it signs in once with the password from .env or 1Password, never resubmits it, and
// so ends the member's other Maccabi sessions; every request goes through MaccabiSession.request's one queue, paced
// core.PACE_MS apart, and the ones it sends itself are in docs/endpoints/scripts-endpoints.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadCore } from './cli-core.mjs';
import { LABEL, countingTransport, driftReport, launchAgent, memorySink, missingFields, pageScripts, problemKey, readScripts, runSteps, safeToWrite, scanFindings, sessionGet } from './drift-lib.mjs';
import { credentials } from './maccabi-browser.mjs';
import { MaccabiSession } from './maccabi-session.mjs';
import { root, sleep } from './stage.mjs';

const args = process.argv.slice(2);
const flag = (/** @type {string} */ name) => args.includes(name);
const option = (/** @type {string} */ name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
const OUT = join(root, '.cache', 'drift');
const PLIST = join(homedir(), 'Library', 'LaunchAgents', LABEL + '.plist');
/** Past Maccabi's hour, a run is stuck rather than slow: it reports so and ends. */
const WATCHDOG_MS = 80 * 60_000;

/** What a refused sign-in means; any other code is printed as it is. Nothing is retried. */
const SIGN_IN_SAYS = {
  PASSWORD_REJECTED: 'Maccabi refused the password. It was not retried; check MACCABI_PASSWORD (or the 1Password item).',
  LOGIN_BLOCKED: 'Maccabi has blocked signing in to this account for now. Sign in on the website to see why.',
  LOGIN_NOT_AVAILABLE: 'Maccabi does not offer this account an online sign-in.',
  LOGIN_PAGE_CHANGED: 'the login page has changed: it no longer carries the originJWT the sign-in starts from.',
  AUTH_RESPONSE_CHANGED: 'the sign-in service answered in a shape the script does not know.',
  SAML_RESPONSE_CHANGED: 'the SAML handoff answered in a shape the script does not know.',
  BOOTSTRAP_CHANGED: 'the portal\'s token bootstrap answered in a shape the script does not know.',
};

function notify(title, text) {
  const q = (/** @type {string} */ s) => '"' + s.replace(/["\\]/g, '') + '"';
  try {
    execFileSync('osascript', ['-e', `display notification ${q(text)} with title ${q(title)}`], { timeout: 10_000 });
  } catch { /* not on a Mac, or no session to show it in: the report is still there */ }
}

function schedule() {
  if (flag('--uninstall')) {
    try {
      execFileSync('launchctl', ['bootout', `gui/${process.getuid?.()}`, PLIST], { stdio: 'ignore' });
    } catch { /* not loaded */ }
    rmSync(PLIST, { force: true });
    console.log('The weekly drift check is off (' + PLIST + ' removed).');
    return;
  }
  const day = option('--day');
  const time = option('--time');
  if (!day || !time) throw new Error('--install takes a day and a time: --install --day tue --time 03:30');
  // The checkout the agent runs in: this one, or one that lasts longer than a worktree (--repo, the main checkout).
  const repo = resolve(option('--repo') || root);
  if (!existsSync(join(repo, 'package.json'))) throw new Error('--repo takes a checkout of this repository: ' + repo + ' has no package.json.');
  const out = join(repo, '.cache', 'drift');
  mkdirSync(out, { recursive: true });
  const plist = launchAgent({
    node: process.execPath, script: join(repo, 'scripts', flag('--update') ? 'drift-update.mjs' : 'drift-check.mjs'), cwd: repo, log: join(out, 'launchd.log'), day, time,
    path: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
  });
  mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  try {
    execFileSync('launchctl', ['bootout', `gui/${process.getuid?.()}`, PLIST], { stdio: 'ignore' });
  } catch { /* not loaded yet */ }
  writeFileSync(PLIST, plist);
  execFileSync('launchctl', ['bootstrap', `gui/${process.getuid?.()}`, PLIST]);
  console.log(`The drift check runs every ${day} at ${time} from ${repo} (a Mac asleep then runs it on waking)` +
    (flag('--update') ? ', bringing it to GitHub\'s main first.' : '.'));
  if (!existsSync(join(repo, 'scripts', 'drift-check.mjs'))) console.log('That checkout has no scripts/drift-check.mjs yet: the runs fail, in the log, until it does.');
  console.log('Its output goes to ' + join(out, 'launchd.log') + '; turn it off with npm run drift -- --uninstall.');
}

async function check() {
  const started = Date.now();
  // The day in Israel, as the export and the medical file are dated: a night run is still the day it began there.
  const date = new Date(started).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  mkdirSync(OUT, { recursive: true });
  const read = (/** @type {string} */ f, /** @type {any} */ fallback) => {
    try {
      return JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      return fallback;
    }
  };
  const before = read(join(OUT, 'state.json'), null);
  const known = read(join(root, 'docs', 'endpoints', 'shapes.json'), {});
  const maps = { endpoints: read(join(root, 'docs', 'endpoints', 'endpoints.json'), {}), baseline: read(join(root, 'docs', 'endpoints', 'scan-baseline.json'), {})['endpoints.json'] || [] };

  const core = await loadCore();
  const steps = stepsFor(core);
  /** @type {Parameters<typeof driftReport>[0]} */
  const r = {
    date, seconds: 0, requests: 0, stopped: null, signIn: null, drift: [], missing: [], endpoints: 0,
    problems: [], before, statuses: {}, counts: {}, scan: null,
  };
  const finish = () => {
    r.seconds = (Date.now() - started) / 1000;
    const report = driftReport(r);
    if (!safeToWrite(report.text)) throw new Error('The report held Hebrew or a long number, so it was not written.');
    writeFileSync(join(OUT, 'latest.md'), report.text);
    writeFileSync(join(OUT, date + '.md'), report.text);
    if (report.state) writeFileSync(join(OUT, 'state.json'), JSON.stringify(report.state, null, 2) + '\n');
    process.stdout.write('\n' + report.text);
    const n = (report.text.match(/^\*\*(\d+) difference/m) || [])[1];
    if (flag('--notify')) {
      notify('Maccabi drift check', report.failed && !n ? 'Could not check. See .cache/drift/latest.md' : n ? `${n} difference${n === '1' ? '' : 's'}. See .cache/drift/latest.md` : 'No differences.');
    }
    return report.failed && !report.differs ? 2 : report.differs ? 1 : 0;
  };

  let creds;
  try {
    creds = credentials();
  } catch {
    r.signIn = 'could not read the credentials. If .env holds 1Password references, the app must be unlocked; `npm run env` writes the values into .env instead.';
    return finish();
  }
  const m = new MaccabiSession({ core, sleep });
  try {
    await m.beginSignIn(creds.username);
    await m.finishSignInWithPassword(creds.password);
  } catch (e) {
    r.signIn = 'the sign-in failed: ' + (SIGN_IN_SAYS[e.code] || e.code || 'no answer from Maccabi') + (e.status ? ` (HTTP ${e.status})` : '');
    return finish();
  }
  console.log('Signed in. The session ends on its own within the hour.');

  const scan = { files: new Map(), failed: new Map(), capped: false };
  const get = sessionGet(m);
  /** @type {string | null} */
  let scanError = null;
  if (!flag('--no-scan')) {
    try {
      const portal = await m.request('/sonline/');
      await readScripts(get, pageScripts(await portal.text(), portal.finalUrl), scan);
      console.log(`Read ${scan.files.size} of the portal's script files.`);
    } catch (e) {
      scanError = 'the portal page did not open (' + (e.sessionEnded ? 'session ended' : 'no answer') + ')';
    }
  }

  /** @type {Record<string, Record<string, string[]>>} */
  const seen = {};
  const counting = countingTransport(m.transport(), core, m.mid);
  const transport = core.shapeTransport(counting, m.mid, (s) => { core.mergeShapes(seen, s); });
  const sink = memorySink(core);
  const deps = {
    transport,
    sink,
    html: core.domHtmlParser(new (await import('happy-dom')).Window().DOMParser),
    clock: { now: () => Date.now(), sleep },
    progress: () => {},
  };
  const collector = new core.Collector(deps, m.session);
  const done = await runSteps(core, {
    collector, ctx: core.newCtx(), sink, steps, log: (l) => console.log(l),
    async primeLegacy() {
      const html = await m.primeLegacy();
      if (!flag('--no-scan') && !scanError) {
        await readScripts(get, pageScripts(html, core.SUMMARY_PAGE), scan);
        console.log(`Read ${scan.files.size} script files, the legacy page's included.`);
      }
    },
    async backToPortal() {
      m.backToPortal();
      return m.bootstrap();
    },
  });

  r.stopped = done.stopped;
  r.problems = sink.problems.map(problemKey);
  r.statuses = counting.statuses;
  r.requests = Object.values(counting.statuses).reduce((a, s) => a + Object.values(s).reduce((x, y) => x + y, 0), 0) + scan.files.size + scan.failed.size;
  r.counts = sink.counts();
  r.drift = core.shapeDrift(known, seen);
  r.missing = missingFields(known, seen);
  r.endpoints = Object.keys(seen).length;
  // The shapes this run saw, for whoever reads the drift: field names and types only, like shapes.json.
  const shapes = JSON.stringify(core.sortedShapes(seen), null, 2) + '\n';
  if (safeToWrite(shapes)) writeFileSync(join(OUT, 'shapes-seen.json'), shapes);
  if (scanError) r.scan = { error: scanError };
  else if (!flag('--no-scan')) {
    const why = {};
    for (const w of scan.failed.values()) why[w] = (why[w] || 0) + 1;
    r.scan = { ...scanFindings(scan.files, maps, before?.calls ?? null), read: scan.files.size, failed: why, capped: scan.capped };
  }
  return finish();
}

/** Every step, or the ones --steps names with what they read from, in the run's order. */
function stepsFor(core) {
  const asked = option('--steps')?.split(',').map((s) => s.trim()).filter(Boolean);
  if (!asked) return core.STEP_ORDER;
  for (const s of asked) if (!core.STEP_ORDER.includes(s)) throw new Error('No such step: ' + s + '. Steps: ' + core.STEP_ORDER.join(', '));
  const needed = asked.flatMap((s) => core.STEP_NEEDS[s] || []);
  return core.STEP_ORDER.filter((s) => asked.includes(s) || needed.includes(s));
}

if (flag('--install') || flag('--uninstall')) {
  try {
    schedule();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
} else {
  setTimeout(() => {
    console.error('The drift check took longer than Maccabi\'s hour, and was stopped.');
    if (flag('--notify')) notify('Maccabi drift check', 'Could not check: it ran past the hour. See .cache/drift/launchd.log');
    process.exit(2);
  }, WATCHDOG_MS).unref();
  check().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.message);
      if (flag('--notify')) notify('Maccabi drift check', 'Could not check. See .cache/drift/launchd.log');
      process.exit(2);
    },
  );
}
