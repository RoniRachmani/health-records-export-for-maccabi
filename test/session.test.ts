// scripts/maccabi-session.mjs: the sign-in and the portal bootstrap over fetch, the cookie jar under
// them, and the Transport they give the collector. The site here is a fake of the login origin's
// /infosec chain and the portal's SAML landing, bootstrap and legacy page, with the collector's own
// fake Maccabi (fakes.ts) behind the /sonline/ API, so the test-results step runs end to end through
// a session that never saw a browser. And scripts/redact.mjs, what discover-login.mjs prints through.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Collector, newCtx, runStep, type HttpRequest, type HttpResponse } from '../src/core';
import * as core from '../src/cli/index';
import { folderSink } from '../scripts/headless-lib.mjs';
import { choosePhone, CookieJar, MaccabiSession, SignInError } from '../scripts/maccabi-session.mjs';
import { redactor, spellings } from '../scripts/redact.mjs';
import { fakeMaccabi, htmlParser, MID } from './fakes';

const LOGIN_ORIGIN = core.LOGIN_ORIGIN;
const PORTAL_ORIGIN = core.MACCABI_ORIGIN;
const JWT = (claims: Record<string, unknown>) => 'h.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.s';
const API_JWT = JWT({ mem_id: MID, gender: 'ז', exp: 9999999999 });
const HOME = '/sonline/homepage/NotificationAndUpdates/';
const PASSWORD = 'correct horse';

interface Fake {
  fetch: typeof fetch;
  calls: { method: string; url: string; headers: Record<string, string>; body?: string }[];
  state: { expired: false | 'policy' | 'logout' | 'login-page'; codeSent: number[]; validated?: string; landed: boolean };
  /** How many fetches were in flight at once, at most: 1 when the session sends one at a time. */
  inFlight: { now: number; max: number };
}

/** The login origin, the portal's SAML landing and bootstrap, and the collector's fake Maccabi behind /sonline/. */
function fakeSite(routes: ReturnType<typeof fakeMaccabi>['routes']): Fake {
  const calls: Fake['calls'] = [];
  const state: Fake['state'] = { expired: false, codeSent: [], landed: false };
  const inFlight = { now: 0, max: 0 };
  const json = (obj: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
  const answer = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    const body = typeof init.body === 'string' ? init.body : undefined;
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ method, url: url.href, headers, body });
    const cookie = headers.cookie || '';
    const auth = (headers.authorization || '').replace(/^Bearer /, '');
    // The portal before sign-in: everything bounces to the login page, which carries the originJWT.
    if (url.origin === PORTAL_ORIGIN && !cookie.includes('MRHSession=') && url.pathname === '/') {
      return new Response(null, { status: 302, headers: { location: LOGIN_ORIGIN + '/login?relay=home', 'set-cookie': 'MRHSession=anon; Path=/; Secure; HttpOnly' } });
    }
    if (url.origin === LOGIN_ORIGIN && url.pathname === '/login') {
      return new Response('<html><script>window.originJWT = "' + JWT({ origin: 1 }) + '";</script></html>', { status: 200, headers: { 'content-type': 'text/html', 'set-cookie': 'ISLOGIN=1; Path=/; Secure' } });
    }
    if (url.origin === LOGIN_ORIGIN && url.pathname.startsWith('/infosec/')) {
      if (!headers.origin || !headers['content-type']?.includes('json')) return json({ code: 400 }, 400);
      switch (url.pathname) {
        case '/infosec/auth':
          if (body === JSON.stringify({ id: '0-' + Number(MID), password: '', type: 'none' })) return json({ status: 'ok', jwt: JWT({ step: 'auth' }), message: 'enter the code' });
          // The password road: the same endpoint again, with the token the details step handed out.
          if (auth !== JWT({ step: 'details' })) return json({ code: 401 }, 401);
          if (body === JSON.stringify({ id: '0-' + Number(MID), password: PASSWORD, type: 'password' })) { state.validated = 'password'; return json({ status: 'ok', jwt: JWT({ step: 'verified' }), message: 'signed in' }); }
          // A refused password answers with the same codes as a refused SMS code (303, or 302 when the sign-in went stale); a blocked account with 301.
          if (body?.includes('"password":"locked"')) return json({ code: 301 }, 400);
          if (body?.includes('"password":"stale"')) return json({ code: 302 }, 400);
          if (body?.includes('"type":"password"')) return json({ code: 303 }, 400);
          return json({ code: 400 }, 400);
        case '/infosec/otp/detailsV2':
          if (auth !== JWT({ step: 'auth' }) || !url.searchParams.has('_')) return json({ code: 401 }, 401);
          return json({ jwt: JWT({ step: 'details' }), details: { allowedAge: true, digitalUser: true, phones: [{ number: '050-***1234', mobile: true, kosher: false }, { number: '03-***5678', mobile: false, kosher: false }] } });
        case '/infosec/otp/generateV2':
          if (auth !== JWT({ step: 'details' }) || url.searchParams.get('target') !== 'sms') return json({ code: 401 }, 401);
          state.codeSent.push(Number(url.searchParams.get('phone')));
          return json({ jwt: JWT({ step: 'validator' }) });
        case '/infosec/otp/validate':
          if (auth !== JWT({ step: 'validator' })) return json({ code: 401 }, 401);
          if (url.searchParams.get('otp') !== '123456') return json({ code: 303 }, 400);
          state.validated = url.searchParams.get('otp')!;
          return json({ status: 'ok', jwt: JWT({ step: 'verified' }) });
        case '/infosec/response':
          if (auth !== JWT({ step: 'verified' }) || headers.relay !== (state.validated === 'password' ? '' : 'home')) return json({ code: 401 }, 401);
          return json({ status: 'ok', method: 'post', destination: PORTAL_ORIGIN + '/saml/sp/profile/post/acs', payload: { SAMLResponse: 'c2FtbA==', RelayState: state.validated === 'password' ? '' : 'home' } });
      }
      return json({ code: 404 }, 404);
    }
    if (url.origin === PORTAL_ORIGIN && url.pathname === '/saml/sp/profile/post/acs') {
      if (method !== 'POST' || headers.origin !== LOGIN_ORIGIN || !body?.includes('SAMLResponse=c2FtbA')) return new Response('bad', { status: 400 });
      state.landed = true;
      return new Response(null, { status: 303, headers: { location: HOME, 'set-cookie': 'MRHSession=live; Path=/; Secure; HttpOnly' } });
    }
    // An ended session, each way the portal shows one: the policy page, the gateway's logout page (followed, a 200 web page), or the login page served straight.
    if (url.origin === PORTAL_ORIGIN && state.expired && cookie.includes('MRHSession=live')) {
      if (state.expired === 'policy') return new Response(null, { status: 302, headers: { location: PORTAL_ORIGIN + '/my.policy' } });
      if (state.expired === 'logout' && url.pathname !== '/my.logout.php3') return new Response(null, { status: 302, headers: { location: '/my.logout.php3' } });
      return new Response('<html><script>originJWT = "x.y.z"</script></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (url.origin === PORTAL_ORIGIN && url.pathname === HOME) {
      return new Response(cookie.includes('MRHSession=live') ? '<html>home</html>' : '<html><script>originJWT = "x.y.z"</script></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (url.pathname.startsWith('/sonline/TokenServerAPI/')) {
      if (!cookie.includes('MRHSession=live') || auth !== 'null') return json({}, 401);
      return json({ token: { success: true, content: API_JWT }, logged_customer_info: { member_id: Number(MID), member_id_code: '0', sex: 'ז' }, current_customer_info: { member_id: Number(MID) }, session_id: 'nav-1' });
    }
    if (url.pathname === '/online/medicalfile/summary/') {
      if (!cookie.includes('cookie_sessionId_0_' + MID + '=nav-1') || url.searchParams.get('sr_id') !== 'nav-1') return new Response('login', { status: 302, headers: { location: PORTAL_ORIGIN + '/my.policy' } });
      return new Response('<html>summary</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    // The collector's API, as fakes.ts answers it, with the bearer the bootstrap handed out.
    if (url.origin === PORTAL_ORIGIN) {
      // The JSON API wants the bearer; a signed PDF link (…/pdf/openfile?…&hash=…) is answered on the cookie alone.
      if (url.pathname.startsWith('/sonline/') && !url.pathname.includes('/pdf/') && auth !== API_JWT) return json({}, 401);
      const req: HttpRequest = { url: url.pathname + url.search, method, headers, body };
      let r: HttpResponse | undefined;
      for (const route of routes) if ((r = route(req, url))) break;
      if (!r) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
      return new Response(r.bytes as BodyInit, { status: r.status, headers: { 'content-type': r.contentType } });
    }
    return new Response('nowhere', { status: 404 });
  };
  const paced: typeof globalThis.fetch = async (input, init) => {
    inFlight.now++;
    inFlight.max = Math.max(inFlight.max, inFlight.now);
    try {
      // A tick in flight, so two requests sent together would be seen together.
      await new Promise((r) => setTimeout(r, 1));
      return await answer(input as string | URL | Request, init);
    } finally {
      inFlight.now--;
    }
  };
  return { fetch: paced, calls, state, inFlight };
}

/** A session over the fake, with instant sleeps (the pacing is checked by the clock test below). */
function session(site: Fake, extra: Partial<ConstructorParameters<typeof MaccabiSession>[0]> = {}) {
  return new MaccabiSession({ core, fetch: site.fetch, sleep: async () => {}, ...extra });
}

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('cookie jar', () => {
  it('keeps host-only and domain cookies apart, honours path, Secure and expiry, and refuses a foreign domain', () => {
    const jar = new CookieJar();
    jar.set('a=1; Path=/; Secure; HttpOnly', 'https://online.maccabi4u.co.il/x/y');
    jar.set('b=2; Domain=.maccabi4u.co.il; Path=/', 'https://mac.maccabi4u.co.il/login');
    jar.set('c=3', 'https://online.maccabi4u.co.il/sonline/page');
    jar.set('d=4; Max-Age=0', 'https://online.maccabi4u.co.il/');
    jar.set('e=5; Domain=evil.example', 'https://online.maccabi4u.co.il/');
    expect(jar.get('https://online.maccabi4u.co.il/sonline/api')).toBe('a=1; b=2; c=3');
    expect(jar.get('https://online.maccabi4u.co.il/online/')).toBe('a=1; b=2');
    expect(jar.get('https://mac.maccabi4u.co.il/infosec/auth')).toBe('b=2');
    expect(jar.get('http://online.maccabi4u.co.il/')).toBe('b=2'); // a Secure cookie stays off http
    expect(jar.get('https://other.example/')).toBe('');
    jar.set('a=9; Path=/', 'https://online.maccabi4u.co.il/');
    expect(jar.get('https://online.maccabi4u.co.il/')).toBe('a=9; b=2');
  });
});

describe('the ended-session markers, shared with the collector', () => {
  it('name the login site and the gateway pages, and nothing else', () => {
    expect(core.signedOutUrl(LOGIN_ORIGIN + '/login?relay=home')).toBe('redirected to mac.maccabi4u.co.il/login');
    expect(core.signedOutUrl(PORTAL_ORIGIN + '/my.logout.php3')).toBe('redirected to online.maccabi4u.co.il/my.logout.php3');
    expect(core.signedOutUrl(PORTAL_ORIGIN + '/My.Policy')).toContain('/My.Policy');
    expect(core.signedOutUrl(PORTAL_ORIGIN + '/sonline/homepage/')).toBeNull();
    expect(core.signedOutUrl('https://evil.example/my.policy')).not.toBeNull(); // the path alone names it, wherever it is
    expect(core.signedOutUrl(undefined)).toBeNull();
    expect(core.signedOutUrl('not a url')).toBeNull();
  });
});

describe('session over fetch', () => {
  it('needs core: the origins, the markers and the pace are the collector\'s, not a copy', () => {
    expect(() => new MaccabiSession({} as never)).toThrow(/core/);
  });

  it('signs in through the SAML chain, bootstraps the token once, and runs the test-results step with no browser', async () => {
    const { routes } = fakeMaccabi();
    const site = fakeSite(routes);
    const m = session(site);
    const phones = await m.beginSignIn(MID);
    expect(phones).toEqual([{ index: 0, number: '050-***1234', sms: true }, { index: 1, number: '03-***5678', sms: false }]);
    expect(site.state.codeSent).toEqual([]); // listing the phones sends nothing
    await m.sendCode();
    expect(site.state.codeSent).toEqual([0]);
    await expect(m.sendCode()).rejects.toMatchObject({ code: 'CODE_ALREADY_SENT' }); // one SMS per sign-in
    await expect(m.finishSignIn('000000')).rejects.toMatchObject({ code: 'OTP_REJECTED' });
    // A wrong code ends the challenge: nothing is retried against the same SMS.
    await expect(m.finishSignIn('123456')).rejects.toMatchObject({ code: 'CODE_NOT_SENT' });
    expect(site.state.codeSent).toEqual([0]);

    const m2 = session(site);
    await m2.beginSignIn(MID);
    await m2.sendCode(0);
    await m2.finishSignIn('123456');
    expect(site.state.landed).toBe(true);
    expect(m2.session).toEqual({ mid: MID, jwt: API_JWT, gender: 'ז' });
    expect(m2.legacySessionId).toBe('nav-1');
    // The sign-in ends with the portal's bootstrap, and that is the only one: the gender came from its token.
    expect(site.calls.filter((c) => c.url.includes('/sonline/TokenServerAPI/'))).toHaveLength(1);
    // No secret in any request URL, and the password field went out empty.
    expect(site.calls.every((c) => !c.url.includes('123456') || c.url.includes('/otp/validate'))).toBe(true);
    expect(site.calls.find((c) => c.url.endsWith('/infosec/auth'))!.body).toContain('"password":""');

    const dir = mkdtempSync(join(tmpdir(), 'hrem-session-'));
    dirs.push(dir);
    const sink = folderSink(core, dir, '0.0.0');
    const c = new Collector({ transport: m2.transport(), sink, html: htmlParser(), clock: { now: () => Date.now(), sleep: async () => {} } }, m2.session);
    await runStep(c, newCtx(), 'testResults');
    expect(readdirSync(join(dir, 'test-results')).sort()).toEqual(['details', 'files', 'followed-counter.json', 'history', 'latest-lab-results.json', 'list.json']);
    expect(readdirSync(join(dir, 'test-results/details'))).toHaveLength(4);
    expect(sink.problems).toEqual([]);
    // Every API request carried the bootstrap's bearer and the portal cookie, from Node.
    const api = site.calls.filter((c) => c.url.includes('/sonline/TestResultsAPI/') && !c.url.includes('/pdf/'));
    expect(api.length).toBeGreaterThan(5);
    expect(api.every((c) => c.headers.authorization === 'Bearer ' + API_JWT && c.headers.cookie?.includes('MRHSession=live'))).toBe(true);
    // Nothing was sent to the site's keep-alive: a Node session has no page to go idle.
    expect(site.calls.some((c) => c.url.includes('/alive'))).toBe(false);

    expect(await m2.transport().pagePath()).toBe('/sonline/');
    await m2.primeLegacy();
    expect(site.calls.at(-1)!.url).toBe(core.SUMMARY_PAGE + '?relative=-1&sr_id=nav-1');
    expect(await m2.transport().pagePath()).toBe('/online/medicalfile/summary/');
    m2.backToPortal();
    expect(await m2.transport().pagePath()).toBe('/sonline/');
    await m2.bootstrap(); // a fresh token on returning, as the tab takes one
    expect(site.calls.filter((c) => c.url.includes('/sonline/TokenServerAPI/'))).toHaveLength(2);
  });

  it('sends every request one at a time, PACE_MS after the previous one came back, the sign-in chain and redirect hops included', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    // A clock that moves only when the session sleeps: every gap it asks for is then exactly what it adds.
    let t = 1_000_000;
    const sleeps: number[] = [];
    const m = new MaccabiSession({ core, fetch: site.fetch, now: () => t, sleep: async (ms: number) => { sleeps.push(ms); t += ms; } });
    await m.beginSignIn(MID);
    await m.sendCode();
    await m.finishSignIn('123456');
    // GET / (302) + login page + auth + detailsV2 + generateV2 + validate + response + ACS (303) + home + bootstrap.
    expect(site.calls).toHaveLength(10);
    expect(sleeps).toHaveLength(site.calls.length - 1); // the first goes at once, every other waits
    expect(sleeps.every((ms) => ms === core.PACE_MS)).toBe(true);
    // Three requests asked for together leave one at a time, in the order asked.
    site.calls.length = 0;
    const tr = m.transport();
    await Promise.all(['a', 'b', 'c'].map((x) => tr.fetch({ url: '/sonline/MainAppAPI/webapi/mac/v1/members/0/' + MID + '?x=' + x, method: 'GET', redirect: 'manual' })));
    expect(site.inFlight.max).toBe(1);
    expect(site.calls.map((c) => new URL(c.url).searchParams.get('x'))).toEqual(['a', 'b', 'c']);
    expect(sleeps.slice(-3).every((ms) => ms === core.PACE_MS)).toBe(true);
  });

  it('refuses a code that is not six digits before it is sent, so the SMS is not spent and the right code still works', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    const m = session(site);
    await m.beginSignIn(MID);
    await m.sendCode();
    for (const bad of ['123 456', '12345', '1234567', '12345a', '', undefined as unknown as string]) {
      await expect(m.finishSignIn(bad)).rejects.toMatchObject({ code: 'INVALID_CODE_FORMAT' });
    }
    expect(site.calls.some((c) => c.url.includes('/otp/validate'))).toBe(false); // nothing reached Maccabi
    expect(site.state.codeSent).toEqual([0]); // and no second text
    await m.finishSignIn('123456');
    expect(m.session.jwt).toBe(API_JWT);
  });

  it('signs in with the password instead of an SMS, never retries a refused one, and refuses an empty one before sending', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    const m = session(site);
    await m.beginSignIn(MID);
    for (const bad of ['', undefined as unknown as string, 42 as unknown as string]) {
      await expect(m.finishSignInWithPassword(bad)).rejects.toMatchObject({ code: 'NO_PASSWORD' });
    }
    expect(site.calls.filter((c) => c.url.endsWith('/infosec/auth'))).toHaveLength(1); // the sign-in is still open: nothing was sent
    await expect(m.finishSignInWithPassword('wrong')).rejects.toMatchObject({ code: 'PASSWORD_REJECTED' });
    await expect(m.finishSignInWithPassword(PASSWORD)).rejects.toMatchObject({ code: 'NO_SIGN_IN_STARTED' });
    expect(site.state.codeSent).toEqual([]); // no SMS on this road

    const m2 = session(site);
    await m2.beginSignIn(MID);
    await m2.finishSignInWithPassword(PASSWORD);
    expect(site.state.landed).toBe(true);
    expect(site.state.codeSent).toEqual([]);
    expect(m2.session).toEqual({ mid: MID, jwt: API_JWT, gender: 'ז' });
    const auths = site.calls.filter((c) => c.url.endsWith('/infosec/auth'));
    expect(auths.map((c) => JSON.parse(c.body!).type)).toEqual(['none', 'password', 'none', 'password']);
    expect(site.calls.find((c) => c.url.includes('/infosec/response'))!.headers.relay).toBe('');
    expect(site.calls.filter((c) => c.url.includes('/sonline/TokenServerAPI/'))).toHaveLength(1);
  });

  it('names a refused password as the password, never as an SMS code, and a blocked account as blocked', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    const refusal = async (password: string) => {
      const m = session(site);
      await m.beginSignIn(MID);
      return m.finishSignInWithPassword(password).then(() => 'signed in', (e) => e.code);
    };
    expect(await refusal('wrong')).toBe('PASSWORD_REJECTED'); // 303, which the SMS road calls OTP_REJECTED
    expect(await refusal('stale')).toBe('PASSWORD_REJECTED'); // 302, which the SMS road calls OTP_EXPIRED
    expect(await refusal('locked')).toBe('LOGIN_BLOCKED');
    expect(site.state.codeSent).toEqual([]);
  });

  it('reports an ended session each way the portal shows it, and a bot challenge as a plain status', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    const m = session(site);
    await m.beginSignIn(MID);
    await m.sendCode();
    await m.finishSignIn('123456');
    const api = { url: '/sonline/MainAppAPI/webapi/mac/v1/members/0/' + MID, method: 'GET', redirect: 'manual' as const };
    // The policy page.
    site.state.expired = 'policy';
    await expect(m.transport().fetch(api)).rejects.toMatchObject({ sessionEnded: true });
    // The gateway's logout page, where the hour runs out: a followed redirect to a 200 web page. The
    // bootstrap on returning from the legacy steps must say the session ended, not that the site changed.
    site.state.expired = 'logout';
    await expect(m.transport().fetch(api)).rejects.toMatchObject({ sessionEnded: true, message: expect.stringContaining('/my.logout.php3') });
    await expect(m.transport().fetch({ ...api, redirect: undefined })).rejects.toBeInstanceOf(core.SessionEndedError);
    await expect(m.bootstrap()).rejects.toBeInstanceOf(core.SessionEndedError);
    await expect(m.primeLegacy()).rejects.toBeInstanceOf(core.SessionEndedError);
    // The login page served straight, with no redirect at all.
    site.state.expired = 'login-page';
    await expect(m.bootstrap()).rejects.toBeInstanceOf(core.SessionEndedError);
    await expect(m.primeLegacy()).rejects.toBeInstanceOf(core.SessionEndedError);
    site.state.expired = false;
    const forbidden = new MaccabiSession({ core, sleep: async () => {}, fetch: (async () => new Response('challenge', { status: 403, headers: { 'content-type': 'text/html' } })) as typeof fetch });
    const r = await forbidden.transport().fetch({ url: '/sonline/x', method: 'GET' });
    expect(r.status).toBe(403); // the collector decides what a 403 means; the session does not end on it
  });

  it('does not take a redirect to the login site before sign-in for an ended session', async () => {
    // The very first request of a sign-in bounces to the login page: that is the chain, not an ending.
    const site = fakeSite(fakeMaccabi().routes);
    const m = session(site);
    await expect(m.beginSignIn(MID)).resolves.toHaveLength(2);
  });

  it('refuses a bad ID, and a sign-in whose phones cannot take an SMS', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    const m = session(site);
    await expect(m.beginSignIn('12a')).rejects.toBeInstanceOf(SignInError);
    await expect(m.beginSignIn(undefined as unknown as string)).rejects.toMatchObject({ code: 'INVALID_ID_FORMAT' });
    await expect(m.sendCode()).rejects.toMatchObject({ code: 'NO_SIGN_IN_STARTED' });
    await m.beginSignIn(MID);
    await expect(m.sendCode(1)).rejects.toMatchObject({ code: 'INVALID_PHONE_CHOICE' }); // a landline
  });
});

describe('which phone the SMS goes to', () => {
  const mobile = (index: number, number: string) => ({ index, number, sms: true });
  const landline = (index: number, number: string) => ({ index, number, sms: false });

  it('takes the one phone that can, and the first when the site lists the same number twice (seen live 2026-10-20)', () => {
    expect(choosePhone([mobile(0, '050-***1234'), landline(1, '03-***5678')])).toBe(0);
    expect(choosePhone([landline(0, '03-***5678'), mobile(1, '052-*****28'), mobile(2, '052-*****28')])).toBe(1);
  });

  it('leaves a choice between different numbers to the member, and takes --phone as given', () => {
    const phones = [mobile(0, '050-***1234'), mobile(1, '052-***9876')];
    expect(choosePhone(phones)).toBeNull();
    expect(choosePhone(phones, '2')).toBe(1);
    expect(() => choosePhone(phones, '3')).toThrow(/INVALID_PHONE_CHOICE/);
    expect(() => choosePhone([landline(0, '03-***5678')], '1')).toThrow(/INVALID_PHONE_CHOICE/);
    expect(() => choosePhone([landline(0, '03-***5678')])).toThrow(/SMS_NOT_AVAILABLE/);
  });
});

describe('redaction (scripts/redact.mjs, what discover-login prints through)', () => {
  it('knows every spelling a secret has on the wire, and none for an empty one', () => {
    expect(spellings('ab"cd\\12 x')).toEqual(expect.arrayContaining(['ab"cd\\12 x', 'ab\\"cd\\\\12 x', 'ab%22cd%5C12%20x', 'ab%22cd%5C12+x']));
    expect(spellings('')).toEqual([]);
    expect(spellings(undefined)).toEqual([]);
  });

  it('replaces a JSON-escaped password, blanks credential fields by name, and never prints the ID', () => {
    const redact = redactor({ username: '012345678', password: 'ab"cd\\12' });
    const body = JSON.stringify({ id: '0-12345678', password: 'ab"cd\\12', type: 'password' });
    expect(body).toContain('ab\\"cd\\\\12'); // what the browser sends
    const out = redact(body);
    expect(out).not.toContain('cd');
    expect(out).not.toContain('12345678');
    expect(out).toContain('"password":"<PASSWORD>"');
    expect(out).toContain('"id":"<ID>"');
    // In a query string, the ID and the password are URL-encoded.
    expect(redact('/infosec/otp/validate?otp=123456&id=0-12345678&p=ab%22cd%5C12')).toBe('/infosec/otp/validate?otp=123456&id=0-<ID>&p=<PASSWORD>');
    // A form body uses + for a space.
    expect(redactor({ username: '12345678', password: 'two words' })('p=two+words&u=12345678')).toBe('p=<PASSWORD>&u=<ID>');
    expect(redact('Bearer ' + 'h'.repeat(12) + '.' + 'x'.repeat(20) + '.' + 'y'.repeat(20))).toBe('Bearer <jwt>');
  });

  it('leaves text alone when a credential is empty, instead of putting the label between every character', () => {
    expect(redactor({ username: '12345678', password: '' })('https://online.maccabi4u.co.il/')).toBe('https://online.maccabi4u.co.il/');
    expect(redactor({})('https://online.maccabi4u.co.il/')).toBe('https://online.maccabi4u.co.il/');
    expect(redactor({ username: '12345678', password: '' })(undefined)).toBeUndefined();
  });
});
