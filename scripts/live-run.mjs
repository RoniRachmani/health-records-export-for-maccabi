// A live test run against your own Maccabi Online account: opens a browser with the development
// build loaded, signs in with the username and password from 1Password if the session has ended,
// and drives an export through the dev bridge (see *Driving a run from the console* in CONTRIBUTING.md).
// It skips orderMedicalFile (dev:skipOrder), the one request that changes anything, so a test never orders the
// medical file or makes Maccabi send an SMS, and it stops before save, so no ZIP is downloaded; what it reports is
// what was collected. With --export it starts nothing: the member presses Start in the popup, and that export is a
// real one, which orders (SMS) and downloads the ZIP; the script only watches it. The script itself never orders.
//
//   npm run live                  collects everything except the medical-file order, then stops before the ZIP,
//                                 and prints the files per folder, and the time and requests of each step and part
//   npm run live -- --export      turns the two switches off, waits for you to press Start in the popup, and
//                                 times the whole export, the medical file and the ZIP included
//   npm run live -- --export --reorder
//                                 the same, but the export orders even when today's file is already ready
//   npm run live -- --keep        leaves the browser open at the end
//   npm run live -- --root-files  then writes the ZIP's root files as the save step does (still no ZIP), and
//                                 prints the README's version line, what it says failed, and export-errors.json
//   npm run live -- --names       also prints every staged file's path, to check how files are named (names carry
//                                 titles, such as a drug or a specialist, so this is the one output with more than counts)
//   npm run live -- --shapes      records the field names and types of every answer (never a value), prints what
//                                 docs/endpoints/shapes.json has not seen, and adds it there
//   npm run live -- --pretend-late
//                                 the export as if an order went out and Maccabi had not built its file
//                                 (dev:pretendOrder): it presses Save now after the wait's first check, saves the
//                                 ZIP, and prints the finish's problems and notification. Nothing is ordered
//   npm run live -- --no-send     the order step decides as a real export's would, and dev:noSend stops any order
//                                 before it goes out; prints what it stopped
//   npm run live -- --last-order '{"order":{...},"agoMinutes":61}'
//                                 sets LAST_ORDER for this member first (dev:setLastOrder), and puts the stored
//                                 one back at the end; prints both, with the member hash left out
//   npm run live -- --dates       prints the listed medical file's status and dates, and LAST_ORDER, and runs nothing
//   npm run live -- --screenshots opens the toolbar popup and photographs it before the start and at every
//                                 step, bringing the browser window to the front for each, into .cache/live-screenshots/<time>/ (gitignored:
//                                 the problem lines it can show come from the member's records)
//
// MACCABI_USERNAME and MACCABI_PASSWORD, from the environment or .env (gitignored), are 1Password secret
// references (op://vault/item/field), read with the 1Password CLI, `op`, only when a sign-in is needed; so
// .env holds where the credentials are, never the credentials. Without them, MACCABI_OP_ITEM names the
// item (default "Maccabi"). LIVE_PROFILE is the browser profile (default
// ~/.hrem-live-profile), kept outside the repo and between runs, so a session that is still alive is
// reused rather than replaced: every new sign-in ends the member's other sessions.
//
// Nothing here prints a credential or a record: what it reports is what the dev bridge replies with,
// statuses, counts and problem lines. The password is filled once per run and never re-submitted,
// because a script retrying a wrong password is how an account gets locked.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ORIGIN, START, lit, openBrowser as openPlainBrowser, signIn } from './maccabi-browser.mjs';
import { root, sleep } from './stage.mjs';

const EXTENSION = join(root, 'dist-dev');

const KEEP = process.argv.includes('--keep');
const ROOT_FILES = process.argv.includes('--root-files');
const NAMES = process.argv.includes('--names');
const EXPORT = process.argv.includes('--export');
const REORDER = process.argv.includes('--reorder');
const SHAPES = process.argv.includes('--shapes');
const PRETEND_LATE = process.argv.includes('--pretend-late');
const NO_SEND = process.argv.includes('--no-send');
const DATES = process.argv.includes('--dates');
const lastOrderArg = process.argv.indexOf('--last-order');
const LAST_ORDER_SET = lastOrderArg > 0 ? JSON.parse(process.argv[lastOrderArg + 1]) : null;
const SHAPES_FILE = join(root, 'docs', 'endpoints', 'shapes.json');
const SHOTS = process.argv.includes('--screenshots')
  ? join(root, '.cache', 'live-screenshots', new Date().toISOString().slice(0, 19).replace(/:/g, '-'))
  : null;

const POLL_MS = 5000;

async function openBrowser() {
  const page = await openPlainBrowser({ startUrl: START, extension: EXTENSION, keep: KEEP });
  const { send, targetId } = page;
  const target0 = { targetId };
  /** A dev bridge command; undefined when nothing answered, which is what a missing extension looks like. */
  page.dev = (msg, timeoutMs = 5000) => page.probe(`new Promise((ok) => {
      const id = Math.random();
      const timer = setTimeout(() => { removeEventListener('message', f); ok(undefined); }, ${timeoutMs});
      function f(e) {
        if (e.data?.__hremDev !== 'res' || e.data.id !== id) return;
        clearTimeout(timer);
        removeEventListener('message', f);
        ok(e.data.res);
      }
      addEventListener('message', f);
      postMessage({ __hremDev: 'req', id, msg: ${lit(msg)} }, '*');
    })`, undefined);

  /**
   * The real popup, opened from the toolbar with chrome.action.openPopup() and photographed as Chrome draws
   * it, then closed. Not popup.html in a tab: the background refuses commands sent from a tab, and the
   * Maccabi tab has to stay in front, since the run pauses when it is hidden.
   */
  let worker;
  let popupUrl;
  page.shoot = async (name) => {
    const dir = /** @type {string} */ (SHOTS); // shoot() asks only when --screenshots set it
    if (!worker) {
      const { targetInfos } = await send('Target.getTargets');
      for (const t of targetInfos.filter((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))) {
        const { sessionId: sw } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
        const { result } = await send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest()', returnByValue: true }, sw)
          .catch(() => ({}));
        if (result?.value?.name?.endsWith('(dev)')) {
          worker = sw;
          popupUrl = new URL(result.value.action.default_popup, t.url).href;
        }
      }
      if (!worker) throw new Error('no service worker of the development build to open the popup from');
      mkdirSync(dir, { recursive: true });
    }
    // Chrome opens a popup only in a focused window, and the one this script started sits behind the terminal.
    await send('Target.activateTarget', { targetId: target0.targetId });
    const { exceptionDetails } = await send('Runtime.evaluate', {
      expression: `chrome.tabs.query({ url: ${lit(ORIGIN + '/*')} })
        .then(([tab]) => chrome.action.openPopup(tab ? { windowId: tab.windowId } : {}))`,
      awaitPromise: true,
    }, worker);
    if (exceptionDetails) throw new Error('openPopup: ' + (exceptionDetails.exception?.description || exceptionDetails.text));
    let target;
    for (let i = 0; i < 20 && !target; i++) {
      await sleep(250);
      target = (await send('Target.getTargets')).targetInfos.find((t) => t.url === popupUrl);
    }
    if (!target) throw new Error('the popup did not open');
    const { sessionId: popup } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    await sleep(1200); // it asks the background for the state and renders, and Chrome sizes it to fit
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, popup);
    writeFileSync(join(dir, name + '.png'), Buffer.from(data, 'base64'));
    await send('Runtime.evaluate', { expression: 'window.close()' }, popup).catch(() => {});
  };
  return page;
}

/** A screenshot of the popup when --screenshots asked for them; a failure is reported once and ends the shots. */
let shotCount = 0;
let shotsFailed = false;
async function shoot(page, label) {
  if (!SHOTS || shotsFailed) return;
  try {
    await page.shoot(String(shotCount + 1).padStart(2, '0') + '-' + label);
    shotCount++;
  } catch (e) {
    shotsFailed = true;
    console.log('Screenshots stopped: ' + e.message);
  }
}


async function ensureExtension(page) {
  while (!(await page.dev({ type: 'dev:state' }))) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('The development build is not answering on this page. In the browser window, open the '
      + 'extensions page, turn on developer mode, choose "Load unpacked" and pick\n  ' + EXTENSION
      + '\n(the profile remembers it), then press Enter here. ');
    rl.close();
    await page.navigate(START);
    await sleep(3000);
  }
}

/**
 * A command that is safe to send twice, sent until something answers: right after signing in the
 * site is still redirecting, and a reply sent to a page that has just been replaced is lost.
 */
async function ask(page, msg) {
  for (let i = 0; i < 10; i++) {
    const res = await page.dev(msg);
    if (res !== undefined) return res;
    await sleep(2000);
  }
  return undefined;
}

/** An ISO time as the extension says it to the member: the time of day in Israel. */
function israelTime(/** @type {string} */ at) {
  return new Date(at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
}

/** What the order did, from the run's OrderResult (core/sections/letters.ts); none when it did not run. */
function orderOutcome(order) {
  if (!order) return 'not ordered (dev:skipOrder)';
  if (order.error) return 'not ordered: ' + order.error;
  if (order.skipped_ready_today) return "no order: today's file over the same range was already ready, and the run used it";
  if (order.skipped_ready_earlier) return 'no order: the file of the order sent ' + order.to_date + ', which no export had collected, was ready, and the run used it';
  if (order.earlier_order) {
    return 'no order: an earlier run ordered ' + (order.to_date ? 'to ' + order.to_date : 'today') + (order.ordered ? ', and the run waited for that file'
      : order.success_code === '3' ? ', refused' + (order.retry_at ? '; a run from ' + israelTime(order.retry_at) + ' orders once more' : ', with no retry left today') + '; see the problems'
      : ', unconfirmed; see the problems');
  }
  // The day's one retry after a refusal (placeOrder's REFUSAL_RETRY_MS).
  const retry = order.retry ? ", the day's retry after a refusal" : '';
  if (order.ordered) return 'ordered' + retry + ' (Maccabi sent an SMS)' + (order.same_day_before ? ", replacing a file from earlier today" : '');
  if (order.success_code === '3') return 'refused' + retry + ' (Success 3: Maccabi asked to try again later, and may still text); see the problems';
  return 'order not confirmed' + retry + (order.success_code ? ' (Success ' + order.success_code + ')' : '') + '; see the problems';
}

/** The committed snapshot, or nothing when there is none yet: one read, not a check and then a read. */
function readShapes() {
  let text;
  try {
    text = readFileSync(SHAPES_FILE, 'utf8');
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return {};
    throw e;
  }
  return JSON.parse(text);
}

/**
 * What this run's answers show that the committed snapshot has not, then the two merged into it. Added to, never
 * replaced: a field one account lacks has not left the site. The reply is names and types, and is checked all the
 * same, since this file goes into the repo.
 */
async function writeShapes(page) {
  const known = readShapes();
  const res = await page.dev({ type: 'dev:shapesSeen', known }, 30_000);
  if (!res?.merged) throw new Error('dev:shapesSeen: ' + (res?.error || 'no answer'));
  console.log(`Shapes: ${res.endpoints} endpoints, ${res.drift.length} differences from docs/endpoints/shapes.json`);
  for (const line of res.drift) console.log('  ' + line);
  const text = JSON.stringify(res.merged, null, 2) + '\n';
  if (/[\u0590-\u05FF]|\d{5,}/.test(text)) throw new Error('The shapes hold Hebrew or a long number, so they were not written.');
  writeFileSync(SHAPES_FILE, text);
}

/** LAST_ORDER as dev:getLastOrder shows it: the member hash replaced by whose it is. */
async function lastOrderShown(page) {
  const got = await ask(page, { type: 'dev:getLastOrder' });
  if (!got || got.error) throw new Error('dev:getLastOrder: ' + (got?.error || 'no answer'));
  return got;
}

async function main() {
  if ((PRETEND_LATE || NO_SEND || LAST_ORDER_SET) && EXPORT) throw new Error('--pretend-late, --no-send and --last-order are for test runs, not --export.');
  if (PRETEND_LATE && NO_SEND) throw new Error('--pretend-late records an order without deciding one: leave out --no-send.');
  const page = await openBrowser();
  await sleep(2000);
  await signIn(page);
  await ensureExtension(page);
  // The browser keeps running the service worker it cached last time, even for an unpacked extension it
  // loads from dist-dev: have it re-read the build this script has just made, then reload the page so
  // the bridge is the new one's.
  await page.dev({ type: 'dev:reload' });
  await sleep(2000);
  await page.navigate(START);
  await sleep(3000);
  await ensureExtension(page);

  const before = await ask(page, { type: 'dev:state' });
  if (!before) throw new Error('The extension stopped answering after the sign-in.');
  if (before.run && ['running', 'saving', 'paused_session', 'paused_hidden'].includes(before.run.status)) {
    console.log('Discarding the unfinished run from last time.');
    await ask(page, { type: 'dev:cancel' });
  } else if (before.run) {
    await ask(page, { type: 'dev:dismiss' });
  }
  if (DATES) {
    const dates = await ask(page, { type: 'dev:medicalFileDates' });
    console.log('Medical file listed: ' + JSON.stringify(dates));
    console.log('LAST_ORDER: ' + JSON.stringify((await lastOrderShown(page)).shown));
    return;
  }
  // The test switches this run does not ask for are turned off, so one left on by an earlier run that stopped short
  // does not carry over (an export turns them all off).
  const pretendTo = PRETEND_LATE ? await pretendDay(page) : undefined;
  const pretend = await ask(page, { type: 'dev:pretendOrder', on: !!pretendTo, toDate: pretendTo ?? null });
  const noSend = await ask(page, { type: 'dev:noSend', on: NO_SEND });
  if (pretend?.on !== !!pretendTo || noSend?.on !== NO_SEND) throw new Error('The extension did not confirm dev:pretendOrder and dev:noSend.');
  if (pretendTo) console.log('dev:pretendOrder: the run holds an order to ' + pretendTo + ' that was never sent.');
  if (NO_SEND) console.log('dev:noSend: the order step decides, and any order is stopped before it is sent.');
  // Kept as it is stored, and put back at the end, whatever happens: a LAST_ORDER left behind could stop the
  // member's next export ordering, or make it order.
  const original = EXPORT ? null : await lastOrderShown(page);
  if (original) console.log('LAST_ORDER before: ' + JSON.stringify(original.shown));
  try {
    if (LAST_ORDER_SET) {
      const set = await ask(page, { type: 'dev:setLastOrder', ...LAST_ORDER_SET });
      if (set?.ok !== true) throw new Error('dev:setLastOrder: ' + JSON.stringify(set ?? null));
      console.log('LAST_ORDER set: ' + JSON.stringify((await lastOrderShown(page)).shown));
    }
    await runAndReport(page);
  } finally {
    if (original) {
      const after = await lastOrderShown(page).catch(() => null);
      if (after) console.log('LAST_ORDER after the run: ' + JSON.stringify(after.shown));
      const put = await ask(page, { type: 'dev:setLastOrder', restore: original.saved });
      const back = await lastOrderShown(page).catch(() => null);
      const same = put?.ok === true && back && JSON.stringify(back.saved) === JSON.stringify(original.saved);
      console.log(same ? 'LAST_ORDER restored: ' + JSON.stringify(back.shown) : 'LAST_ORDER NOT restored: put it back by hand');
      if (!same) process.exitCode = 1;
    }
    if (PRETEND_LATE) await page.dev({ type: 'dev:pretendOrder', on: false });
    if (NO_SEND) await page.dev({ type: 'dev:noSend', on: false });
  }
}

/**
 * The day --pretend-late pretends an order to: today in Israel, unless the site already lists a file to today, which
 * the wait would take as the order's, and then the day before.
 */
async function pretendDay(page) {
  const dates = await ask(page, { type: 'dev:medicalFileDates' });
  if (!dates || dates.http !== 200) throw new Error('dev:medicalFileDates: ' + JSON.stringify(dates ?? null));
  console.log('Medical file listed: ' + JSON.stringify(dates.listed) + '; today ' + dates.today);
  if (dates.listed?.to_date !== dates.today) return dates.today;
  return new Date(Date.parse(dates.today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
}

async function runAndReport(page) {
  if (SHAPES) {
    const shapes = await ask(page, { type: 'dev:shapes', on: true });
    if (shapes?.on !== true) throw new Error('The extension did not confirm dev:shapes.');
  }
  if (EXPORT) {
    // The member's own Start in the popup is what orders: this script still never does.
    const skip = await ask(page, { type: 'dev:skipOrder', on: false });
    const stop = await ask(page, { type: 'dev:stopBefore', step: null });
    const pretend = await ask(page, { type: 'dev:pretendOrder', on: false });
    const noSend = await ask(page, { type: 'dev:noSend', on: false });
    if (skip?.on !== false || stop?.ok !== true || pretend?.on !== false || noSend?.on !== false) {
      throw new Error('The extension did not confirm turning the test switches off.');
    }
    const reorder = await ask(page, { type: 'dev:reorder', on: REORDER });
    if (reorder?.on !== REORDER) throw new Error('The extension did not confirm dev:reorder.');
    if (REORDER) console.log("dev:reorder is on: the export orders even if today's medical file is already ready.");
    console.log('Press Start in the extension\'s popup on the Maccabi tab. This is a real export: it orders the medical '
      + 'file (Maccabi sends an SMS) and downloads the ZIP. Waiting up to 10 minutes for it to start.');
    const until = Date.now() + 10 * 60_000;
    while (!(await page.dev({ type: 'dev:state' }))?.run) {
      if (Date.now() > until) throw new Error('No export was started.');
      await sleep(POLL_MS);
    }
  } else {
    if (REORDER) throw new Error('--reorder only goes with --export: a test without it never orders.');
    const skip = await ask(page, { type: 'dev:skipOrder', on: true });
    if (skip?.on !== true) {
      throw new Error('The extension did not confirm dev:skipOrder (it answered ' + JSON.stringify(skip ?? null)
        + '); not starting a run that could order.');
    }
    // --pretend-late saves the ZIP, to see the finish; every other test stops before it.
    const stop = await ask(page, { type: 'dev:stopBefore', step: PRETEND_LATE ? null : 'save' });
    if (stop?.ok !== true) throw new Error('The extension did not confirm dev:stopBefore; not starting.');

    await shoot(page, 'ready');
    const started = await page.dev({ type: 'dev:start' });
    if (started?.error) throw new Error('dev:start: ' + started.error);
    console.log(PRETEND_LATE ? 'Export started: no medical-file order; it presses Save now in the wait, and saves the ZIP.'
      : 'Export started: no medical-file order, and it stops before saving the ZIP.');
  }

  let last = '';
  let pressed = false;
  let run;
  let answeredAt = Date.now();
  let state;
  for (;;) {
    await sleep(POLL_MS);
    const s = await page.dev({ type: 'dev:state' });
    if (!s) {
      // Between pages for a moment is normal; for two minutes, the tab has been closed or has hung.
      if (Date.now() - answeredAt > 120_000) {
        throw new Error('The Maccabi tab has not answered for two minutes; was it closed? The run is paused '
          + 'there with what it collected, and the next npm run live discards it.');
      }
      continue;
    }
    answeredAt = Date.now();
    state = s;
    run = s.run;
    if (!run) throw new Error('The run disappeared.');
    const line = `${run.status} ${run.nextStep ?? 'finished'} ${run.percent}% | ${s.staged.files} files, ${s.problems} problems`;
    if (line !== last) console.log(line);
    if (line.split(' ', 2).join(' ') !== last.split(' ', 2).join(' ')) await shoot(page, run.status + '-' + run.nextStep);
    last = line;
    if (run.status === 'paused_hidden') console.log('Bring the Maccabi tab to the front of the browser window.');
    // Save now, once the popup offers it: after the wait's first check found the file not ready.
    if (PRETEND_LATE && !pressed && s.saveNowOffered) {
      await shoot(page, 'save-now-offered');
      const res = await page.dev({ type: 'dev:saveNow' });
      if (res?.offered !== true) throw new Error('dev:saveNow: ' + JSON.stringify(res ?? null));
      pressed = true;
      console.log('Save now pressed (' + run.detail + ')');
    }
    if (run.status === 'done' || run.status === 'error' || run.status === 'paused_session') break;
  }

  await shoot(page, 'end-' + run.status);
  if (SHOTS && shotCount) console.log(`${shotCount} popup screenshots in ${SHOTS}`);
  const problems = (await page.dev({ type: 'dev:problems' })) || [];
  for (const p of problems) console.log('  problem: ' + p);
  const stopped = run.status === 'paused_session' && /dev:stopBefore/.test(run.message || '');
  if (stopped) for (const [folder, n] of Object.entries(state.staged.perFolder)) console.log(`  ${folder}: ${n} files`);
  if (stopped && NAMES) {
    const names = await page.dev({ type: 'dev:names' }, 30_000);
    if (Array.isArray(names)) for (const rel of names) console.log('    ' + rel);
    else console.log('dev:names: no answer');
  }
  // Time and requests per step, or step:part, as the runner summed them: a step a resume or a rewind ran again counts
  // twice. The time is wall-clock, so it includes the PACE_MS between requests and any wait.
  // Rounded before it is split, so 4 min 59.6 s is "5 min 0 s", not "4 min 60 s" (and 59.96 s is not "60.0 s").
  const secs = (ms) => {
    if (ms < 59_950) return (ms / 1000).toFixed(1) + ' s';
    const s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
  };
  const timed = Object.entries(run.timings || {});
  if (timed.length) {
    const width = Math.max(...timed.map(([key]) => key.length));
    for (const [key, t] of timed) console.log(`  ${key.padEnd(width)}  ${secs(t.ms).padStart(12)}  ${String(t.requests).padStart(5)} requests`);
    const ms = timed.reduce((a, [, t]) => a + t.ms, 0);
    const requests = timed.reduce((a, [, t]) => a + t.requests, 0);
    const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
    console.log(`  all steps: ${secs(ms)}, ${requests} requests; since the start: ${secs(end - Date.parse(run.startedAt))}`);
  }
  console.log('  medical file: ' + (PRETEND_LATE ? 'not ordered: dev:pretendOrder recorded an order to ' + run.order?.to_date + ' that was never sent'
    : orderOutcome(run.order)));
  if (run.medicalFileLate) console.log('  medical file late: ' + JSON.stringify(run.medicalFileLate));
  if (state.blockedOrder) console.log('  dev:noSend stopped an order: ' + JSON.stringify(state.blockedOrder));
  // Asked again: the notification goes out just after the run is marked done.
  const notice = run.status === 'done' && (await ask(page, { type: 'dev:state' }))?.lastNotice;
  if (notice) console.log('  notification: ' + notice.title + ' | ' + notice.message);
  if (run.medicalFileMs) console.log(`  medical file: ready ${secs(run.medicalFileMs)} after the order`);
  if (run.zipBytes) console.log(`  ZIP: ${run.fileCount} files, ${(run.zipBytes / 1e6).toFixed(1)} MB, in the browser's downloads folder`);
  if (stopped && ROOT_FILES) {
    const root = await page.dev({ type: 'dev:rootFiles' }, 30_000);
    if (!root || root.error) {
      // Reported, not thrown: the run below is still discarded.
      console.log('dev:rootFiles: ' + (root?.error || 'no answer'));
      process.exitCode = 1;
    } else {
      console.log('README: ' + root.made);
      console.log(root.failedSection.replace(/^/gm, '  '));
      console.log(root.qualitySection.replace(/^/gm, '  '));
      console.log(`export-errors.json: ${root.errors.length} entries; the popup: ${problems.length} problems`);
      for (const e of root.errors) console.log('  ' + e);
    }
  }
  if (SHAPES) {
    await writeShapes(page);
    await page.dev({ type: 'dev:shapes', on: false });
  }
  // Only for this export: the next one uses today's file again.
  if (REORDER) await page.dev({ type: 'dev:reorder', on: false });
  // The staged files are the member's records: they go with the run unless --keep asked to look at them.
  if (run.status === 'paused_session' && !KEEP) await page.dev({ type: 'dev:cancel' });
  if (stopped) {
    console.log('Collected everything; stopped before saving the ZIP.');
  } else if ((EXPORT || PRETEND_LATE) && run.status === 'done') {
    console.log('Exported: the ZIP is saved.');
  } else {
    console.log(run.status + ': ' + (run.message || ''));
    process.exitCode = 1;
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
