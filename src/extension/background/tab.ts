/* The Maccabi tab: reading its session, moving it between pages, and sending
   requests from inside it. Functions passed to executeScript run in the page
   and must be self-contained. */
import { b64bytes, jwtClaims, memberFirstName, SessionEndedError, sessionFrom, type HttpRequest, type HttpResponse, type Session, type Transport } from '../../core';
import { MACCABI_ORIGIN, type TabInfo } from '../shared/state';

const SCRIPT_TIMEOUT_MS = 60_000;

export interface PageSnapshot {
  host: string;
  path: string;
  cookieMid: string | null;
  jwt: string | null;
}

async function inTab<A extends unknown[], R>(tabId: number, func: (...args: A) => R | Promise<R>, args: A, timeoutMs = SCRIPT_TIMEOUT_MS): Promise<R> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SessionEndedError('the Maccabi Healthcare Services tab did not respond for ' + timeoutMs / 1000 + ' s')), timeoutMs);
  });
  try {
    const run = chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args }).then((res) => {
      if (!res || !res.length) throw new SessionEndedError('could not run in the Maccabi Healthcare Services tab');
      return res[0].result as R;
    }, (e: unknown) => {
      // No tab, a tab on another site, or an error page.
      throw new SessionEndedError('the Maccabi Healthcare Services tab is not available (' + (e instanceof Error ? e.message : String(e)) + ')');
    });
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function snapshotInPage(): PageSnapshot {
  return {
    host: location.hostname,
    path: location.pathname,
    cookieMid: (document.cookie.match(/cookie_sessionId_0_(\d+)/) || [])[1] || null,
    jwt: sessionStorage.getItem('token'),
  };
}

export function snapshot(tabId: number): Promise<PageSnapshot> {
  return inTab(tabId, snapshotInPage, []);
}

export function sessionOf(s: PageSnapshot): Session {
  const { mid, gender } = sessionFrom(s.cookieMid ? 'cookie_sessionId_0_' + s.cookieMid + '=' : '', s.jwt);
  return { mid, jwt: s.jwt, gender };
}

function clearTokenInPage(): void {
  sessionStorage.removeItem('token');
}

const ACTIVITY_TIMEOUT_MS = 5000;

function mousedownInPage(): void {
  document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

/**
 * Keeps the site's own idle logout from cutting an export in half. Maccabi logs the tab out 6 min
 * after the last keydown or mousedown in the page, with a 25 s warning dialog (measured 2026-09-18);
 * requests do not count towards it, from the page or from here, and neither does the tab being
 * visible. So a run that asks nothing of the user looks idle to the site and dies partway. This
 * gives the page the one signal it watches for, and only while a run is using the session.
 * Failures are ignored: the run's next request reports a tab or session that has gone.
 */
export async function keepSessionAlive(tabId: number): Promise<void> {
  try {
    await inTab(tabId, mousedownInPage, [], ACTIVITY_TIMEOUT_MS);
  } catch {
    /* nothing to do here */
  }
}

/**
 * Enough token left to run an export on; below this, take a fresh one instead. A token is issued
 * with about 10 h of life (measured 2026-09-18), so this only rejects a tab left open all day.
 */
const REUSE_MIN_LIFE_S = 1800;
const REUSE_CHECK_MS = 3000;

/**
 * The token already in the tab, when it can be taken as it is: it belongs to the member whose
 * cookie is in the same page, it is not about to expire, and the REST API still answers it. Then
 * there is nothing for a reload to fix, and skipping it leaves the popup open -- Chrome closes a
 * popup when the tab under it navigates. Null whenever anything is off, and the caller reloads.
 */
async function reusableSession(tabId: number): Promise<Session | null> {
  const snap = await snapshot(tabId);
  if (snap.host !== new URL(MACCABI_ORIGIN).hostname || !/^\/sonline\//i.test(snap.path)) return null;
  // Both, and equal: a tab left open while someone logged out and in again in another tab keeps
  // the old member's token and loses the cookie (seen 2026-09-17), and either alone would pass.
  const claims = jwtClaims(snap.jwt);
  if (!snap.cookieMid || !claims || String(claims.mem_id || '') !== snap.cookieMid) return null;
  if (typeof claims.exp !== 'number' || claims.exp - Date.now() / 1000 < REUSE_MIN_LIFE_S) return null;
  const s = sessionOf(snap);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The claims say who the token is for; only the site says whether it still works.
    const r = await Promise.race([
      extensionFetch({
        url: '/sonline/MainAppAPI/webapi/mac/v1/members/0/' + s.mid,
        method: 'GET',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.jwt },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), REUSE_CHECK_MS);
      }),
    ]);
    return r.status === 200 ? s : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The session of whoever is logged in now. The token lives in the tab's sessionStorage, so a
 * tab left open while someone logged out and in again in another tab still holds the previous
 * member's token (seen 2026-09-17). Loading a /sonline/ page without one makes the site issue
 * the current one (about 2 s after navigation start). Null when nobody is logged in.
 *
 * reuse keeps a token that is already the current member's and still works, so pressing Start on
 * a tab in normal use costs no reload; the run's own reconnects always take a fresh one.
 */
export async function currentSession(tabId: number, sonlineUrl: string, reuse = false): Promise<Session | null> {
  try {
    if (reuse) {
      const s = await reusableSession(tabId);
      if (s) return s;
    }
    await inTab(tabId, clearTokenInPage, []);
    await navigate(tabId, sonlineUrl, /^\/sonline\//i);
    for (let i = 0; i < 30; i++) {
      const s = sessionOf(await snapshot(tabId));
      if (s.mid && s.jwt) return s;
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (e) {
    if (!(e as SessionEndedError).sessionEnded) throw e;
  }
  return null;
}

const NAME_TIMEOUT_MS = 3000;

/**
 * The member's first name, from the member endpoint the export also reads. Kept per member in
 * chrome.storage.session (memory only), so the popup asks once per browser session.
 */
async function memberName(s: Session): Promise<string | undefined> {
  const cached = (await chrome.storage.session.get('member')).member as { mid: string; name: string } | undefined;
  if (cached && cached.mid === s.mid) return cached.name;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      extensionFetch({
        url: '/sonline/MainAppAPI/webapi/mac/v1/members/0/' + s.mid,
        method: 'GET',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.jwt },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), NAME_TIMEOUT_MS);
      }),
    ]);
    if (r.status !== 200) return undefined;
    const name = memberFirstName(JSON.parse(new TextDecoder().decode(r.bytes)));
    if (!name) return undefined;
    await chrome.storage.session.set({ member: { mid: s.mid, name } });
    return name;
  } catch {
    return undefined; // the popup just leaves the name out
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Logged in as far as the REST API is concerned: a member id and the SPA token.
 * withName also reads the member's first name (a request to the site on a cache miss).
 */
export async function tabInfo(tab: chrome.tabs.Tab | undefined, withName = false): Promise<TabInfo> {
  // tab.url is only visible for online.maccabi4u.co.il (the one host permission), so the
  // login pages on mac.maccabi4u.co.il read as "not on Maccabi"; the popup's advice covers both.
  if (!tab || tab.id === undefined || !tab.url || !tab.url.startsWith(MACCABI_ORIGIN + '/')) return { onMaccabi: false, loggedIn: false, tabId: tab?.id };
  try {
    const s = sessionOf(await snapshot(tab.id));
    const loggedIn = !!(s.mid && s.jwt);
    const name = loggedIn && withName ? await memberName(s) : undefined;
    return { onMaccabi: true, loggedIn, tabId: tab.id, ...(name ? { name } : {}) };
  } catch {
    return { onMaccabi: true, loggedIn: false, tabId: tab.id };
  }
}

export async function isVisible(tabId: number): Promise<boolean> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new SessionEndedError('the Maccabi Healthcare Services tab was closed');
  }
  if (!tab.active) return false;
  const win = await chrome.windows.get(tab.windowId);
  return win.state !== 'minimized';
}

/** Loads url in the tab and checks where it ended up; a redirect elsewhere (the login page) ends the session. */
export async function navigate(tabId: number, url: string, expectPath: RegExp): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new SessionEndedError('the page ' + url + ' did not finish loading'));
    }, 90_000);
    let started = false;
    function listener(id: number, info: chrome.tabs.OnUpdatedInfo) {
      if (id !== tabId) return;
      if (info.status === 'loading') started = true;
      if (info.status === 'complete' && started) {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url }).catch((e) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new SessionEndedError('the Maccabi Healthcare Services tab was closed (' + e.message + ')'));
    });
  });
  const s = await snapshot(tabId);
  if (s.host !== new URL(MACCABI_ORIGIN).hostname || !expectPath.test(s.path)) {
    throw new SessionEndedError('opening ' + new URL(url).pathname + ' led to ' + s.path + ' (logged out?)');
  }
  // Let the legacy page register itself in the server session before its services are called.
  await new Promise((r) => setTimeout(r, 1500));
}

interface PageResult {
  ok: boolean;
  error?: string;
  status?: number;
  redirected?: boolean;
  contentType?: string;
  retryAfter?: string;
  b64?: string;
}

async function fetchInPage(req: HttpRequest): Promise<PageResult> {
  try {
    const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, credentials: 'include', redirect: req.redirect || 'follow' });
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
    return { ok: true, status: r.status, redirected: r.type === 'opaqueredirect', contentType: r.headers.get('content-type') || '', retryAfter: r.headers.get('retry-after') || undefined, b64: btoa(bin) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function xhrInPage(req: HttpRequest): Promise<{ status: number; text: string }> {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open(req.method, req.url, true);
    const h = req.headers || {};
    for (const k in h) x.setRequestHeader(k, h[k]);
    x.onload = () => resolve({ status: x.status, text: x.responseText });
    x.onerror = () => resolve({ status: 0, text: '' });
    x.send(req.body);
  });
}

function pathInPage(): string {
  return location.pathname;
}

/**
 * Requests sent by the page itself. waitVisible
 * runs first: Chrome freezes hidden tabs, and a frozen tab never answers.
 */
export function tabTransport(tabId: number, waitVisible: () => Promise<void>): Transport {
  return {
    async fetch(req) {
      await waitVisible();
      const r = await inTab(tabId, fetchInPage, [req]);
      if (!r.ok) throw new Error(r.error);
      return { status: r.status as number, redirected: !!r.redirected, contentType: r.contentType || '', retryAfter: r.retryAfter, bytes: b64bytes(r.b64 || '') };
    },
    async xhr(req) {
      await waitVisible();
      return inTab(tabId, xhrInPage, [req]);
    },
    async pagePath() {
      return inTab(tabId, pathInPage, []);
    },
  };
}

/** Requests sent by the extension itself, with the site's cookies (host permission). */
export function extensionFetch(req: HttpRequest): Promise<HttpResponse> {
  return fetch(new URL(req.url, MACCABI_ORIGIN).toString(), {
    method: req.method,
    headers: req.headers,
    body: req.body,
    credentials: 'include',
    redirect: req.redirect || 'follow',
  }).then(async (r) => ({
    status: r.status,
    redirected: r.type === 'opaqueredirect',
    contentType: r.headers.get('content-type') || '',
    retryAfter: r.headers.get('retry-after') || undefined,
    bytes: new Uint8Array(await r.arrayBuffer()),
  }));
}

export type Route = 'extension' | 'tab';
export interface Routes {
  /** REST API and its PDFs (/sonline/...). */
  sonline: Route;
  /** Legacy services (/online/...). */
  online: Route;
}

/** Checked 2026-09-17 (docs/endpoints.json auth.extension): the REST API works from the extension; ajax.ashx answers the page differently. */
export const DEFAULT_ROUTES: Routes = { sonline: 'extension', online: 'tab' };

export function routedTransport(tabId: number, routes: Routes, waitVisible: () => Promise<void>): Transport {
  const tab = tabTransport(tabId, waitVisible);
  return {
    fetch(req) {
      const route = new URL(req.url, MACCABI_ORIGIN).pathname.startsWith('/sonline/') ? routes.sonline : routes.online;
      return route === 'extension' ? extensionFetch(req) : tab.fetch(req);
    },
    xhr: tab.xhr,
    pagePath: tab.pagePath,
  };
}
