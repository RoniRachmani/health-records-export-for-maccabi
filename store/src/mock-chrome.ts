/* Store images and the promo video only: stands in for the extension APIs the real popup uses, so
   it renders a made-up state (?state=notice|ready|login|running|paused|error|done|problems). No real data. */
import pkg from '../../package.json';
import { PLAN, type RunState, type StateReply } from '../../src/extension/shared/state';

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function run(fields: Partial<RunState>): RunState {
  return {
    id: 'demo',
    status: 'running',
    tabId: 1,
    startedAt: ago(6 * MIN),
    next: 0,
    ctx: {},
    stepDone: 0,
    stepTotal: 0,
    percent: 0,
    ...fields,
  };
}

const tab = { onMaccabi: true, loggedIn: true, tabId: 1, name: 'Noa' };

const done = run({
  status: 'done',
  next: PLAN.length,
  percent: 100,
  startedAt: ago(9 * MIN),
  finishedAt: ago(0),
  zipName: 'maccabi-export-2026-09-17.zip',
  fileCount: 486,
  zipBytes: 38_400_000,
  problems: [],
  problemCount: 0,
});

const STATES: Record<string, Omit<StateReply, 'noticeAccepted'> & { noticeAccepted?: boolean }> = {
  notice: { run: null, noticeAccepted: false, tab: { onMaccabi: false, loggedIn: false } },
  ready: { run: null, tab },
  login: { run: null, tab: { onMaccabi: false, loggedIn: false } },
  running: {
    run: run({ next: PLAN.indexOf('testResults'), detail: 'Test results: lab histories', percent: 34, fileCount: 312, byteCount: 21_700_000 }),
    tab,
  },
  paused: {
    run: run({
      status: 'paused_session',
      next: PLAN.indexOf('visits'),
      percent: 55,
      fileCount: 355,
      byteCount: 24_100_000,
      message: 'Your Maccabi session ended (HTTP 401). Log in to Maccabi Online again, then click this extension\'s icon on that tab and press Resume. Files collected so far are kept.',
    }),
    tab,
  },
  error: {
    run: run({ status: 'error', next: PLAN.indexOf('purchases'), percent: 8, message: 'Unexpected error in "Medication purchases": the purchase table has an unknown layout' }),
    tab,
  },
  done: { run: done, tab },
  problems: {
    run: {
      ...done,
      problems: [
        { where: 'test-results/files/2025-03-02-cbc.pdf', what: 'HTTP 500', at: '' },
        { where: 'visit-summaries/files/2026-01-11.pdf', what: 'HTTP 404', at: '' },
        { where: 'vaccinations', what: 'the vaccination booklet was not available', at: '' },
      ],
      problemCount: 3,
    },
    tab,
  },
};

const state: StateReply = { noticeAccepted: true, ...STATES[new URLSearchParams(location.search).get('state') || 'ready'] };

type Changed = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
let onChanged: Changed | null = null;

(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    getManifest: () => ({ version: pkg.version }),
    sendMessage: async (req: { type: string }) => (req.type === 'getState' ? state : { ok: true }),
  },
  tabs: { query: async () => [{ id: 1 }] },
  storage: { onChanged: { addListener: (fn: Changed) => (onChanged = fn) } },
};

/* The promo video (store/src/video.ts) plays a whole export in this popup: from the parent frame it
   pushes one run state per video frame, exactly as the background writes them, and the popup updates
   itself. Passing null ends the run, which sends the popup back to the state above. */
(globalThis as unknown as { demoRun: (run: RunState | null) => void }).demoRun = (run) => {
  onChanged?.({ run: { newValue: run ?? undefined } }, 'local');
};
