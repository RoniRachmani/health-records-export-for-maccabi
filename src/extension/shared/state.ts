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
 * purchases, uploads, hospital stays and order steps together and the run crosses to the old site once.
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
  // page it is ordered from serves the purchases, hospital stays and uploads too, so the run still
  // crosses once.
  'openLegacyPage',
  'orderMedicalFile',
  // The member's details, then their medications, come first in the popup's list, as the natural
  // opening. Both are REST API steps, which do not care what page the tab is on, so they are
  // collected from the legacy page, next to the purchases that belong with the prescriptions (both
  // write to medications-and-prescriptions/). The token is good for hours; the site's 6-minute idle
  // logout is kept off by keepSessionAlive, on whatever page the tab is on.
  'profileAndDoctors',
  // Allergies, upcoming appointments and requests: three short requests, shown in the popup as part
  // of "Your details and doctor", which needs them right after it.
  'emptySections',
  'medications',
  'purchases',
  'hospitalStays',
  'savedDocuments',
  'returnToSonline',
  'testResults',
  'visits',
  'referrals',
  'approvals',
  'vaccinations',
  'letters',
  'doctorCommunications',
  // General health information a practitioner handed out, not about the member: the least of the
  // sections, so the last before the medical file.
  'infoPages',
  'waitMedicalFile',
  'save',
] as const;
export type PlanStep = (typeof PLAN)[number];

/**
 * Rough share of the run's time per step, for the progress bar. Only the ratios matter; percentOf
 * divides by their sum. What makes a step slow is the number of requests it sends, one every
 * PACE_MS, so the steps whose list has no date cap — referrals, approvals and the doctor messages,
 * which are asked for from 1900 and so grow with how long someone has been a member — weigh more
 * than the ones the server caps (visits: 12 months) or that hold only what is current
 * (medications: prescriptions in force). Tuned for a long-standing member: that is where a
 * mis-weighted step stalls the bar long enough to look like a hang.
 */
export const WEIGHTS: Record<PlanStep, number> = {
  profileAndDoctors: 2,
  testResults: 30,
  visits: 7,
  medications: 3,
  referrals: 6,
  approvals: 2,
  infoPages: 1,
  vaccinations: 4,
  letters: 2,
  doctorCommunications: 8,
  emptySections: 1,
  openLegacyPage: 1,
  purchases: 3,
  savedDocuments: 3,
  hospitalStays: 1,
  orderMedicalFile: 1,
  returnToSonline: 1,
  // Small now that it runs last: the file has had the whole collection to be built, so this is
  // usually one poll plus the download.
  waitMedicalFile: 4,
  save: 5,
};

/**
 * The popup's heading while a step runs, and the name a problem or an error gives it. Each is the name of what the
 * step collects, and appears in its stage's line in STAGES (popup/model.ts), so the heading and the highlighted line
 * always say the same thing. A step that only serves another (a page change, the wait) takes that one's name: what
 * it is doing is the line under the heading, in DESCRIPTIONS.
 */
export const LABELS: Record<PlanStep, string> = {
  profileAndDoctors: 'Your details and doctor',
  testResults: 'Test results',
  visits: 'Visit summaries',
  medications: 'Prescriptions',
  referrals: 'Referrals',
  approvals: 'Approvals',
  infoPages: 'Information pages',
  vaccinations: 'Vaccinations',
  letters: 'Letters',
  doctorCommunications: 'Messages with your doctor',
  emptySections: 'Allergies, appointments and requests',
  openLegacyPage: 'Ordering your medical file',
  purchases: 'Medication purchases',
  savedDocuments: 'Your uploads',
  hospitalStays: 'Hospital stays',
  orderMedicalFile: 'Ordering your medical file',
  returnToSonline: 'Test results',
  waitMedicalFile: 'Collecting your medical file',
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
 * page itself when it has to, so resuming at the order does not repeat the purchases, uploads
 * and hospital stays that share that page.
 */
const OPENED_BY: Partial<Record<PlanStep, PlanStep>> = {
  purchases: 'openLegacyPage',
  savedDocuments: 'openLegacyPage',
  hospitalStays: 'openLegacyPage',
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
