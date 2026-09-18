import type { Ctx, OrderResult, Problem } from '../../core';

export const MACCABI_ORIGIN = 'https://online.maccabi4u.co.il';

/**
 * Effective date of the Terms of Use and Privacy Policy the first-use notice asks users to accept. Change it (with the
 * date at the top of both documents) when either changes materially: the popup then asks everyone to accept again.
 */
export const TERMS_EFFECTIVE = '2026-09-17';
/** Any page of the new site; stays at /sonline/ and issues the SPA token. */
export const SONLINE_PAGE = MACCABI_ORIGIN + '/sonline/';
/**
 * The one legacy page a run opens. Legacy services answer only once some /online/ page has been
 * loaded in the session, and the medical-file order has to be sent from this one, so it serves the
 * purchases, uploads and order steps together and the run crosses to the old site once.
 */
export const SUMMARY_PAGE = MACCABI_ORIGIN + '/online/medicalfile/summary/';

export type RunStatus =
  | 'running'
  | 'paused_session' // Maccabi session ended: log in again, then Resume
  | 'paused_hidden' // the Maccabi tab must come back to the front
  | 'saving' // building and downloading the ZIP
  | 'done'
  | 'error';

/**
 * The run plan, in order. Collection steps are core step names; the others are
 * run-level actions. Each finished entry is checkpointed so a paused or
 * restarted run continues after it.
 */
export const PLAN = [
  // The medical file is ordered first so Maccabi builds it while the rest is collected: by the time
  // waitMedicalFile runs, it is normally ready and there is nothing left to wait for. The legacy
  // page it is ordered from serves the purchases and uploads too, so the run still crosses once.
  'openLegacyPage',
  'orderMedicalFile',
  // Prescriptions sit next to the purchases they belong with: both write to
  // medications-and-prescriptions/, and the popup shows them as one stage. They come from the REST
  // API, which does not care what page the tab is on, so they can be collected from the legacy page.
  'medications',
  'purchases',
  'savedDocuments',
  'returnToSonline',
  'profileAndDoctors',
  'testResults',
  'visits',
  'referrals',
  'vaccinations',
  'letters',
  'doctorCommunications',
  'emptySections',
  'waitMedicalFile',
  'save',
] as const;
export type PlanStep = (typeof PLAN)[number];

/** Rough share of the run's time per step, for the progress bar. */
export const WEIGHTS: Record<PlanStep, number> = {
  profileAndDoctors: 2,
  testResults: 30,
  visits: 8,
  medications: 5,
  referrals: 5,
  vaccinations: 4,
  letters: 3,
  doctorCommunications: 3,
  emptySections: 1,
  openLegacyPage: 1,
  purchases: 3,
  savedDocuments: 3,
  orderMedicalFile: 1,
  returnToSonline: 1,
  // Small now that it runs last: the file has had the whole collection to be built, so this is
  // usually one poll plus the download.
  waitMedicalFile: 4,
  save: 5,
};

export const LABELS: Record<PlanStep, string> = {
  profileAndDoctors: 'Member profile and doctors',
  testResults: 'Test results',
  visits: 'Visit summaries',
  medications: 'Prescriptions',
  referrals: 'Referrals, approvals and info pages',
  vaccinations: 'Vaccinations',
  letters: 'Letters',
  doctorCommunications: 'Communication with doctor',
  emptySections: 'Allergies, appointments and requests',
  openLegacyPage: 'Opening the medical file page',
  purchases: 'Pharmacy purchases',
  savedDocuments: 'Your uploads',
  orderMedicalFile: 'Ordering your medical file',
  returnToSonline: 'Back to the new site',
  waitMedicalFile: 'Waiting for your medical file',
  save: 'Saving the ZIP',
};

export interface RunState {
  id: string;
  status: RunStatus;
  tabId: number;
  startedAt: string;
  finishedAt?: string;
  /** Index into PLAN of the step to run next. */
  next: number;
  /** PLAN[next] by name, so an extension update that moves indices is caught (see alignToPlan). */
  nextStep?: PlanStep;
  /** The stored run names a step this version no longer has: it can only be discarded. */
  planMismatch?: boolean;
  ctx: Ctx;
  order?: OrderResult;
  /** Within the current step. */
  stepDone: number;
  stepTotal: number;
  detail?: string;
  percent: number;
  message?: string;
  /** The first problems, for the popup; problemCount has the total. */
  problems?: Problem[];
  problemCount?: number;
  /** Files staged so far while running; once saved, the files in the ZIP. */
  fileCount?: number;
  /** Bytes staged so far, uncompressed. */
  byteCount?: number;
  zipName?: string;
  /** Size of the saved ZIP. */
  zipBytes?: number;
  downloadId?: number;
  /** The ZIP's blob: URL in the offscreen document, revoked once the download finishes. */
  blobUrl?: string;
  /** Hash of the member id, to refuse resuming as a different member. */
  memberHash?: string;
  heartbeatAt?: number;
}

export interface TabInfo {
  onMaccabi: boolean;
  loggedIn: boolean;
  tabId?: number;
  /** The logged-in member's first name, for the idle view; missing when it could not be read. */
  name?: string;
}

export type Request =
  | { type: 'getState' }
  | { type: 'acceptNotice' }
  | { type: 'start'; tabId?: number }
  | { type: 'resume'; tabId?: number }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'retrySave' }
  | { type: 'showFile' }
  | { type: 'openMaccabi' }
  | { type: 'focusTab' };

export interface StateReply {
  run: RunState | null;
  /** The first-use notice (what an export does, with the Terms of Use and Privacy Policy) was accepted, in its current version. */
  noticeAccepted: boolean;
  tab: TabInfo;
}

/**
 * Steps that run on the page an earlier step opened. orderMedicalFile is not here: it reopens the
 * page itself when it has to, so resuming at the order does not repeat the purchases and uploads
 * that share that page.
 */
const OPENED_BY: Partial<Record<PlanStep, PlanStep>> = {
  purchases: 'openLegacyPage',
  savedDocuments: 'openLegacyPage',
};

/**
 * A stored run points at the step to run next by index, and editing PLAN moves indices: an
 * extension update mid-run would otherwise continue a paused run at whatever step now sits at that
 * number. The name is stored beside the index, so here the name wins. False when this version no
 * longer has that step at all, which leaves discarding the run as the only safe option.
 */
export function alignToPlan(run: { next: number; nextStep?: PlanStep }): boolean {
  if (!run.nextStep || run.next >= PLAN.length || PLAN[run.next] === run.nextStep) return true;
  const i = PLAN.indexOf(run.nextStep);
  if (i < 0) return false;
  run.next = i;
  return true;
}

/** Where a resumed run continues: Resume reloads the tab, so a step that needs a page opens it again. */
export function resumeIndex(next: number): number {
  const opener = OPENED_BY[PLAN[next]];
  return opener ? PLAN.indexOf(opener) : next;
}

export function percentOf(next: number, stepDone: number, stepTotal: number): number {
  const total = PLAN.reduce((a, s) => a + WEIGHTS[s], 0);
  let before = 0;
  for (let i = 0; i < next && i < PLAN.length; i++) before += WEIGHTS[PLAN[i]];
  const frac = stepTotal > 0 ? Math.min(1, Math.max(0, stepDone / stepTotal)) : 0;
  const current = next < PLAN.length ? WEIGHTS[PLAN[next]] * frac : 0;
  return Math.min(100, Math.round(((before + current) / total) * 100));
}

export function exportName(now: number): string {
  return 'maccabi-export-' + new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}
