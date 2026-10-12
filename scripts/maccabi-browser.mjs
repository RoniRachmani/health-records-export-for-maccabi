// The browser side shared by the terminal scripts that run against a member's own account:
// scripts/live-run.mjs (an export through the development build) and scripts/headless-export.mjs
// (an export with no extension at all). A real Chrome, Chromium or Edge (CHROME_PATH picks one) with a
// profile kept outside the repo (LIVE_PROFILE, default ~/.hrem-live-profile), driven over the DevTools
// Protocol with nothing but Node's own WebSocket; and Maccabi's three-page sign-in, with the username and
// password from 1Password secret references in .env (MACCABI_USERNAME, MACCABI_PASSWORD) or the item
// MACCABI_OP_ITEM names (default "Maccabi"), read only when a page asks for them and submitted once.
//
// Nothing here prints a credential: what the sign-in logs is which page it answered.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lit } from './in-page.mjs';
import { BROWSERS, isFile, root, sleep } from './stage.mjs';

export { lit };

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

export const ORIGIN = 'https://online.maccabi4u.co.il';
export const START = ORIGIN + '/sonline/';
export const PROFILE = process.env.LIVE_PROFILE || join(homedir(), '.hrem-live-profile');

const ITEM = process.env.MACCABI_OP_ITEM || 'Maccabi';
const SIGN_IN_WAIT_MS = 3 * 60_000;
const POLL_MS = 5000;
/** How long the browser has to answer a protocol command, unless the caller gives it longer. */
const REPLY_MS = 30_000;

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
export function credentials() {
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

/**
 * Opens the browser on `startUrl` and attaches to its page. `extension` is a folder to load unpacked
 * (branded Chrome ignores the flag; the profile then keeps one loaded by hand). `keep` leaves the
 * browser open when the process exits; otherwise it is killed. Returns the page (evaluate, probe,
 * navigate, insertText, pressEnter) with the raw protocol `send`, its `sessionId` and `targetId`,
 * for what the page object does not cover.
 */
export async function openBrowser({ startUrl = START, extension = null, keep = false } = {}) {
  const exe = BROWSERS.find(isFile);
  if (!exe) throw new Error('No Chrome, Chromium or Edge found; set CHROME_PATH.');
  mkdirSync(PROFILE, { recursive: true });
  const browser = spawn(exe, [
    '--remote-debugging-port=0',
    '--user-data-dir=' + PROFILE,
    '--no-first-run',
    '--no-default-browser-check',
    // Branded Chrome ignores this flag; the profile then keeps an extension loaded by hand instead.
    ...(extension ? ['--load-extension=' + extension] : []),
    startUrl,
  ]);
  process.once('exit', () => { if (!keep) browser.kill(); });

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
  const send = (method, params = {}, sessionId, timeoutMs = REPLY_MS) => {
    const id = ++lastId;
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rej(new Error(method + ': no reply in ' + timeoutMs / 1000 + ' s'));
      }, timeoutMs);
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
  const target0 = target;
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });

  const page = {
    /**
     * Evaluates in the page. A page that navigates mid-call throws; callers poll, so they retry. timeoutMs is
     * how long the page has to answer: longer than the default for a request it sends and waits on.
     */
    async evaluate(expression, timeoutMs) {
      const { result, exceptionDetails } = await send(
        'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId, timeoutMs);
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
    send,
    sessionId,
    targetId: target0.targetId,
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
  if (location.origin === ${lit(ORIGIN)} && sessionStorage.getItem('token')) return 'signedIn';
  if (passwordField()) return 'password';
  if (byText(${lit(WITH_PASSWORD)})) return 'choose';
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
const clickText = (text) => inPage(`const b = byText(${lit(text)}); if (!b) return false; b.click(); return true;`);
const PAGE_SHAPE = inPage(`
  const inputs = {};
  for (const e of all('input')) {
    const k = (e.type || 'text') + (shown(e) ? '' : ' (hidden)');
    inputs[k] = (inputs[k] || 0) + 1;
  }
  const frames = all('iframe').map((f) => { try { return new URL(f.src).host; } catch { return '(no src)'; } });
  return { at: location.host + location.pathname, inputs, frames };
`);

/** Signs in if the page asks for it; returns when the page is on /sonline/ with a token. */
export async function signIn(page) {
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
