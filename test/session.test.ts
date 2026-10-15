// scripts/maccabi-session.mjs: the sign-in and the portal bootstrap over fetch, the cookie jar under
// them, and the Transport they give the collector. The site here is a fake of the login origin's
// /infosec chain and the portal's SAML landing, bootstrap and keep-alive, with the collector's own
// fake Maccabi (fakes.ts) behind the /sonline/ API, so the test-results step runs end to end through
// a session that never saw a browser.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Collector, newCtx, runStep, type HttpRequest, type HttpResponse } from '../src/core';
import * as core from '../src/cli/index';
import { folderSink } from '../scripts/headless-lib.mjs';
import { CookieJar, LOGIN_ORIGIN, MaccabiSession, PORTAL_ORIGIN, SessionEndedError, SignInError } from '../scripts/maccabi-session.mjs';
import { fakeMaccabi, htmlParser, MID } from './fakes';

const JWT = (claims: Record<string, unknown>) => 'h.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.s';
const API_JWT = JWT({ mem_id: MID, gender: 'ז', exp: 9999999999 });
const HOME = '/sonline/homepage/NotificationAndUpdates/';

interface Fake {
  fetch: typeof fetch;
  calls: { method: string; url: string; headers: Record<string, string>; body?: string }[];
  state: { expired: boolean; codeSent?: number; validated?: string; landed: boolean };
}

/** The login origin, the portal's SAML landing and bootstrap, and the collector's fake Maccabi behind /sonline/. */
function fakeSite(routes: ReturnType<typeof fakeMaccabi>['routes']): Fake {
  const calls: Fake['calls'] = [];
  const state: Fake['state'] = { expired: false, landed: false };
  const json = (obj: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
  const fetch: typeof globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
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
          if (body === JSON.stringify({ id: '0-' + Number(MID), password: 'correct horse', type: 'password' })) { state.validated = 'password'; return json({ status: 'ok', jwt: JWT({ step: 'verified' }), message: 'signed in' }); }
          if (body?.includes('"type":"password"')) return json({ code: 301 }, 400);
          return json({ code: 400 }, 400);
        case '/infosec/otp/detailsV2':
          if (auth !== JWT({ step: 'auth' }) || !url.searchParams.has('_')) return json({ code: 401 }, 401);
          return json({ jwt: JWT({ step: 'details' }), details: { allowedAge: true, digitalUser: true, phones: [{ number: '050-***1234', mobile: true, kosher: false }, { number: '03-***5678', mobile: false, kosher: false }] } });
        case '/infosec/otp/generateV2':
          if (auth !== JWT({ step: 'details' }) || url.searchParams.get('target') !== 'sms') return json({ code: 401 }, 401);
          state.codeSent = Number(url.searchParams.get('phone'));
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
    if (url.origin === PORTAL_ORIGIN && state.expired && cookie.includes('MRHSession=live')) {
      return new Response(null, { status: 302, headers: { location: PORTAL_ORIGIN + '/my.policy' } });
    }
    if (url.origin === PORTAL_ORIGIN && url.pathname === HOME) {
      return new Response(cookie.includes('MRHSession=live') ? '<html>home</html>' : '<html><script>originJWT = "x.y.z"</script></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (url.pathname.startsWith('/sonline/TokenServerAPI/')) {
      if (!cookie.includes('MRHSession=live') || auth !== 'null') return json({}, 401);
      return json({ token: { success: true, content: API_JWT }, logged_customer_info: { member_id: Number(MID), member_id_code: '0', sex: 'ז' }, current_customer_info: { member_id: Number(MID) }, session_id: 'nav-1' });
    }
    if (url.pathname.endsWith('/v1/alive')) return json({ alive: true });
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
  }) as typeof fetch;
  return { fetch, calls, state };
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

describe('session over fetch', () => {
  it('signs in through the SAML chain, bootstraps the token, and runs the test-results step with no browser', async () => {
    const { routes } = fakeMaccabi();
    const site = fakeSite(routes);
    const m = new MaccabiSession({ fetch: site.fetch });
    const phones = await m.beginSignIn(MID);
    expect(phones).toEqual([{ index: 0, number: '050-***1234', sms: true }, { index: 1, number: '03-***5678', sms: false }]);
    expect(site.state.codeSent).toBeUndefined(); // listing the phones sends nothing
    await m.sendCode();
    expect(site.state.codeSent).toBe(0);
    await expect(m.finishSignIn('000000')).rejects.toMatchObject({ code: 'OTP_REJECTED' });
    // A wrong code ends the challenge: nothing is retried against the same SMS.
    await expect(m.finishSignIn('123456')).rejects.toMatchObject({ code: 'CODE_NOT_SENT' });

    const m2 = new MaccabiSession({ fetch: site.fetch });
    await m2.beginSignIn(MID);
    await m2.sendCode(0);
    await m2.finishSignIn('123456');
    expect(site.state.landed).toBe(true);
    expect(m2.session).toEqual({ mid: MID, jwt: API_JWT, gender: 'ז' });
    expect(m2.legacySessionId).toBe('nav-1');
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

    expect(await m2.keepAlive()).toBe(200);
    expect(await m2.transport().pagePath()).toBe('/sonline/');
    await m2.primeLegacy();
    expect(await m2.transport().pagePath()).toBe('/online/medicalfile/summary/');
    m2.backToPortal();
    expect(await m2.transport().pagePath()).toBe('/sonline/');
  });

  it('signs in with the password instead of an SMS, and never retries a refused one', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    const m = new MaccabiSession({ fetch: site.fetch });
    await m.beginSignIn(MID);
    await expect(m.finishSignInWithPassword('wrong')).rejects.toMatchObject({ code: 'LOGIN_BLOCKED' });
    await expect(m.finishSignInWithPassword('correct horse')).rejects.toMatchObject({ code: 'NO_SIGN_IN_STARTED' });
    expect(site.state.codeSent).toBeUndefined(); // no SMS on this road

    const m2 = new MaccabiSession({ fetch: site.fetch });
    await m2.beginSignIn(MID);
    await m2.finishSignInWithPassword('correct horse');
    expect(site.state.landed).toBe(true);
    expect(site.state.codeSent).toBeUndefined();
    expect(m2.session).toEqual({ mid: MID, jwt: API_JWT, gender: 'ז' });
    const auths = site.calls.filter((c) => c.url.endsWith('/infosec/auth'));
    expect(auths.map((c) => JSON.parse(c.body!).type)).toEqual(['none', 'password', 'none', 'password']);
    expect(site.calls.find((c) => c.url.includes('/infosec/response'))!.headers.relay).toBe('');
  });

  it('reports an ended session the way the portal shows it, and a bot challenge as a plain status', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    const m = new MaccabiSession({ fetch: site.fetch });
    await m.beginSignIn(MID);
    await m.sendCode();
    await m.finishSignIn('123456');
    site.state.expired = true;
    await expect(m.keepAlive()).rejects.toBeInstanceOf(SessionEndedError);
    await expect(m.transport().fetch({ url: '/sonline/MainAppAPI/webapi/mac/v1/members/0/' + MID, method: 'GET', redirect: 'manual' })).rejects.toMatchObject({ sessionEnded: true });
    site.state.expired = false;
    const forbidden = new MaccabiSession({ fetch: (async () => new Response('challenge', { status: 403, headers: { 'content-type': 'text/html' } })) as typeof fetch });
    const r = await forbidden.transport().fetch({ url: '/sonline/x', method: 'GET' });
    expect(r.status).toBe(403); // the collector decides what a 403 means; the session does not end on it
  });

  it('refuses a bad ID, and a sign-in whose phones cannot take an SMS', async () => {
    const site = fakeSite(fakeMaccabi().routes);
    const m = new MaccabiSession({ fetch: site.fetch });
    await expect(m.beginSignIn('12a')).rejects.toBeInstanceOf(SignInError);
    await expect(m.sendCode()).rejects.toMatchObject({ code: 'NO_SIGN_IN_STARTED' });
    await m.beginSignIn(MID);
    await expect(m.sendCode(1)).rejects.toMatchObject({ code: 'INVALID_PHONE_CHOICE' }); // a landline
  });
});
