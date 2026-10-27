// A minimal DevTools Protocol client, with nothing but Node's own WebSocket: how stage.mjs (the headless renders)
// and maccabi-browser.mjs (a browser on the member's own account) both drive the browser they start.

/**
 * The browser's DevTools address, once it prints it on stderr. `hint` follows the error when it never does, or when
 * the browser exits first (as Chrome does at once when its profile is already open in another window).
 * @param {import('node:child_process').ChildProcess} browser
 * @param {string} hint
 * @returns {Promise<string>}
 */
export function devToolsUrl(browser, hint) {
  const { stderr } = browser;
  if (!stderr) return Promise.reject(new Error('the browser was started without a piped stderr, where it prints its DevTools address'));
  return new Promise((resolveUrl, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(hint + '\n' + log)), 30_000);
    const exited = (code, signal) => {
      clearTimeout(timer);
      reject(new Error(hint + ' (it exited, ' + (signal || 'code ' + code) + ')\n' + log));
    };
    browser.once('exit', exited);
    stderr.on('data', (d) => {
      log += d;
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        browser.off('exit', exited);
        resolveUrl(m[1]);
      }
    });
  });
}

/**
 * Connects to `browser` at `wsUrl`. `send` answers with a command's result, or fails when the browser sends
 * nothing back in `replyMs` (or the call's own `timeoutMs`): a browser can die without closing its end of the
 * socket, and then a reply simply never comes. One that exits or drops the connection fails every command still
 * waiting, and every one sent after, at once and saying so, named `name`; except while `stopping()` says it was
 * asked to go. `on` subscribes to a protocol event and returns the unsubscribe. `gone` ends a timeout's message.
 * @param {string} wsUrl
 * @param {import('node:child_process').ChildProcess} browser
 * @param {{ name?: string; replyMs?: number; gone?: string; stopping?: () => boolean }} [options]
 */
export async function connect(wsUrl, browser, { name = 'the browser', replyMs = 30_000, gone = '', stopping = () => false } = {}) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let lastId = 0;
  /** @type {Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>} */
  const pending = new Map();
  /** @type {Map<string, Set<(params: any, sessionId?: string) => void>>} */
  const listeners = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method) {
      for (const f of listeners.get(m.method) || []) f(m.params, m.sessionId);
      return;
    }
    const p = m.id && pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  };
  /**
   * @param {string} method
   * @param {object} [params]
   * @param {string} [sessionId]
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  const send = (method, params = {}, sessionId, timeoutMs = replyMs) => {
    if (dead) return Promise.reject(new Error(method + ': ' + dead));
    const id = ++lastId;
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rej(new Error(method + ': no reply in ' + timeoutMs / 1000 + ' s' + gone));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          res(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          rej(e);
        },
      });
    });
  };
  /**
   * @param {string} method
   * @param {(params: any, sessionId?: string) => void} handler
   */
  const on = (method, handler) => {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method)?.add(handler);
    return () => listeners.get(method)?.delete(handler);
  };
  let dead = '';
  /** @param {string} why */
  const died = (why) => {
    if (dead || stopping()) return;
    dead = name + ' ' + why;
    for (const p of pending.values()) p.reject(new Error(dead));
    pending.clear();
  };
  ws.onclose = () => died('closed the DevTools connection');
  ws.onerror = () => died('broke the DevTools connection');
  browser.on('exit', (code, signal) => died('exited (' + (signal || 'code ' + code) + ')'));
  return { ws, send, on };
}
