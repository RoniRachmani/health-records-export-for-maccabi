/* The made-up export both films run through the real popup (mock-chrome.ts's demoRun): states built from the real
   PLAN and WEIGHTS, so the bar, the step names and the section list move as they do in an export. */
import { currentStage, DESCRIPTIONS, STAGES, stageSpan } from '../../src/extension/popup/model';
import { LABELS, PLAN, WEIGHTS, percentOf, type RunState } from '../../src/extension/shared/state';
import { clamp01 } from './motion';

// What a long-standing member's export comes to, the same numbers the store images show.
export const FILES = 486;
export const BYTES = 38_400_000;
export const ZIP = 'maccabi-export-2026-09-17.zip';

const TOTAL_WEIGHT = PLAN.reduce((sum, step) => sum + WEIGHTS[step], 0);

/** How many records each counting part lists, for the panel's "38 of 61". */
const RECORDS: Record<string, number> = {
  prescriptions: 9, 'hospital letters': 2, 'saved documents': 11, 'test results': 96, 'lab histories': 61, visits: 24,
  referrals: 31, approvals: 12, vaccinations: 14, letters: 8, 'doctor inquiries': 17, 'information pages': 4,
};

/** The staged-file keys of the lines finished before `stage`, each with its share of the export's files by weight. */
function filesBefore(stage: number): Record<string, number> {
  const byKey: Record<string, number> = {};
  // The first line orders the file, and writes none of its own.
  for (let i = 1; i < stage; i++) {
    const s = STAGES[i];
    const part = s.parts?.at(-1);
    const { start, end } = stageSpan(i);
    byKey[part ? s.steps.at(-1) + ':' + part : s.steps[0]] = Math.max(1, Math.round((FILES * (end - start)) / 100));
  }
  return byKey;
}

/**
 * The run state a fraction `u` of the way through the plan, weighted as a real run is, begun at `startedAt`.
 * `counted` gives the counting parts their "38 of 61".
 */
export function runAt(u: number, startedAt: string, counted = true): RunState {
  const target = clamp01(u) * TOTAL_WEIGHT;
  let before = 0;
  let i = 0;
  let frac = 1;
  for (; i < PLAN.length; i++) {
    const weight = WEIGHTS[PLAN[i]];
    if (target <= before + weight || i === PLAN.length - 1) {
      frac = clamp01((target - before) / weight);
      break;
    }
    before += weight;
  }
  const step = PLAN[i];
  // The step's own progress detail, as the collector reports it: its parts in the order they run.
  const parts = Object.keys(DESCRIPTIONS[step]);
  const at = Math.min(parts.length - 1, Math.floor(frac * parts.length));
  const part = parts[at];
  const records = counted ? RECORDS[part] : undefined;
  const detail = part ? LABELS[step] + ': ' + part : undefined;
  return {
    id: 'demo',
    status: step === 'save' ? 'saving' : 'running',
    tabId: 1,
    startedAt,
    next: i,
    nextStep: step,
    ctx: {},
    stepDone: frac,
    stepTotal: 1,
    detail,
    items: records ? { done: Math.floor(clamp01(frac * parts.length - at) * records), total: records } : undefined,
    percent: percentOf(i, frac, 1),
    fileCount: Math.round(u * FILES),
    byteCount: Math.round(u * BYTES),
    filesByKey: filesBefore(currentStage({ next: i, detail })),
  };
}

/** The finished run, begun at `startedAt` and ended at `finishedAt`. */
export function doneRun(startedAt: string, finishedAt: string, counted = true): RunState {
  return {
    ...runAt(1, startedAt, counted),
    status: 'done',
    next: PLAN.length,
    percent: 100,
    finishedAt,
    zipName: ZIP,
    fileCount: FILES,
    zipBytes: BYTES,
    problems: [],
    problemCount: 0,
  };
}
