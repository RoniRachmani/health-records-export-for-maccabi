// The run loop (src/extension/background/runner.ts) decides what happens when something goes wrong partway: a
// session that ends, a site that asks to slow down, a step that throws, a Cancel, a service worker that restarts,
// a download that fails. It is the extension's wiring, so it is tested as it is, with chrome.* and the modules
// around it replaced: the tab, the staging, the offscreen document, and the collector's steps, scripted per test.
// What is real is runner.ts itself, PLAN and its resume rules (shared/state.ts), and core's errors and order rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_LAYOUT, PLAN, type PlanStep, type RunState } from '../src/extension/shared/state';
import { RateLimitedError, SessionEndedError, type OrderResult, type Session } from '../src/core';

const MEMBER: Session = { mid: '123456789', jwt: 'jwt', gender: 'F' };
const TAB = 7;

// ---- the world around the runner ----------------------------------------------------------------

/** What each test scripts and then reads back. Reset before each test. */
const world = {
  /** Steps run through core's runStep, in order, including re-runs. */
  ran: [] as string[],
  /** What a step does when it runs: throw, wait, or nothing (the default). */
  step: {} as Partial<Record<PlanStep, (attempt: number) => Promise<void> | void>>,
  orders: 0,
  order: { ordered: true, to_date: '2026-10-26', from_date: '2016-10-26' } as OrderResult,
  session: MEMBER as Session | null,
  visible: true,
  sessionLookups: 0,
  navigations: [] as string[],
  /** The tab's page: where it was last sent, or /sonline/ once a session was taken from it. */
  path: '/sonline/',
  stagingCleared: 0,
  notices: [] as string[],
  downloads: 0,
  local: {} as Record<string, unknown>,
  sessionStore: {} as Record<string, unknown>,
  /** The service worker was killed: from then on its writes never land, and never return. */
  dead: false,
  /** Kills the worker as it writes these items, before they land. */
  dieOn: undefined as ((items: Record<string, unknown>) => boolean) | undefined,
  /** Whether keepListedMedicalFile was asked, i.e. the run took no new medical file. */
  keptListed: false,
};

/** Kills the service worker where it stands: what it has not written by now is lost, and it never goes on. */
function die(): Promise<never> {
  world.dead = true;
  return new Promise(() => {});
}

vi.mock('../src/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('../src/core')>();
  return {
    ...core,
    runStep: vi.fn(async (_c: unknown, _ctx: unknown, step: PlanStep) => {
      world.ran.push(step);
      const attempt = world.ran.filter((s) => s === step).length;
      await world.step[step]?.(attempt);
    }),
    placeOrder: vi.fn(async (_c: unknown, opts?: { beforeSend?: () => Promise<void> }) => {
      await opts?.beforeSend?.();
      world.ran.push('orderMedicalFile');
      world.orders++;
      await world.step.orderMedicalFile?.(world.orders);
      return world.order;
    }),
    waitMedicalFile: vi.fn(async () => {
      world.ran.push('waitMedicalFile');
      return { ready: true };
    }),
    keepListedMedicalFile: vi.fn(async () => {
      world.ran.push('waitMedicalFile');
      world.keptListed = true;
    }),
  };
});

vi.mock('../src/extension/background/tab', () => ({
  currentRoutes: async () => ({ sonline: 'extension', online: 'tab' }),
  currentSession: async () => {
    world.sessionLookups++;
    world.path = '/sonline/';
    return world.session;
  },
  extensionFetch: async () => ({ status: 200, redirected: false, contentType: '', bytes: new Uint8Array() }),
  isVisible: async () => world.visible,
  keepSessionAlive: async () => {},
  navigate: async (_tab: number, url: string) => {
    world.navigations.push(url);
    world.path = new URL(url).pathname;
  },
  routedTransport: () => ({ fetch: async () => ({}), xhr: async () => ({}), pagePath: async () => '/sonline/' }),
  snapshot: async () => ({ host: 'online.maccabi4u.co.il', path: world.path, cookieMid: null, jwt: 'jwt' }),
}));

vi.mock('../src/extension/shared/staging', () => ({
  clearProblemsOfStep: async () => {},
  clearStaging: async () => {
    world.stagingCleared++;
  },
  listMeta: async () => [],
  listProblems: async () => [],
  putTextDirect: async () => {},
  setCurrentPart: () => {},
  setCurrentStep: () => {},
  stagedTotals: async () => ({ files: 0, bytes: 0, byKey: {} }),
  stagingKey: (step: string, part: string) => (part ? step + ':' + part : step),
  stagingSink: {},
}));

vi.mock('../src/extension/background/offscreenClient', () => ({
  callOffscreen: async () => ({ url: 'blob:zip', bytes: 1000, files: 3 }),
  closeOffscreen: async () => {},
  offscreenHtml: {},
  revokeBlob: async () => {},
}));

vi.mock('../src/extension/background/rawDump', () => ({ capturingTransport: (t: unknown) => t, rawDumpOn: async () => false }));

vi.mock('../src/extension/background/ui', () => ({
  updateBadge: async () => {},
  notify: async (_kind: string, title: string) => {
    world.notices.push(title);
  },
}));

/** chrome.* as far as the runner reaches it: the two stores, alarms, downloads, tabs and the manifest. */
function fakeChrome() {
  const store = (data: Record<string, unknown>) => ({
    get: async (key: string) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
    set: async (items: Record<string, unknown>) => {
      if (world.dead || world.dieOn?.(items)) return die();
      Object.assign(data, structuredClone(items));
    },
    remove: async (key: string) => void delete data[key],
  });
  return {
    storage: { local: store(world.local), session: store(world.sessionStore) },
    alarms: { create: async () => {}, clear: async () => true },
    runtime: { getPlatformInfo: async () => ({}), getManifest: () => ({ version: '0.0.0' }) },
    downloads: {
      download: async () => ++world.downloads,
      search: async () => [],
      show: () => {},
    },
    tabs: { get: async () => ({ id: TAB, url: 'https://online.maccabi4u.co.il/sonline/dashboard' }) },
  };
}

type Runner = typeof import('../src/extension/background/runner');

/** A fresh runner module, as a fresh service worker has: nothing in memory, only what storage holds. */
async function freshRunner(): Promise<Runner> {
  vi.resetModules();
  return import('../src/extension/background/runner');
}

const stored = () => world.local.run as RunState | undefined;

/** Waits for the loop to stop running (paused, failed, cancelled or handed to the download). */
async function settled(): Promise<RunState | undefined> {
  await vi.waitFor(() => expect(stored()?.status).not.toBe('running'), { timeout: 5000, interval: 5 });
  // The loop's own clean-up (and a discard) comes after the last save.
  await new Promise((r) => setTimeout(r, 20));
  return stored();
}

const steps = (from: PlanStep, to?: PlanStep) => PLAN.slice(PLAN.indexOf(from), to ? PLAN.indexOf(to) + 1 : undefined);
/** What runStep and the medical-file mocks see of a plan: every step but the ones the runner does itself. */
const collected = (list: readonly PlanStep[]) => list.filter((s) => !['openLegacyPage', 'returnToSonline', 'save'].includes(s));

beforeEach(() => {
  Object.assign(world, {
    ran: [], step: {}, orders: 0, order: { ordered: true, to_date: '2026-10-26', from_date: '2016-10-26' }, session: MEMBER,
    visible: true, sessionLookups: 0, navigations: [], path: '/sonline/', stagingCleared: 0, notices: [], downloads: 0, local: {}, sessionStore: {},
    dead: false, dieOn: undefined, keptListed: false,
  });
  vi.stubGlobal('chrome', fakeChrome());
  vi.stubGlobal('__DEV_BRIDGE__', false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- the tests ----------------------------------------------------------------------------------

describe('a run', () => {
  it('runs every step of PLAN once, in order, and finishes when the download does', async () => {
    const runner = await freshRunner();
    await runner.start(TAB);
    const run = await settled();
    expect(run?.status).toBe('saving');
    expect(world.ran).toEqual(collected(PLAN));
    expect(world.orders).toBe(1);
    expect(world.downloads).toBe(1);

    await runner.onDownloadChanged({ id: run!.downloadId!, state: { current: 'complete' } } as chrome.downloads.DownloadDelta);
    expect(stored()).toMatchObject({ status: 'done', percent: 100, next: PLAN.length, zipBytes: 1000 });
    expect(world.notices).toEqual(['Export ready']);
    expect(world.sessionStore.session).toBeUndefined();
  });

  it('refuses to start beside one that is still going', async () => {
    world.local.run = { status: 'paused_session', next: 3, nextStep: PLAN[3], layout: FILE_LAYOUT } as RunState;
    const runner = await freshRunner();
    await expect(runner.start(TAB)).rejects.toThrow(/already in progress/);
    expect(world.ran).toEqual([]);
  });
});

describe('a session that ends', () => {
  it('is reconnected twice, then the run pauses at the step that failed', async () => {
    world.step.visits = () => {
      throw new SessionEndedError('gone');
    };
    const runner = await freshRunner();
    await runner.start(TAB);
    const run = await settled();
    expect(run).toMatchObject({ status: 'paused_session', next: PLAN.indexOf('visits') });
    expect(world.ran.filter((s) => s === 'visits')).toHaveLength(3);
    // One lookup to start, one for returnToSonline, and one for each reconnect.
    expect(world.sessionLookups).toBe(4);
    expect(world.notices).toEqual(['Export paused']);
    expect(world.stagingCleared).toBe(1); // only Start's: the files collected so far are kept
  });

  it('gets two more tries at a later step once the run is past the one that failed', async () => {
    world.step.visits = (attempt) => {
      if (attempt <= 2) throw new SessionEndedError('gone');
    };
    world.step.referrals = (attempt) => {
      if (attempt <= 2) throw new SessionEndedError('gone again');
    };
    const runner = await freshRunner();
    await runner.start(TAB);
    expect((await settled())?.status).toBe('saving');
    expect(world.ran.filter((s) => s === 'referrals')).toHaveLength(3);
  });

  it('pauses without retrying when another member is logged in to the tab', async () => {
    world.step.visits = () => {
      world.session = { ...MEMBER, mid: '987654321' };
      throw new SessionEndedError('gone');
    };
    const runner = await freshRunner();
    await runner.start(TAB);
    expect(await settled()).toMatchObject({ status: 'paused_session', next: PLAN.indexOf('visits') });
    expect(world.ran.filter((s) => s === 'visits')).toHaveLength(1);
  });

  it('on a legacy step, rewinds to the page that step needs, and never orders the medical file twice', async () => {
    world.step.hospitalStays = (attempt) => {
      if (attempt === 1) throw new SessionEndedError('gone');
    };
    const runner = await freshRunner();
    await runner.start(TAB);
    expect((await settled())?.status).toBe('saving');
    // The legacy page is opened again, and the order step passes through without ordering.
    expect(world.navigations.filter((u) => u.includes('/online/medicalfile/summary'))).toHaveLength(2);
    expect(world.orders).toBe(1);
    expect(world.ran).toEqual([
      ...collected(steps('orderMedicalFile', 'hospitalStays')),
      // The rewind to openLegacyPage: the order is settled and passes through, and the steps after it run again.
      ...collected(steps('profileAndDoctors')),
    ]);
  });
});

describe('a run that cannot go on', () => {
  it('stops when the site asks it to slow down, and keeps what it has', async () => {
    world.step.referrals = () => {
      throw new RateLimitedError(600);
    };
    const runner = await freshRunner();
    await runner.start(TAB);
    const run = await settled();
    expect(run).toMatchObject({ status: 'error', next: PLAN.indexOf('referrals') });
    expect(run?.message).toMatch(/slow down/);
    expect(world.ran.at(-1)).toBe('referrals');
    expect(world.stagingCleared).toBe(1);
  });

  it('stops on an unexpected error with what it was', async () => {
    world.step.letters = () => {
      throw new Error('kaboom');
    };
    const runner = await freshRunner();
    await runner.start(TAB);
    const run = await settled();
    expect(run).toMatchObject({ status: 'error', next: PLAN.indexOf('letters'), errorDetail: 'kaboom' });
    expect(world.notices).toEqual(['Export stopped']);
  });
});

describe('Cancel', () => {
  it('stops the run at its next request and discards everything', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let runner!: Runner;
    world.step.visits = async () => {
      await runner.cancel();
      release();
    };
    runner = await freshRunner();
    await runner.start(TAB);
    await held;
    await vi.waitFor(() => expect(stored()).toBeUndefined(), { timeout: 5000, interval: 5 });
    expect(world.ran.at(-1)).toBe('visits');
    expect(world.stagingCleared).toBe(2); // Start's, and the discard's
    expect(world.sessionStore.session).toBeUndefined();
  });
});

describe('a service worker that restarts', () => {
  it('pauses a run it finds running, and Resume continues it from where it was', async () => {
    world.step.visits = () => {
      throw new Error('stop here'); // leaves a run stored at visits, as a worker that died there would
    };
    let runner = await freshRunner();
    await runner.start(TAB);
    await settled();
    world.local.run = { ...stored()!, status: 'running', message: undefined, errorDetail: undefined };
    delete world.step.visits;
    world.ran = [];

    runner = await freshRunner();
    await runner.recover('startup');
    expect(stored()?.status).toBe('paused_session');
    expect(stored()?.message).toMatch(/Chrome was restarted/);
    expect(world.ran).toEqual([]);

    await runner.resume(TAB);
    expect((await settled())?.status).toBe('saving');
    expect(world.ran).toEqual(collected(steps('visits')));
    expect(world.orders).toBe(1);
  });

  // Maccabi texts the member for every order, and builds the file again: what the worker knew of an order has to be
  // in storage before anything else can stop it, or the resume orders again.
  it('does not order the medical file again when it died after Maccabi answered the order', async () => {
    // Killed at the checkpoint after the order step, the first write past it.
    world.dieOn = (items) => (items.run as RunState | undefined)?.next === PLAN.indexOf('orderMedicalFile') + 1;
    let runner = await freshRunner();
    await runner.start(TAB);
    await vi.waitFor(() => expect(world.dead).toBe(true), { timeout: 5000, interval: 5 });
    expect(world.orders).toBe(1);

    world.dead = false;
    world.dieOn = undefined;
    runner = await freshRunner();
    await runner.recover('startup');
    await runner.resume(TAB);
    expect((await settled())?.status).toBe('saving');
    expect(world.orders).toBe(1);
    expect(world.keptListed).toBe(false); // the order's own file is waited for
  });

  it('does not order the medical file again when it died while the order was out', async () => {
    world.step.orderMedicalFile = () => die(); // the request went out, and its answer never came back
    let runner = await freshRunner();
    await runner.start(TAB);
    await vi.waitFor(() => expect(world.dead).toBe(true), { timeout: 5000, interval: 5 });

    world.dead = false;
    delete world.step.orderMedicalFile;
    runner = await freshRunner();
    await runner.recover('startup');
    await runner.resume(TAB);
    expect((await settled())?.status).toBe('saving');
    // Maccabi may have taken it, as with any order whose answer was lost: the file it already lists is kept.
    expect(world.orders).toBe(1);
    expect(world.keptListed).toBe(true);
  });

  it('refuses to resume a run for another member', async () => {
    world.step.visits = () => {
      throw new SessionEndedError('gone');
    };
    world.session = MEMBER;
    let runner = await freshRunner();
    await runner.start(TAB);
    await settled();
    world.session = { ...MEMBER, mid: '987654321' };
    runner = await freshRunner();
    await expect(runner.resume(TAB)).rejects.toThrow(/different member/);
  });
});

describe('the download', () => {
  it('can fail, and Save again builds the ZIP afresh', async () => {
    const runner = await freshRunner();
    await runner.start(TAB);
    const run = await settled();
    await runner.onDownloadChanged({ id: run!.downloadId!, state: { current: 'interrupted' }, error: { current: 'NETWORK_FAILED' } } as chrome.downloads.DownloadDelta);
    expect(stored()).toMatchObject({ status: 'error', next: PLAN.indexOf('save') });
    expect(stored()?.message).toMatch(/NETWORK_FAILED.*Save again/);

    const before = world.ran.length;
    await runner.retrySave();
    expect((await settled())?.status).toBe('saving');
    expect(world.downloads).toBe(2);
    expect(world.ran.length).toBe(before); // nothing is collected again
  });
});
