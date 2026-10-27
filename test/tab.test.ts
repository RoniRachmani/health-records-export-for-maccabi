// The Maccabi tab (src/extension/background/tab.ts): reading its session, moving it between pages, and sending requests
// from inside it. chrome.* is replaced by a fake tab whose page is a few fields; executeScript answers by the name of the
// in-page function it is handed (inPage.test.ts runs those functions themselves). Timers are fake, so the waits are instant.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionEndedError } from '../src/core';
import {
  currentRoutes,
  currentSession,
  DEFAULT_ROUTES,
  isVisible,
  keepSessionAlive,
  navigate,
  routedTransport,
  tabInfo,
  tabTransport,
} from '../src/extension/background/tab';

const TAB = 7;
const MID = '123456789';
const HOST = 'online.maccabi4u.co.il';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b64({ alg: 'none' }) + '.' + b64(claims) + '.';
}
const freshJwt = () => jwt({ mem_id: MID, gender: 'F', exp: Date.now() / 1000 + 10 * 3600 });

/** The fake tab's page, and what the fake Chrome was asked. Reset before each test. */
let page: { host: string; path: string; cookieMid: string | null; jwt: string | null };
let world: {
  /** Where tabs.update sends the tab: the path it ends up on (a redirect), or a thrown error (a closed tab). */
  land: (url: string) => string | Error;
  /** Snapshots taken on a /sonline/ page before it has issued its token. */
  tokenAfter: number;
  /** A legacy page's answer to a request sent from it. */
  inPage: unknown;
  /** Whether executeScript answers at all. */
  responds: boolean;
  scripts: string[];
  updates: string[];
  memberFetches: number;
  memberStatus: number;
  sessionStore: Record<string, unknown>;
  local: Record<string, unknown>;
  tab: Partial<chrome.tabs.Tab> | Error;
  windowState: string;
};

beforeEach(() => {
  vi.useFakeTimers();
  page = { host: HOST, path: '/sonline/dashboard/', cookieMid: MID, jwt: freshJwt() };
  world = {
    land: (url) => new URL(url).pathname,
    tokenAfter: 0,
    inPage: { ok: true, status: 200, contentType: 'application/json', b64: btoa('{}'), url: 'https://' + HOST + '/online/x' },
    responds: true,
    scripts: [],
    updates: [],
    memberFetches: 0,
    memberStatus: 200,
    sessionStore: {},
    local: {},
    tab: { id: TAB, active: true, windowId: 1 },
    windowState: 'normal',
  };
  let polls = 0;
  const listeners = new Set<(id: number, info: chrome.tabs.OnUpdatedInfo) => void>();
  vi.stubGlobal('__DEV_BRIDGE__', false);
  vi.stubGlobal('chrome', {
    scripting: {
      executeScript: async ({ func, args }: { func: { name: string }; args: unknown[] }) => {
        world.scripts.push(func.name);
        if (!world.responds) return new Promise(() => {});
        switch (func.name) {
          case 'snapshotInPage': {
            if (!page.jwt && /^\/sonline\//.test(page.path) && ++polls > world.tokenAfter) page.jwt = freshJwt();
            return [{ result: { ...page } }];
          }
          case 'clearTokenInPage':
            page.jwt = null;
            polls = 0;
            return [{ result: undefined }];
          case 'activityInPage':
            return [{ result: undefined }];
          case 'fetchInPage':
            return [{ result: world.inPage }];
          case 'xhrInPage':
            return [{ result: { status: 200, text: 'ok:' + (args[0] as { url: string }).url } }];
          case 'pathInPage':
            return [{ result: page.path }];
        }
        throw new Error('unexpected in-page function ' + func.name);
      },
    },
    tabs: {
      onUpdated: { addListener: (f: never) => listeners.add(f), removeListener: (f: never) => listeners.delete(f) },
      update: async (_id: number, { url }: { url: string }) => {
        world.updates.push(url);
        const to = world.land(url);
        if (to instanceof Error) throw to;
        setTimeout(() => {
          page.path = to;
          for (const f of [...listeners]) f(TAB, { status: 'loading' });
          for (const f of [...listeners]) f(TAB, { status: 'complete' });
        }, 200);
      },
      get: async () => {
        if (world.tab instanceof Error) throw world.tab;
        return world.tab;
      },
    },
    windows: { get: async () => ({ state: world.windowState }) },
    storage: {
      session: {
        get: async (k: string) => ({ [k]: world.sessionStore[k] }),
        set: async (o: Record<string, unknown>) => void Object.assign(world.sessionStore, o),
      },
      local: { get: async (k: string) => ({ [k]: world.local[k] }) },
    },
  });
  // The extension's own requests: the member record, whatever was asked.
  vi.stubGlobal('fetch', async () => {
    world.memberFetches++;
    return new Response(JSON.stringify({ first_name_english: 'JUDITH' }), { status: world.memberStatus, headers: { 'content-type': 'application/json' } });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Runs p to the end, letting the fake timers move as far as it needs. */
async function settle<T>(p: Promise<T>): Promise<T> {
  const out = p.then(
    (v) => ({ v }),
    (e: unknown) => ({ e }),
  );
  await vi.runAllTimersAsync();
  const r = await out;
  if ('e' in r) throw r.e;
  return r.v;
}

describe('navigate()', () => {
  it('waits for the page to load, and lets a legacy page settle before its services are called', async () => {
    const t0 = Date.now();
    await settle(navigate(TAB, 'https://' + HOST + '/online/medicalfile/summary/', /^\/online\//));
    expect(page.path).toBe('/online/medicalfile/summary/');
    expect(Date.now() - t0).toBe(200 + 1500);
  });

  it('has no settling wait on a /sonline/ page', async () => {
    const t0 = Date.now();
    await settle(navigate(TAB, 'https://' + HOST + '/sonline/dashboard/', /^\/sonline\//));
    expect(Date.now() - t0).toBe(200);
  });

  it('ends the session when the page lands somewhere else, the tab is closed, or the page never loads', async () => {
    world.land = () => '/sonline/login/';
    await expect(settle(navigate(TAB, 'https://' + HOST + '/online/x/', /^\/online\//))).rejects.toThrow(/led to \/sonline\/login\/ \(logged out\?\)/);
    world.land = () => new Error('No tab with id: 7');
    await expect(settle(navigate(TAB, 'https://' + HOST + '/online/x/', /^\/online\//))).rejects.toThrow(/tab was closed \(No tab with id: 7\)/);
    world.land = (url) => new URL(url).pathname;
    vi.stubGlobal('chrome', { ...chrome, tabs: { ...chrome.tabs, update: async () => {} } });
    await expect(settle(navigate(TAB, 'https://' + HOST + '/online/x/', /^\/online\//))).rejects.toThrow(/did not finish loading/);
  });
});

describe('currentSession()', () => {
  it('reuses the token already in the tab when it is the member’s, has life left, and still works', async () => {
    const s = await settle(currentSession(TAB, 'https://' + HOST + '/sonline/dashboard/', true));
    expect(s).toMatchObject({ mid: MID, gender: 'F' });
    expect(world.updates).toEqual([]);
    expect(world.memberFetches).toBe(1);
  });

  it('reloads for a fresh token when the one in the tab is another member’s, nearly expired, or refused', async () => {
    const cases: (() => void)[] = [
      () => (page.jwt = jwt({ mem_id: '999', exp: Date.now() / 1000 + 36000 })),
      () => (page.jwt = jwt({ mem_id: MID, exp: Date.now() / 1000 + 60 })),
      () => (world.memberStatus = 401),
    ];
    for (const set of cases) {
      world.updates = [];
      world.memberStatus = 200;
      page.jwt = freshJwt();
      set();
      const s = await settle(currentSession(TAB, 'https://' + HOST + '/sonline/dashboard/', true));
      expect(s?.mid).toBe(MID);
      expect(world.updates).toHaveLength(1);
    }
  });

  it('clears the old token, reloads, and polls until the page has issued a new one', async () => {
    world.tokenAfter = 4;
    const s = await settle(currentSession(TAB, 'https://' + HOST + '/sonline/dashboard/'));
    expect(s?.jwt).toBeTruthy();
    expect(world.scripts.filter((n) => n === 'clearTokenInPage')).toHaveLength(1);
    expect(world.scripts.filter((n) => n === 'snapshotInPage').length).toBeGreaterThanOrEqual(5);
  });

  it('gives null when no token comes in 15 s, or when the tab is logged out', async () => {
    world.tokenAfter = 1000;
    expect(await settle(currentSession(TAB, 'https://' + HOST + '/sonline/dashboard/'))).toBeNull();
    world.land = () => '/my.logout.php3';
    world.tokenAfter = 0;
    expect(await settle(currentSession(TAB, 'https://' + HOST + '/sonline/dashboard/'))).toBeNull();
  });
});

describe('tabInfo()', () => {
  it('says whether the tab is on Maccabi Online and logged in, with the member’s name read once per browser session', async () => {
    const tab = { id: TAB, url: 'https://' + HOST + '/sonline/dashboard/' } as chrome.tabs.Tab;
    expect(await tabInfo(tab, true)).toEqual({ onMaccabi: true, loggedIn: true, tabId: TAB, name: 'Judith' });
    expect(await tabInfo(tab, true)).toEqual({ onMaccabi: true, loggedIn: true, tabId: TAB, name: 'Judith' });
    expect(world.memberFetches).toBe(1);
    expect(await tabInfo({ id: 3, url: 'https://mac.maccabi4u.co.il/login' } as chrome.tabs.Tab)).toEqual({ onMaccabi: false, loggedIn: false, tabId: 3 });
    page.jwt = null;
    page.path = '/online/x/';
    expect(await tabInfo(tab)).toEqual({ onMaccabi: true, loggedIn: false, tabId: TAB });
    world.responds = false;
    expect(await settle(tabInfo(tab))).toEqual({ onMaccabi: true, loggedIn: false, tabId: TAB });
  });
});

describe('isVisible()', () => {
  it('is the active tab of a window that is not minimized, and a closed tab ends the session', async () => {
    expect(await isVisible(TAB)).toBe(true);
    world.windowState = 'minimized';
    expect(await isVisible(TAB)).toBe(false);
    world.tab = { id: TAB, active: false, windowId: 1 };
    expect(await isVisible(TAB)).toBe(false);
    world.tab = new Error('No tab');
    await expect(isVisible(TAB)).rejects.toBeInstanceOf(SessionEndedError);
  });
});

describe('keepSessionAlive()', () => {
  it('signals activity in the page, and shrugs off a tab that does not answer', async () => {
    await keepSessionAlive(TAB);
    expect(world.scripts).toEqual(['activityInPage']);
    world.responds = false;
    await settle(keepSessionAlive(TAB));
  });
});

describe('the transports', () => {
  it('sends a request from the tab, after waiting for the tab to be visible, and turns a failure into an error', async () => {
    const waits: string[] = [];
    const t = tabTransport(TAB, async () => void waits.push('visible'));
    const r = await t.fetch({ url: '/online/x', method: 'GET' });
    expect(r).toMatchObject({ status: 200, redirected: false, contentType: 'application/json' });
    expect(new TextDecoder().decode(r.bytes)).toBe('{}');
    expect((await t.xhr!({ url: '/online/y', method: 'GET' })).text).toBe('ok:/online/y');
    expect(await t.pagePath!()).toBe(page.path);
    expect(waits).toEqual(['visible', 'visible']);
    world.inPage = { ok: true, status: 200, tooLarge: true };
    expect((await t.fetch({ url: '/online/big', method: 'GET' })).tooLarge).toBe(true);
    world.inPage = { ok: false, error: 'Failed to fetch' };
    await expect(t.fetch({ url: '/online/x', method: 'GET' })).rejects.toThrow('Failed to fetch');
  });

  it('a tab that stops answering ends the session after a minute', async () => {
    world.responds = false;
    await expect(settle(tabTransport(TAB, async () => {}).xhr!({ url: '/online/y', method: 'GET' }))).rejects.toThrow(/did not respond for 60 s/);
  });

  it('routes /sonline/ from the extension and /online/ from the tab, as DEFAULT_ROUTES says', async () => {
    expect(await currentRoutes()).toBe(DEFAULT_ROUTES);
    const t = routedTransport(TAB, DEFAULT_ROUTES, async () => {});
    await t.fetch({ url: '/sonline/MainAppAPI/x', method: 'GET' });
    expect(world.memberFetches).toBe(1);
    expect(world.scripts).toEqual([]);
    await t.fetch({ url: '/online/x', method: 'GET' });
    expect(world.scripts).toEqual(['fetchInPage']);
  });
});
