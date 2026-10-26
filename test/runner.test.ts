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
  /** What chrome.downloads.search finds for the run's download: nothing, unless a test says. */
  downloadItem: undefined as Partial<chrome.downloads.DownloadItem> | undefined,
  revoked: [] as string[],
  local: {} as Record<string, unknown>,
  sessionStore: {} as Record<string, unknown>,
};

vi.mock('../src/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('../src/core')>();
  return {
    ...core,
    runStep: vi.fn(async (_c: unknown, _ctx: unknown, step: PlanStep) => {
      world.ran.push(step);
      const attempt = world.ran.filter((s) => s === step).length;
      await world.step[step]?.(attempt);
    }),
    placeOrder: vi.fn(async () => {
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
  revokeBlob: async (url: string) => {
    world.revoked.push(url);
  },
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
    set: async (items: Record<string, unknown>) => void Object.assign(data, structuredClone(items)),
    remove: async (key: string) => void delete data[key],
  });
  return {
    storage: { local: store(world.local), session: store(world.sessionStore) },
    alarms: { create: async () => {}, clear: async () => true },
    runtime: { getPlatformInfo: async () => ({}), getManifest: () => ({ version: '0.0.0' }) },
    downloads: {
      download: async () => ++world.downloads,
      search: async () => (world.downloadItem ? [world.downloadItem] : []),
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
    visible: true, sessionLookups: 0, navigations: [], path: '/sonline/', stagingCleared: 0, notices: [], downloads: 0, downloadItem: undefined, revoked: [],
    local: {}, sessionStore: {},
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

describe('a download that settles while no worker watched it', () => {
  /** A run handed to the download, then a fresh worker, as after Chrome closed with the ZIP on its way. */
  async function savingThenRestart(item?: Partial<chrome.downloads.DownloadItem>): Promise<Runner> {
    const first = await freshRunner();
    await first.start(TAB);
    const run = await settled();
    expect(run?.status).toBe('saving');
    world.downloadItem = item && { id: run!.downloadId!, ...item };
    world.notices = [];
    return freshRunner();
  }

  it('finishes the run when Chrome says the download completed', async () => {
    const runner = await savingThenRestart({ state: 'complete' as chrome.downloads.State });
    await runner.recover('startup');
    expect(stored()).toMatchObject({ status: 'done', percent: 100, next: PLAN.length });
    expect(stored()?.blobUrl).toBeUndefined();
    expect(world.revoked).toEqual(['blob:zip']);
    expect(world.notices).toEqual(['Export ready']);
    expect(world.stagingCleared).toBe(2); // Start's, and the finish's
  });

  it('offers Save again when the download stopped, keeping the files', async () => {
    const runner = await savingThenRestart({ state: 'interrupted' as chrome.downloads.State, error: 'FILE_NO_SPACE' as chrome.downloads.DownloadItem['error'] });
    await runner.recover('heartbeat');
    expect(stored()).toMatchObject({ status: 'error', next: PLAN.indexOf('save') });
    expect(stored()?.message).toMatch(/FILE_NO_SPACE.*Save again/);
    expect(world.notices).toEqual(['Export not saved']);
    expect(world.stagingCleared).toBe(1);
  });

  it('treats a download Chrome no longer knows as stopped', async () => {
    const runner = await savingThenRestart();
    await runner.recover('startup');
    expect(stored()?.status).toBe('error');
    expect(stored()?.message).toMatch(/perhaps when Chrome closed/);
  });

  it('keeps waiting while the download is still going', async () => {
    const runner = await savingThenRestart({ state: 'in_progress' as chrome.downloads.State });
    await runner.recover('heartbeat');
    expect(stored()?.status).toBe('saving');
    expect(world.notices).toEqual([]);
  });

  it('finishes once when the download event and the check both arrive', async () => {
    const runner = await savingThenRestart({ state: 'complete' as chrome.downloads.State });
    const id = stored()!.downloadId!;
    await Promise.all([
      runner.recover('heartbeat'),
      runner.onDownloadChanged({ id, state: { current: 'complete' } } as chrome.downloads.DownloadDelta),
    ]);
    expect(stored()?.status).toBe('done');
    expect(world.notices).toEqual(['Export ready']);
    expect(world.stagingCleared).toBe(2);
  });

  it('ignores another download’s events', async () => {
    const runner = await savingThenRestart();
    await runner.onDownloadChanged({ id: stored()!.downloadId! + 1, state: { current: 'complete' } } as chrome.downloads.DownloadDelta);
    await runner.onDownloadChanged({ id: stored()!.downloadId!, state: { current: 'in_progress' } } as chrome.downloads.DownloadDelta);
    expect(stored()?.status).toBe('saving');
    expect(world.notices).toEqual([]);
  });
});

describe('a hidden tab', () => {
  /** A session that ends at visits while the tab is in the background: the reconnect waits for the tab. */
  async function waitingForTab(): Promise<Runner> {
    world.step.visits = (attempt) => {
      if (attempt === 1) {
        world.visible = false;
        throw new SessionEndedError('gone');
      }
    };
    const runner = await freshRunner();
    await runner.start(TAB);
    await vi.waitFor(() => expect(stored()?.status).toBe('paused_hidden'), { timeout: 5000, interval: 5 });
    expect(stored()?.message).toMatch(/Bring the Maccabi Online tab back/);
    expect(world.notices).toEqual(['Export paused']);
    return runner;
  }

  it('holds the run until the tab is back, then reconnects and goes on', async () => {
    const runner = await waitingForTab();
    // Resume while the loop is still waiting is a no-op: the loop goes on by itself.
    await runner.resume(TAB);
    expect(world.sessionLookups).toBe(2); // Start's and returnToSonline's: no reconnect yet
    world.visible = true;
    await vi.waitFor(() => expect(stored()?.status).toBe('saving'), { timeout: 5000, interval: 5 });
    expect(world.ran.filter((s) => s === 'visits')).toHaveLength(2);
    expect(world.orders).toBe(1);
  });

  it('is cancelled by Cancel, which discards the run without reconnecting', async () => {
    const runner = await waitingForTab();
    await runner.cancel();
    expect(stored()?.status).toBe('paused_hidden'); // the loop notices at its next look at the tab
    await vi.waitFor(() => expect(stored()).toBeUndefined(), { timeout: 5000, interval: 5 });
    expect(world.ran.at(-1)).toBe('visits');
    expect(world.ran.filter((s) => s === 'visits')).toHaveLength(1);
    expect(world.sessionLookups).toBe(2);
    expect(world.stagingCleared).toBe(2); // Start's, and the discard's
    expect(world.sessionStore.session).toBeUndefined();
    expect(world.notices).toEqual(['Export paused']);
  });
});
