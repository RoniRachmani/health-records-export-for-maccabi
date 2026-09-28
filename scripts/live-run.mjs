// A live test run against your own Maccabi Online account: opens a browser with the development
// build loaded, signs in with the username and password from 1Password if the session has ended,
// and drives an export through the dev bridge (see *Driving a run from the console* in the README).
// It always stops before orderMedicalFile, the one request that changes anything: a test never orders
// the medical file or makes Maccabi send an SMS, and there is deliberately no option that would.
//
//   npm run live                  runs every step before orderMedicalFile, then stops
//   npm run live -- --keep        leaves the browser open at the end
//
// MACCABI_OP_ITEM names the 1Password item (default "Maccabi"); it is read with the 1Password CLI,
// `op`, only when a sign-in is needed. LIVE_PROFILE is the browser profile (default
// ~/.hrem-live-profile), kept outside the repo and between runs, so a session that is still alive is
// reused rather than replaced: every new sign-in ends the member's other sessions.
//
// Nothing here prints a credential or a record: what it reports is what the dev bridge replies with,
// statuses, counts and problem lines. The password is filled once per run and never re-submitted,
// because a script retrying a wrong password is how an account gets locked.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { BROWSERS, isFile, root, sleep } from './stage.mjs';

const ORIGIN = 'https://online.maccabi4u.co.il';
const START = ORIGIN + '/sonline/';
const EXTENSION = join(root, 'dist-dev');
const PROFILE = process.env.LIVE_PROFILE || join(homedir(), '.hrem-live-profile');
const ITEM = process.env.MACCABI_OP_ITEM || 'Maccabi';
const KEEP = process.argv.includes('--keep');

const SIGN_IN_WAIT_MS = 3 * 60_000;
const POLL_MS = 5000;

/** Username and password of the 1Password item, read only when the page asks for them. */
function credentials() {
  let out;
  try {
    out = execFileSync('op', ['item', 'get', ITEM, '--format', 'json', '--reveal'], {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit'],
    });
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error('The 1Password CLI (op) is not installed: brew install 1password-cli, then turn on '
        + '"Integrate with 1Password CLI" in the 1Password app (Settings > Developer).');
    }
    throw new Error(`op could not read the 1Password item "${ITEM}"; set MACCABI_OP_ITEM to its name.`);
  }
  const fields = JSON.parse(out).fields || [];
  const username = fields.find((f) => f.purpose === 'USERNAME')?.value;
  const password = fields.find((f) => f.purpose === 'PASSWORD')?.value;
  if (!username || !password) throw new Error(`The 1Password item "${ITEM}" has no username or no password.`);
  return { username, password };
}

async function openBrowser() {
  const exe = BROWSERS.find(isFile);
  if (!exe) throw new Error('No Chrome, Chromium or Edge found; set CHROME_PATH.');
  mkdirSync(PROFILE, { recursive: true });
  const browser = spawn(exe, [
    '--remote-debugging-port=0',
    '--user-data-dir=' + PROFILE,
    '--no-first-run',
    '--no-default-browser-check',
    // Branded Chrome ignores this flag; the profile then keeps an extension loaded by hand instead.
    '--load-extension=' + EXTENSION,
    START,
  ]);
  process.once('exit', () => { if (!KEEP) browser.kill(); });

  const wsUrl = await new Promise((resolveUrl, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('The browser did not start. Is a window on '
      + PROFILE + ' already open? Close it and run again.\n' + log)), 30_000);
    browser.stderr.on('data', (d) => {
      log += d;
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolveUrl(m[1]);
      }
    });
  });

  // A minimal DevTools Protocol client, as in stage.mjs.
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let lastId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = m.id && pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  };
  const send = (method, params = {}, sessionId) => {
    const id = ++lastId;
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rej(new Error(method + ': no reply in 30s'));
      }, 30_000);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); res(v); },
        reject: (e) => { clearTimeout(timer); rej(e); },
      });
    });
  };

  let target;
  for (let i = 0; !target; i++) {
    const { targetInfos } = await send('Target.getTargets');
    target = targetInfos.find((t) => t.type === 'page' && t.url.startsWith('https://'))
      || (i > 20 && targetInfos.find((t) => t.type === 'page'));
    if (!target) await sleep(500);
  }
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });

  const page = {
    /** Evaluates in the page. A page that navigates mid-call throws; callers poll, so they retry. */
    async evaluate(expression) {
      const { result, exceptionDetails } = await send(
        'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    },
    /** Like evaluate, but a page between documents answers `fallback` instead of throwing. */
    async probe(expression, fallback) {
      try {
        return await page.evaluate(expression);
      } catch {
        return fallback;
      }
    },
    navigate: (url) => send('Page.navigate', { url }, sessionId),
    insertText: (text) => send('Input.insertText', { text }, sessionId),
    async pressEnter() {
      const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...key }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key }, sessionId);
    },
    /** A dev bridge command; undefined when nothing answered, which is what a missing extension looks like. */
    dev: (msg, timeoutMs = 5000) => page.probe(`new Promise((ok) => {
      const id = Math.random();
      const timer = setTimeout(() => { removeEventListener('message', f); ok(undefined); }, ${timeoutMs});
      function f(e) {
        if (e.data?.__hremDev !== 'res' || e.data.id !== id) return;
        clearTimeout(timer);
        removeEventListener('message', f);
        ok(e.data.res);
      }
      addEventListener('message', f);
      postMessage({ __hremDev: 'req', id, msg: ${JSON.stringify(msg)} }, '*');
    })`, undefined),
  };
  return page;
}

// The sign-in form is found by shape rather than by selector: the visible password field, and the
// visible text field before it in the same form.
const PASSWORD_FIELD = `[...document.querySelectorAll('input[type=password]')].find((e) => e.offsetParent)`;
const HAS_PASSWORD_FIELD = `!!${PASSWORD_FIELD}`;
const FOCUS_PASSWORD = `(() => { const p = ${PASSWORD_FIELD}; if (!p) return false; p.focus(); p.select(); return true; })()`;
const FOCUS_USERNAME = `(() => {
  const p = ${PASSWORD_FIELD};
  if (!p) return false;
  const fields = [...(p.form || document).querySelectorAll('input')]
    .filter((e) => e.offsetParent && ['text', 'email', 'tel', 'number', ''].includes(e.type));
  const before = fields.filter((e) => e.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING);
  const u = before.at(-1);
  if (!u) return false;
  u.focus();
  u.select();
  return true;
})()`;
const SIGNED_IN = `location.origin === ${JSON.stringify(ORIGIN)} && !!sessionStorage.getItem('token')`;

async function signIn(page) {
  const until = Date.now() + SIGN_IN_WAIT_MS;
  let filled = false;
  let hinted = false;
  let redirected = false;
  const since = Date.now();
  while (Date.now() < until) {
    if (await page.probe(SIGNED_IN, false)) return;
    const onForm = await page.probe(HAS_PASSWORD_FIELD, false);
    if (onForm && !filled) {
      const { username, password } = credentials();
      if (!(await page.probe(FOCUS_USERNAME, false))) throw new Error('Found a password field but no username field before it.');
      await page.insertText(username);
      await page.probe(FOCUS_PASSWORD, false);
      await page.insertText(password);
      await page.pressEnter();
      filled = true;
      console.log('Signed in with the username and password from 1Password; waiting for the site.');
    } else if (!onForm && filled && !redirected && (await page.probe('location.origin', '')) === ORIGIN) {
      // Signed in, but landed on a page without the token (the legacy site): the token is issued on /sonline/.
      await sleep(POLL_MS);
      if (!(await page.probe(SIGNED_IN, false))) {
        await page.navigate(START);
        redirected = true;
      }
    } else if (!hinted && Date.now() - since > 20_000) {
      console.log(filled
        ? 'Still not signed in. If the site asks for anything more, answer it in the browser window. '
          + 'The password is not submitted again.'
        : 'No sign-in form yet. If the page offers a choice of how to sign in, pick username and password in the browser window.');
      hinted = true;
    }
    await sleep(1000);
  }
  throw new Error('Not signed in after ' + SIGN_IN_WAIT_MS / 60_000 + ' minutes.');
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

async function main() {
  const page = await openBrowser();
  await sleep(2000);
  await signIn(page);
  await ensureExtension(page);

  const before = await page.dev({ type: 'dev:state' });
  if (before.run && ['running', 'saving', 'paused_session', 'paused_hidden'].includes(before.run.status)) {
    console.log('Discarding the unfinished run from last time.');
    await page.dev({ type: 'dev:cancel' });
  } else if (before.run) {
    await page.dev({ type: 'dev:dismiss' });
  }
  await page.dev({ type: 'dev:stopBefore', step: 'orderMedicalFile' });

  const started = await page.dev({ type: 'dev:start' });
  if (started?.error) throw new Error('dev:start: ' + started.error);
  console.log('Export started; it will stop before orderMedicalFile.');

  let last = '';
  let run;
  for (;;) {
    await sleep(POLL_MS);
    const s = await page.dev({ type: 'dev:state' });
    if (!s) continue; // the tab is between pages
    run = s.run;
    if (!run) throw new Error('The run disappeared.');
    const line = `${run.status} ${run.nextStep} ${run.percent}% | ${s.staged.files} files, ${s.problems} problems`;
    if (line !== last) console.log(line);
    last = line;
    if (run.status === 'paused_hidden') console.log('Bring the Maccabi tab to the front of the browser window.');
    if (run.status === 'done' || run.status === 'error' || run.status === 'paused_session') break;
  }

  const problems = (await page.dev({ type: 'dev:problems' })) || [];
  for (const p of problems) console.log('  problem: ' + p);
  const stopped = run.status === 'paused_session' && /dev:stopBefore/.test(run.message || '');
  // A run left paused here would order the medical file the moment someone pressed Resume in the popup.
  if (run.status === 'paused_session') await page.dev({ type: 'dev:cancel' });
  if (stopped) {
    console.log('Stopped before orderMedicalFile, as it should.');
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
