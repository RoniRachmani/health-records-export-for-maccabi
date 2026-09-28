// A live test run against your own Maccabi Online account: opens a browser with the development
// build loaded, signs in with the username and password from 1Password if the session has ended,
// and drives an export through the dev bridge (see *Driving a run from the console* in the README).
// It always skips orderMedicalFile (dev:skipOrder), the one request that changes anything: a test never
// orders the medical file or makes Maccabi send an SMS, and there is deliberately no option that would.
// It stops before save, so no ZIP is downloaded; what it reports is what was collected.
//
//   npm run live                  collects everything except the medical-file order, then stops before the ZIP
//   npm run live -- --keep        leaves the browser open at the end
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
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { BROWSERS, isFile, root, sleep } from './stage.mjs';

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const ORIGIN = 'https://online.maccabi4u.co.il';
const START = ORIGIN + '/sonline/';
const EXTENSION = join(root, 'dist-dev');
const PROFILE = process.env.LIVE_PROFILE || join(homedir(), '.hrem-live-profile');
const ITEM = process.env.MACCABI_OP_ITEM || 'Maccabi';
const KEEP = process.argv.includes('--keep');

const SIGN_IN_WAIT_MS = 3 * 60_000;
const POLL_MS = 5000;

const NO_OP = 'The 1Password CLI (op) is not installed: brew install 1password-cli, then turn on '
  + '"Integrate with 1Password CLI" in the 1Password app (Settings > Developer).';

/** A secret reference's value; anything else is taken as the value itself (as `op run` passes it). */
function resolve(name) {
  const value = process.env[name];
  if (!value.startsWith('op://')) return value;
  try {
    return execFileSync('op', ['read', '--no-newline', value], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(NO_OP);
    throw new Error(`op could not read ${name} (${value}).`);
  }
}

/** Username and password, from the references in .env or the 1Password item, read only when the page asks for them. */
function credentials() {
  if (process.env.MACCABI_USERNAME && process.env.MACCABI_PASSWORD) {
    return { username: resolve('MACCABI_USERNAME'), password: resolve('MACCABI_PASSWORD') };
  }
  let out;
  try {
    out = execFileSync('op', ['item', 'get', ITEM, '--format', 'json', '--reveal'], {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit'],
    });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(NO_OP);
    throw new Error(`op could not read the 1Password item "${ITEM}"; set MACCABI_USERNAME and MACCABI_PASSWORD in .env, or MACCABI_OP_ITEM.`);
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

// Maccabi's sign-in (mac.maccabi4u.co.il/login) takes three pages: the ID number and המשך
// ("continue"); a choice of SMS code, voice-call code or כניסה עם סיסמה ("sign in with password");
// then the ID and password and המשך again, which lands on /sonline/. Fields are found by shape and
// buttons by their text, in the page and inside any shadow root, since the first pages are drawn in one.
const CONTINUE = 'המשך';
const WITH_PASSWORD = 'כניסה עם סיסמה';
const HELPERS = `
  const all = (sel, root = document) => {
    const out = [...root.querySelectorAll(sel)];
    for (const e of root.querySelectorAll('*')) if (e.shadowRoot) out.push(...all(sel, e.shadowRoot));
    return out;
  };
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const textFields = () => all('input').filter((e) => shown(e) && ['text', 'email', 'tel', 'number', ''].includes(e.type));
  const passwordField = () => all('input[type=password]').find(shown);
  const byText = (text) => all('a, button, [role=button]').find((e) => shown(e) && e.textContent.trim() === text);
  const focus = (e) => { if (!e) return false; e.focus(); e.select?.(); return true; };
`;
const inPage = (body) => `(() => {${HELPERS}${body}})()`;

/** Which of the three sign-in pages the tab is on, or 'signedIn', or 'other' (between pages). */
const STAGE = inPage(`
  if (location.origin === ${JSON.stringify(ORIGIN)} && sessionStorage.getItem('token')) return 'signedIn';
  if (passwordField()) return 'password';
  if (byText(${JSON.stringify(WITH_PASSWORD)})) return 'choose';
  if (location.host === 'mac.maccabi4u.co.il' && textFields().length) return 'id';
  return 'other';
`);
const FOCUS_ID = inPage(`return focus(textFields()[0]);`);
// On the password page, the ID field is the text field before the password; it is usually filled already.
const ID_BEFORE_PASSWORD_EMPTY = inPage(`
  const p = passwordField();
  const u = textFields().filter((e) => e.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
  if (!u || u.value) return false;
  return focus(u);
`);
const FOCUS_PASSWORD = inPage(`return focus(passwordField());`);
const clickText = (text) => inPage(`const b = byText(${JSON.stringify(text)}); if (!b) return false; b.click(); return true;`);
const PAGE_SHAPE = inPage(`
  const inputs = {};
  for (const e of all('input')) {
    const k = (e.type || 'text') + (shown(e) ? '' : ' (hidden)');
    inputs[k] = (inputs[k] || 0) + 1;
  }
  const frames = all('iframe').map((f) => { try { return new URL(f.src).host; } catch { return '(no src)'; } });
  return { at: location.host + location.pathname, inputs, frames };
`);

async function signIn(page) {
  const until = Date.now() + SIGN_IN_WAIT_MS;
  let creds;
  const done = new Set(); // each page is answered once: nothing is submitted twice
  let hinted = false;
  let redirected = false;
  let lastChange = Date.now();
  while (Date.now() < until) {
    const stage = await page.probe(STAGE, 'other');
    if (stage === 'signedIn') return;
    if (stage !== 'other' && !done.has(stage)) {
      creds ||= credentials();
      if (stage === 'id') {
        if (!(await page.probe(FOCUS_ID, false))) throw new Error('Found the ID page but could not focus its field.');
        await page.insertText(creds.username);
        if (!(await page.probe(clickText(CONTINUE), false))) await page.pressEnter();
        console.log('Sign-in: entered the ID number.');
      } else if (stage === 'choose') {
        await page.probe(clickText(WITH_PASSWORD), false);
        console.log('Sign-in: chose to sign in with a password.');
      } else if (stage === 'password') {
        if (await page.probe(ID_BEFORE_PASSWORD_EMPTY, false)) await page.insertText(creds.username);
        await page.probe(FOCUS_PASSWORD, false);
        await page.insertText(creds.password);
        if (!(await page.probe(clickText(CONTINUE), false))) await page.pressEnter();
        console.log('Sign-in: entered the password; waiting for the site.');
      }
      done.add(stage);
      lastChange = Date.now();
    } else if (done.has('password') && !redirected && (await page.probe('location.origin', '')) === ORIGIN) {
      // Signed in, but landed on a page without the token (the legacy site): the token is issued on /sonline/.
      await sleep(POLL_MS);
      if ((await page.probe(STAGE, 'other')) !== 'signedIn') {
        await page.navigate(START);
        redirected = true;
      }
    } else if (!hinted && Date.now() - lastChange > 20_000) {
      console.log('Sign-in is not moving. If the site asks for anything more, answer it in the browser window; '
        + 'nothing already entered is submitted again.');
      // Shape only: the address without its query, counts of inputs, and the hosts of frames.
      console.log('  page: ' + JSON.stringify(await page.probe(PAGE_SHAPE, null)));
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

async function main() {
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
  const skip = await ask(page, { type: 'dev:skipOrder', on: true });
  if (skip?.on !== true) {
    throw new Error('The extension did not confirm dev:skipOrder (it answered ' + JSON.stringify(skip ?? null)
      + '); not starting a run that could order.');
  }
  const stop = await ask(page, { type: 'dev:stopBefore', step: 'save' });
  if (stop?.ok !== true) throw new Error('The extension did not confirm dev:stopBefore save; not starting.');

  const started = await page.dev({ type: 'dev:start' });
  if (started?.error) throw new Error('dev:start: ' + started.error);
  console.log('Export started: no medical-file order, and it stops before saving the ZIP.');

  let last = '';
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
    const line = `${run.status} ${run.nextStep} ${run.percent}% | ${s.staged.files} files, ${s.problems} problems`;
    if (line !== last) console.log(line);
    last = line;
    if (run.status === 'paused_hidden') console.log('Bring the Maccabi tab to the front of the browser window.');
    if (run.status === 'done' || run.status === 'error' || run.status === 'paused_session') break;
  }

  const problems = (await page.dev({ type: 'dev:problems' })) || [];
  for (const p of problems) console.log('  problem: ' + p);
  const stopped = run.status === 'paused_session' && /dev:stopBefore/.test(run.message || '');
  if (stopped) for (const [folder, n] of Object.entries(state.staged.perFolder)) console.log(`  ${folder}: ${n} files`);
  // The staged files are the member's records: they go with the run unless --keep asked to look at them.
  if (run.status === 'paused_session' && !KEEP) await page.dev({ type: 'dev:cancel' });
  if (stopped) {
    console.log('Collected everything; stopped before saving the ZIP.');
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
