// A Maccabi Online session with no browser: the sign-in and the portal's own bootstrap replayed over
// Node's fetch with a cookie jar, and a Transport (src/core/types.ts) that sends the collector's
// requests from here instead of from a tab.
//
// The sign-in chain is the one Oren Yomtov's maccabi-health (https://github.com/orenyomtov/maccabi-health,
// MIT) first worked out and documented in its docs/AUTH.md: a SAML handoff between the login origin
// (mac.maccabi4u.co.il) and the portal (online.maccabi4u.co.il). The login page carries an `originJWT`;
// POST /infosec/auth with the ID number gives a first token; /otp/detailsV2 answers with the member's
// sign-in options and the next token. From there two roads reach the same place. The SMS road, which
// maccabi-health replays: /otp/generateV2 sends the six-digit code, /otp/validate with the code gives the
// assertion. The password road, recorded from the site's own page with scripts/discover-login.mjs:
// POST /infosec/auth again, with the password and type "password", gives the assertion straight away.
// Either way /infosec/response turns it into a SAML response, which is POSTed to the portal's ACS and
// answered with the portal session cookies. The portal's /sonline/ API then answers plain requests with
// the bearer token its own bootstrap endpoint returns -- no browser is needed for any of it, which is
// also where maccabi-health showed that Maccabi's bot protection leaves the authenticated API alone.
// The code here is written for this repo's Transport; the chain and its gotchas are his.
//
// Every request this module sends is listed in docs/endpoints/scripts-endpoints.json (the sign-in chain,
// the bootstrap, the legacy page); the collector's own go through transport() and are endpoints.json's.
// test/endpoints.test.ts checks the first list against the paths written here. The repo's rules apply
// to these requests as to the extension's: nothing is ordered, nothing is marked read, and every request
// goes out one at a time, core.PACE_MS after the one before -- the sign-in chain and the redirect hops
// included, through the one queue in request(). The one rule the extension keeps that this cannot is
// "never call anything that returns credentials": the bootstrap is the only way to the API token here.
//
// What this does not do: order anything (the medical file order is a tab-only request and the extension's
// job), extend the session past Maccabi's hour (every session dies 3600 s after login, activity or not,
// measured in maccabi-health's docs/research/SESSION-LIFETIME.md), keep it alive (a run's own requests
// reset the gateway's idle clock, and the page's idle timer is a page's, which this has none of), retry a
// code (one wrong code ends the challenge; a second attempt against the same one is what locks an account),
// or retry a password.
//
// Nothing here logs a credential, a cookie, a token or a record.
const ACS_PATH = '/saml/sp/profile/post/acs';
const BOOTSTRAP = '/sonline/TokenServerAPI/webapi/mac/v4/members/token/full?checksum=&sr_id=';
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_HOPS = 8;

export class SessionEndedError extends Error {
  sessionEnded = true;
}

export class SignInError extends Error {
  constructor(code, status) {
    super(code + (status ? ' (HTTP ' + status + ')' : ''));
    this.code = code;
    this.status = status;
  }
}

// ---- cookies ------------------------------------------------------------------------------------

/**
 * Enough of RFC 6265 for two hosts under one site: host-only and domain cookies, paths, Secure, expiry.
 * Not a general jar; it holds this session's cookies in memory and nothing else.
 */
export class CookieJar {
  #cookies = new Map(); // "domain|path|name" -> { name, value, domain, hostOnly, path, secure, expires }

  clear() {
    this.#cookies.clear();
  }

  /** Stores one Set-Cookie header value received from `url`; ignores one that names an unrelated domain. */
  set(header, url) {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const [pair, ...attrs] = header.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) return;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    let domain = host;
    let hostOnly = true;
    let path = u.pathname.endsWith('/') ? u.pathname : u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1) || '/';
    let secure = false;
    let expires;
    for (const attr of attrs) {
      const [k, ...rest] = attr.split('=');
      const key = k.trim().toLowerCase();
      const v = rest.join('=').trim();
      if (key === 'domain' && v) {
        const d = v.replace(/^\./, '').toLowerCase();
        if (host === d || host.endsWith('.' + d)) {
          domain = d;
          hostOnly = false;
        } else return; // a cookie for another site: refused, as a browser would
      } else if (key === 'path' && v.startsWith('/')) path = v;
      else if (key === 'secure') secure = true;
      else if (key === 'max-age' && /^-?\d+$/.test(v)) expires = Date.now() + Number(v) * 1000;
      else if (key === 'expires' && expires === undefined) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) expires = t;
      }
    }
    const key = domain + '|' + path + '|' + name;
    if (expires !== undefined && expires <= Date.now()) this.#cookies.delete(key);
    else this.#cookies.set(key, { name, value, domain, hostOnly, path, secure, expires });
  }

  /** The Cookie header for a request to `url`, or '' when none apply. */
  get(url) {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname || '/';
    const now = Date.now();
    const out = [];
    for (const c of this.#cookies.values()) {
      if (c.expires !== undefined && c.expires <= now) continue;
      if (c.secure && u.protocol !== 'https:') continue;
      if (c.hostOnly ? host !== c.domain : !(host === c.domain || host.endsWith('.' + c.domain))) continue;
      if (!(path === c.path || (path.startsWith(c.path) && (c.path.endsWith('/') || path[c.path.length] === '/')))) continue;
      out.push(c.name + '=' + c.value);
    }
    return out.join('; ');
  }

  has(name, url) {
    return this.get(url).split('; ').some((p) => p.startsWith(name + '='));
  }
}

// ---- the session --------------------------------------------------------------------------------

/**
 * One member's session: the jar, the API token, and the requests that use them. `core` is the bundled
 * src/cli/index.ts (or, in the tests, the sources): the origins, the legacy page, the pacing and the
 * ended-session markers come from there, so this cannot drift from the collector. `fetch` is Node's
 * unless a test passes its own, and `sleep` real time unless a test makes it instant. Nothing is
 * persisted; a run signs in, exports and ends well inside Maccabi's hour.
 */
export class MaccabiSession {
  jar = new CookieJar();
  /** The portal API's bearer token, from the bootstrap; null until signed in. */
  jwt = null;
  /** The member id the bootstrap names, as a string, and the gender as the token's claims carry it. */
  mid = null;
  gender = undefined;
  /** The portal's legacy navigation session id, from the bootstrap; the legacy pages ask for it. */
  legacySessionId = null;
  /** location.pathname as the extension's tab would report it: the last page this session "loaded". */
  pagePath = '/sonline/';
  #signedIn = false;
  #challenge = null;

  constructor({ core, fetch = globalThis.fetch, now = Date.now, sleep, timeoutMs = 10 * 60_000, maxBytes = 32 * 1024 * 1024 } = {}) {
    if (!core) throw new Error('MaccabiSession needs core (the bundled src/cli/index.ts)');
    this.#core = core;
    this.#portal = core.MACCABI_ORIGIN;
    this.#login = core.LOGIN_ORIGIN;
    this.#summary = new URL(core.SUMMARY_PAGE).pathname;
    this.#fetch = fetch;
    this.#now = now;
    this.#sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#timeoutMs = timeoutMs;
    this.#maxBytes = maxBytes;
  }
  #core;
  #portal;
  #login;
  #summary;
  #fetch;
  #now;
  #sleep;
  #timeoutMs;
  #maxBytes;
  /** The one queue every request goes through: the previous request's end, as a promise. */
  #queue = Promise.resolve();
  /** When the last request came back, by #now; the next goes out core.PACE_MS after it. */
  #lastDone = -Infinity;

  /**
   * One request with the jar, redirects followed by hand so every hop's cookies are kept and an ended
   * session is seen as the portal shows it: a redirect to the login site or to the gateway's logout or
   * policy page (core.signedOutUrl; never a 401 or 403, which on this site mean a bot challenge, not
   * expiry). `redirect: 'manual'` returns the first response, as the extension's fetch does for API
   * calls. Every hop is sent through #send, so the pacing holds across redirects too.
   */
  async request(input, init = {}) {
    let url = new URL(input, this.#portal);
    let method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    const headers = new Headers(init.headers || {});
    headers.delete('cookie');
    const signal = AbortSignal.timeout(this.#timeoutMs);
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const outbound = new Headers(headers);
      const cookies = this.jar.get(url);
      if (cookies) outbound.set('cookie', cookies);
      const response = await this.#send(url.href, { method, body, headers: outbound, redirect: 'manual', signal });
      for (const c of response.headers.getSetCookie?.() || []) this.jar.set(c, url.href);
      const location = response.headers.get('location');
      const redirected = REDIRECTS.has(response.status) && !!location;
      if (!redirected) return Object.assign(response, { finalUrl: url.href, hops: hop });
      const next = new URL(location, url);
      const out = this.#signedIn && url.origin === this.#portal ? this.#core.signedOutUrl(next.href) : null;
      if (out) {
        await response.arrayBuffer().catch(() => {});
        throw new SessionEndedError(out);
      }
      if (init.redirect === 'manual') return Object.assign(response, { finalUrl: url.href, hops: hop, next: next.href });
      if (next.origin !== url.origin) for (const h of ['authorization', 'origin', 'referer']) headers.delete(h);
      if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) {
        method = 'GET';
        body = undefined;
        headers.delete('content-type');
        headers.delete('content-length');
      }
      await response.arrayBuffer().catch(() => {});
      url = next;
    }
    throw new Error('too many redirects from ' + input);
  }

  /**
   * The one place a request leaves: one at a time, each core.PACE_MS after the previous one came back,
   * whoever asked for it (the sign-in, the bootstrap, the collector, a redirect hop). The collector
   * sleeps that long after each of its own, so this adds nothing to its pace; it paces the rest.
   */
  #send(url, init) {
    const turn = this.#queue.then(async () => {
      const wait = this.#core.PACE_MS - (this.#now() - this.#lastDone);
      if (wait > 0) await this.#sleep(wait);
      try {
        return await this.#fetch(url, init);
      } finally {
        this.#lastDone = this.#now();
      }
    });
    this.#queue = turn.catch(() => {});
    return turn;
  }

  /** A JSON call to the login origin's /infosec service, as its own page makes them. */
  async #infosec(path, token, { method = 'GET', body, headers = {} } = {}) {
    const url = new URL(path, this.#login);
    const h = { authorization: 'Bearer ' + token, origin: this.#login, accept: 'application/json; charset=utf-8', 'content-type': 'application/json; charset=utf-8', ...headers };
    if (url.pathname !== '/infosec/auth') {
      url.searchParams.set('_', String(this.#now()));
      Object.assign(h, { 'cache-control': 'no-cache, no-store, must-revalidate', pragma: 'no-cache', expires: '0' });
    }
    const r = await this.request(url, { method: body === undefined ? method : 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: h });
    let value;
    try {
      value = await r.json();
    } catch {
      throw new SignInError('AUTH_RESPONSE_CHANGED', r.status);
    }
    if (!value || typeof value !== 'object') throw new SignInError('AUTH_RESPONSE_CHANGED', r.status);
    if (!r.ok) {
      const code = Number(value.code);
      throw new SignInError(code === 302 ? 'OTP_EXPIRED' : [301, 304].includes(code) ? 'LOGIN_BLOCKED' : [300, 303].includes(code) ? 'OTP_REJECTED' : 'AUTHENTICATION_FAILED', r.status);
    }
    return value;
  }

  /**
   * Starts a sign-in with the ID number: the login page's originJWT, then /infosec/auth, then the phones
   * that can take an SMS. Returns them (number as the site masks it, index) without sending anything.
   */
  async beginSignIn(idNumber) {
    if (typeof idNumber !== 'string' || !/^\d{5,9}$/.test(idNumber)) throw new SignInError('INVALID_ID_FORMAT');
    this.jar.clear();
    this.#signedIn = false;
    this.#challenge = null;
    this.jwt = this.mid = this.legacySessionId = null;
    const login = await this.request(this.#portal + '/');
    const html = await login.text();
    const originJwt = /(?:window\.)?originJWT\s*=\s*["']([A-Za-z0-9_.-]+)["']/.exec(html)?.[1];
    if (!originJwt) throw new SignInError(login.ok ? 'LOGIN_PAGE_CHANGED' : 'LOGIN_PAGE_UNAVAILABLE', login.status);
    const auth = await this.#infosec('/infosec/auth', originJwt, { body: { id: '0-' + Number.parseInt(idNumber, 10), password: '', type: 'none' } });
    const details = await this.#infosec('/infosec/otp/detailsV2', tokenOf(auth));
    const d = details.details;
    if (!d || typeof d !== 'object' || !Array.isArray(d.phones)) throw new SignInError('AUTH_RESPONSE_CHANGED');
    if (d.allowedAge !== true || d.digitalUser !== true) throw new SignInError('LOGIN_NOT_AVAILABLE');
    const phones = d.phones.map((p, index) => ({ index, number: String(p?.number ?? ''), sms: p?.mobile === true && p?.kosher !== true }));
    this.#challenge = { id: '0-' + Number.parseInt(idNumber, 10), senderJwt: tokenOf(details), phones };
    return phones;
  }

  /**
   * Signs in with the password, as the site's "sign in with password" page does: one more /infosec/auth
   * with the password in place of the SMS steps. Call after beginSignIn. A refused password ends the
   * sign-in and is not tried again: that is how an account gets locked. A password that is not one
   * (empty, not a string) is refused here, before anything is sent, and the sign-in is still open.
   */
  async finishSignInWithPassword(password) {
    const ch = this.#challenge;
    if (!ch) throw new SignInError('NO_SIGN_IN_STARTED');
    if (typeof password !== 'string' || !password) throw new SignInError('NO_PASSWORD');
    // From here Maccabi sees an attempt: the sign-in is spent whatever it answers.
    this.#challenge = null;
    const assertion = await this.#infosec('/infosec/auth', ch.senderJwt, { body: { id: ch.id, password, type: 'password' } });
    await this.#land(tokenOf(assertion), '');
  }

  /** Sends the SMS to one of the phones beginSignIn returned (the first that can take one, unless chosen). One per sign-in. */
  async sendCode(phoneIndex) {
    const ch = this.#challenge;
    if (!ch) throw new SignInError('NO_SIGN_IN_STARTED');
    if (ch.validatorJwt) throw new SignInError('CODE_ALREADY_SENT');
    if (!ch.phones.some((p) => p.sms)) throw new SignInError('SMS_NOT_AVAILABLE');
    const index = phoneIndex ?? ch.phones.find((p) => p.sms)?.index;
    if (!ch.phones.some((p) => p.index === index && p.sms)) throw new SignInError('INVALID_PHONE_CHOICE');
    const sent = await this.#infosec('/infosec/otp/generateV2?target=sms&phone=' + index, ch.senderJwt);
    ch.validatorJwt = tokenOf(sent);
  }

  /**
   * Finishes the sign-in with the code from the SMS: validates it, takes the SAML response, posts it to
   * the portal, and runs the portal's bootstrap for the API token. A wrong code ends the sign-in: start
   * again rather than try another code against the same SMS. A code that is not six digits never
   * reaches Maccabi and does not spend the SMS: the right one can still be given.
   */
  async finishSignIn(code) {
    const ch = this.#challenge;
    if (!ch?.validatorJwt) throw new SignInError('CODE_NOT_SENT');
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new SignInError('INVALID_CODE_FORMAT');
    // From here Maccabi sees an attempt: the SMS is spent whatever it answers.
    this.#challenge = null;
    const verified = await this.#infosec('/infosec/otp/validate?otp=' + encodeURIComponent(code), ch.validatorJwt);
    if (verified.status !== 'ok') throw new SignInError('OTP_REJECTED');
    await this.#land(tokenOf(verified), 'home');
  }

  /**
   * The assertion into a portal session: /infosec/response gives the SAML response (the `relay` header
   * is what the site's page sends on that road: "home" after an SMS, empty after a password), the
   * portal's ACS takes it and sets the session cookies, and the bootstrap proves it by handing out the
   * API token -- the one check that cannot pass on a page that bounced back to the login. That
   * bootstrap is the sign-in's only one: the session is complete when this returns.
   */
  async #land(assertionJwt, relay) {
    const handoff = await this.#infosec('/infosec/response', assertionJwt, { headers: { relay } });
    const p = handoff.payload;
    if (handoff.status !== 'ok' || handoff.method !== 'post' || handoff.destination !== this.#portal + ACS_PATH || !p || typeof p.SAMLResponse !== 'string' || typeof p.RelayState !== 'string') {
      throw new SignInError('SAML_RESPONSE_CHANGED');
    }
    const landed = await this.request(this.#portal + ACS_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: this.#login, referer: this.#login + '/' },
      body: new URLSearchParams({ RelayState: p.RelayState, SAMLResponse: p.SAMLResponse }).toString(),
    });
    const html = await landed.text();
    if (!landed.ok || new URL(landed.finalUrl).origin !== this.#portal || /originJWT\s*=/.test(html)) {
      throw new SignInError('PORTAL_SESSION_UNCONFIRMED', landed.status);
    }
    this.#signedIn = true;
    await this.bootstrap();
  }

  /**
   * The portal's own first request after landing: the API token, who is logged in, and the legacy
   * navigation session. Call again to renew the token on a session that is still alive, as the tab
   * gets a fresh one on returning to /sonline/. A session that has ended answers this with the
   * login page instead of JSON, and is reported as ended, not as the site having changed.
   */
  async bootstrap() {
    const r = await this.request(BOOTSTRAP, { headers: { authorization: 'Bearer null', 'content-type': 'application/json' } });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const out = this.#core.signedOutUrl(r.finalUrl);
      if (out || /originJWT\s*=/.test(text)) throw new SessionEndedError(out || 'the login page answered the bootstrap');
      throw new SignInError('BOOTSTRAP_CHANGED', r.status);
    }
    const token = data?.token;
    const logged = data?.logged_customer_info;
    if (!r.ok || !token || token.success !== true || typeof token.content !== 'string' || !token.content || !logged) throw new SignInError('TOKEN_UNAVAILABLE', r.status);
    if (data.current_customer_info && String(data.current_customer_info.member_id) !== String(logged.member_id)) throw new SignInError('DEPENDENT_SELECTED');
    this.jwt = token.content;
    this.mid = String(logged.member_id);
    const claims = this.#core.jwtClaims(this.jwt);
    this.gender = claims?.gender ?? logged.sex;
    this.legacySessionId = typeof data.session_id === 'string' ? data.session_id : null;
    this.#signedIn = true;
    return this.session;
  }

  /** The Session the collector takes (src/core/types.ts). */
  get session() {
    return { mid: this.mid, jwt: this.jwt, gender: this.gender };
  }

  /**
   * Loads the legacy summary page as the extension's tab does before the legacy steps: the /online/
   * services answer only a session that has loaded one of their pages, under the navigation session id
   * the bootstrap returned. Afterwards pagePath() says /online/..., as the tab's would.
   */
  async primeLegacy() {
    if (!this.legacySessionId) throw new SignInError('NO_LEGACY_SESSION');
    const key = 'cookie_sessionId_0_' + this.mid;
    if (!this.jar.has(key, this.#portal + '/')) this.jar.set(key + '=' + this.legacySessionId + '; Path=/; Secure', this.#portal + '/');
    const r = await this.request(this.#summary + '?relative=-1&sr_id=' + encodeURIComponent(this.legacySessionId));
    const html = await r.text();
    const at = new URL(r.finalUrl);
    const out = this.#core.signedOutUrl(r.finalUrl);
    if (out || /originJWT\s*=/.test(html)) throw new SessionEndedError(out || 'the login page answered the legacy page');
    if (!r.ok || at.origin !== this.#portal || at.pathname.toLowerCase().replace(/\/$/, '') !== this.#summary.replace(/\/$/, '')) {
      throw new Error('The legacy page did not open (HTTP ' + r.status + ' at ' + at.pathname + ')');
    }
    this.pagePath = this.#summary;
  }

  /** Back to the portal for the API steps; the extension's tab returns to /sonline/ the same way. */
  backToPortal() {
    this.pagePath = '/sonline/';
  }

  /** The collector's Transport over this session. */
  transport() {
    const absolute = (req) => new URL(req.url, this.#portal).toString();
    return {
      fetch: async (req) => {
        const r = await this.request(absolute(req), { method: req.method, headers: req.headers, body: req.body, redirect: req.redirect });
        const length = Number(r.headers.get('content-length'));
        const head = {
          status: r.status,
          redirected: !!r.next,
          contentType: r.headers.get('content-type') || '',
          retryAfter: r.headers.get('retry-after') || undefined,
          url: r.finalUrl,
        };
        if (length > this.#maxBytes) {
          await r.arrayBuffer().catch(() => {});
          return { ...head, bytes: new Uint8Array(), tooLarge: true };
        }
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (bytes.length > this.#maxBytes) return { ...head, bytes: new Uint8Array(), tooLarge: true };
        return { ...head, bytes };
      },
      // The Transport's contract: never rejects, status 0 on error. The collector only uses it to order, which no script does.
      xhr: async (req) => {
        try {
          const r = await this.request(absolute(req), { method: req.method, headers: req.headers, body: req.body });
          return { status: r.status, text: await r.text() };
        } catch {
          return { status: 0, text: '' };
        }
      },
      pagePath: async () => this.pagePath,
    };
  }
}

/**
 * Which phone the SMS goes to, from the phones beginSignIn returned: `asked` (1-based, as --phone takes it) when
 * given, else the first that can take one -- unless the phones that can show different numbers, when the choice
 * is the member's: null then, with the phones to show. The site lists the same number more than once (seen
 * 2026-10-20: two entries, both 052-*****28), which is not a choice.
 */
export function choosePhone(phones, asked) {
  const able = phones.filter((p) => p.sms);
  if (asked !== undefined) {
    const index = Number(asked) - 1;
    if (!able.some((p) => p.index === index)) throw new SignInError('INVALID_PHONE_CHOICE');
    return index;
  }
  if (!able.length) throw new SignInError('SMS_NOT_AVAILABLE');
  return new Set(able.map((p) => p.number)).size > 1 ? null : able[0].index;
}

function tokenOf(value) {
  if (!value || typeof value.jwt !== 'string' || !value.jwt || /[\r\n]/.test(value.jwt)) throw new SignInError('AUTH_RESPONSE_CHANGED');
  return value.jwt;
}
