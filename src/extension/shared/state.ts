import { errMessage, LEGACY_STEPS, MEDICAL_FILE, type Ctx, type OrderResult, type Problem } from '../../core';
import { israelTime, israelToday } from '../../core/util';

export const MACCABI_ORIGIN = 'https://online.maccabi4u.co.il';

/**
 * Effective date of the Terms of Use and Privacy Policy the first-use notice asks users to accept. Change it (with the
 * date at the top of both documents) when either changes materially: the popup then asks everyone to accept again.
 */
export const TERMS_EFFECTIVE = '2026-09-17';
/**
 * The extension's website, at its section on opening an export in an AI assistant, and at the one on what to ask. The
 * popup, the "Export ready" notification and every export's README link to them, and a link opens in the member's own
 * browser: the extension requests nothing from the site. The section ids are site/index.html's, and stay.
 */
export const SITE_OPEN = 'https://maccabi.ronirachmani.com/#where';
export const SITE_ASK = 'https://maccabi.ronirachmani.com/#ask';
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
 * The run plan, in order, one row per step: the step, its weight and its label. Collection steps are core step names;
 * the others are run-level actions. Each finished step is checkpointed so a paused or restarted run continues after it.
 * PLAN, WEIGHTS and LABELS below are read off these rows, so a step is added in one place here (and in core's STEPS,
 * and the popup's STAGES).
 *
 * weight is the step's rough share of the run's time, for the progress bar. Only the ratios matter; percentOf divides
 * by their sum. What makes a step slow is the number of requests it sends, one every PACE_MS, so the steps whose list
 * has no date cap -- referrals, approvals and the doctor messages, which are asked for from 1900 and so grow with how
 * long someone has been a member -- weigh more than the ones the server caps (visits: 12 months) or that hold only
 * what is current (medications: prescriptions in force, though that was 30 requests on one account and 2 on another).
 * Fitted to measured runs on three accounts (docs/sections.md, *How long each line takes*): the whole numbers that
 * keep the bar closest to the elapsed time on the worst of them, within about 5 points, when the medical file is ready
 * by the time it is collected.
 *
 * label is the popup's heading while the step runs, and the name a problem or an error gives it. Each is the name of
 * what the step collects, and appears in its stage's line in STAGES (popup/model.ts), so the heading and the
 * highlighted line always say the same thing. A step that only serves another (a page change, the wait) takes that
 * one's name: what it is doing is the line under the heading, in DESCRIPTIONS.
 */
const STEP_ROWS = [
  // The medical file is ordered first so Maccabi builds it while the rest is collected: by the time
  // waitMedicalFile runs, it is normally ready and there is nothing left to wait for. The legacy
  // page it is ordered from serves the purchases, hospital stays and uploads too, so the run still
  // crosses once.
  { step: 'openLegacyPage', weight: 2, label: 'Ordering your medical file' },
  // The order request itself took 1.5 s in most runs and 8.9 s in one.
  { step: 'orderMedicalFile', weight: 1, label: 'Ordering your medical file' },
  // The member's details, then their medications, come first in the popup's list, as the natural
  // opening. Both are REST API steps, which do not care what page the tab is on, so they are
  // collected from the legacy page, next to the purchases that belong with the prescriptions (both
  // write to medications-and-prescriptions/). The token is good for hours; the site's idle logouts
  // (the legacy page has its own, shorter one) are kept off by keepSessionAlive, on whatever page the tab is on.
  { step: 'profileAndDoctors', weight: 2, label: 'Your details and doctor' },
  // Allergies, upcoming appointments and requests: three short requests, shown in the popup as part
  // of "Your details and doctor", which needs them right after it.
  { step: 'emptySections', weight: 1, label: 'Allergies, appointments and requests' },
  { step: 'medications', weight: 6, label: 'Prescriptions' },
  { step: 'purchases', weight: 1, label: 'Medication purchases' },
  { step: 'hospitalStays', weight: 1, label: 'Hospital stays' },
  { step: 'savedDocuments', weight: 2, label: 'Your uploads' },
  { step: 'returnToSonline', weight: 1, label: 'Test results' },
  { step: 'testResults', weight: 46, label: 'Test results' },
  { step: 'visits', weight: 6, label: 'Visit summaries' },
  { step: 'referrals', weight: 13, label: 'Referrals' },
  { step: 'approvals', weight: 1, label: 'Approvals' },
  { step: 'vaccinations', weight: 2, label: 'Vaccinations' },
  { step: 'letters', weight: 2, label: 'Letters' },
  { step: 'doctorCommunications', weight: 15, label: 'Messages with your doctor' },
  // General health information a practitioner handed out, not about the member: the least of the
  // sections, so the last before the medical file.
  { step: 'infoPages', weight: 1, label: 'Information pages' },
  // Small because it runs last: the file has had the whole collection to be built, so this is
  // usually one poll plus the download (8.6 s). A file Maccabi is slower with holds the bar here,
  // with the panel saying it is being prepared: no weight fits a wait of seconds to 30 minutes.
  { step: 'waitMedicalFile', weight: 5, label: 'Collecting your medical file' },
  // Building and downloading the ZIP took under a second.
  { step: 'save', weight: 1, label: 'Saving the ZIP' },
] as const satisfies readonly { step: string; weight: number; label: string }[];

export type PlanStep = (typeof STEP_ROWS)[number]['step'];
export const PLAN: readonly PlanStep[] = STEP_ROWS.map((r) => r.step);
export const WEIGHTS = Object.fromEntries(STEP_ROWS.map((r) => [r.step, r.weight])) as Record<PlanStep, number>;
export const LABELS = Object.fromEntries(STEP_ROWS.map((r) => [r.step, r.label])) as Record<PlanStep, string>;

export interface Timing {
  ms: number;
  requests: number;
}

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
  /** The stored run names a step this version no longer has, or names files differently: it can only be discarded. */
  planMismatch?: boolean;
  /** FILE_LAYOUT of the version that started the run. */
  layout?: number;
  ctx: Ctx;
  order?: OrderResult;
  /** Within the current step. */
  stepDone: number;
  stepTotal: number;
  detail?: string;
  /** Records handled of those listed, when the current step counts records (not every step's stepDone does). */
  items?: { done: number; total: number };
  percent: number;
  message?: string;
  /** With an unexpected error's message: the error in the code's own words, for a report. */
  errorDetail?: string;
  /** The first problems, for the popup; problemCount has the total. */
  problems?: Problem[];
  problemCount?: number;
  /** Files staged so far while running; once saved, the files in the ZIP. */
  fileCount?: number;
  /** Bytes staged so far, uncompressed. */
  byteCount?: number;
  /** Files staged so far by the step, or `step:part`, that first wrote them (stagingKey), for the popup's list. */
  filesByKey?: Record<string, number>;
  /**
   * Time and requests by the step, or `step:part`, they went to (stagingKey), summed over every time it ran: a resume
   * or a rewind runs a step again. The time is wall-clock, pacing and waits included; `alive` pings don't count.
   */
  timings?: Record<string, Timing>;
  /** When the medical file was ordered (ISO), and the time from then until the run had its PDF. */
  orderedAt?: string;
  medicalFileMs?: number;
  /** When the ZIP's download began (epoch ms), for the `save:download` timing. */
  downloadStartedAt?: number;
  zipName?: string;
  /** Size of the saved ZIP. */
  zipBytes?: number;
  downloadId?: number;
  /** The ZIP's blob: URL in the offscreen document, revoked once the download finishes or fails, and before Save again builds another. */
  blobUrl?: string;
  /** Hash of the member id, to refuse resuming as a different member. */
  memberHash?: string;
  heartbeatAt?: number;
  /** Cancel was pressed while a loop held the run: a worker that dies before discarding it leaves this for the next. */
  cancelling?: boolean;
  /** The member pressed Save now during the medical file's wait. Stored, so a restarted worker does not wait on. */
  saveNow?: boolean;
  /**
   * The run ended without the file it ordered: `kept` is the day of the file it has instead, if any, and `until` the
   * last day an export takes the ordered file, once Maccabi has built it, without ordering again. `refused`: Maccabi
   * refused the order, and `retryAt` (ISO) is when a new run may order once more, missing when the day's retry is used.
   */
  medicalFileLate?: { kept?: string; until?: string; refused?: boolean; retryAt?: string };
}

/**
 * The last medical file order, kept in chrome.storage.local under LAST_ORDER apart from the run, which Cancel deletes.
 * Maccabi texts the member for each order and its list shows no pending one, so this is all that stops a new run from
 * ordering again the same day, or, until an export has its file, in the days after (placeOrder's `earlier`). Written
 * before the order goes out, again with its answer, and once more when a run collects its file.
 */
export interface LastOrder {
  /** The day in Israel it was sent, which is its to_date. */
  day: string;
  memberHash: string;
  /** When it was sent (ISO). */
  at: string;
  /** Maccabi confirmed it, so a later run waits for its file. */
  confirmed: boolean;
  /** Its Success code, when an answer came. */
  code?: string;
  /** It was the day's one retry after a refusal (placeOrder's REFUSAL_RETRY_MS), so no run orders again that day. */
  retried?: boolean;
  /** Whether a run has collected its file: a later day orders afresh unless this is false (missing in older versions'). */
  collected?: boolean;
}

export const LAST_ORDER = 'lastOrder';

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
  | { type: 'saveNow' }
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
const OPENED_BY: Partial<Record<PlanStep, PlanStep>> = Object.fromEntries(LEGACY_STEPS.map((s) => [s, 'openLegacyPage' as const]));

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

/**
 * How this version names the files it collects. Bump it when a change renames files a run has
 * already staged (a title rule, a new name for a record): a run paused before the update would
 * otherwise re-run its steps and stage the new names beside the old, the same record twice.
 * 2: titles keep ״ and ׳, inquiries and their forms are named by what they are, uploads by their
 * file when untitled, imaging studies by a hash of their id.
 * 3: a test with a negative request_id keeps its minus sign.
 * 4: a test is titled by its procedures or kind, which the site sends as lists; no test had a title.
 * 5: a test's procedures are also read from procedures[]; a referral is titled by its specialist; a
 * visit linked from an inquiry by its speciality, as listed visits are; prescriptions are one PDF per visit.
 * 6: an inquiry is titled by the subjects the list gives it, which were looked for in its details.
 */
export const FILE_LAYOUT = 6;

/**
 * False when a stored run was started by a version that named files differently and still has
 * collection steps to run. A run left with only the medical file and the ZIP to go can finish.
 */
export function sameLayout(run: { next: number; layout?: number }): boolean {
  if (run.layout === FILE_LAYOUT) return true;
  return run.next >= PLAN.indexOf('waitMedicalFile');
}

/**
 * What a run left saving, with no worker driving it, comes to by the state of its download in chrome.downloads (undefined
 * when Chrome has none: the browser closed before the ZIP was handed over, or forgot it). A download Chrome is still
 * receiving is left to finish; anything else that has not completed will never complete, since its blob: URL died with
 * the offscreen document, and the run has to save again from staging.
 */
export function savingOutcome(downloadState: string | undefined): 'wait' | 'complete' | 'interrupted' {
  if (downloadState === 'in_progress') return 'wait';
  return downloadState === 'complete' ? 'complete' : 'interrupted';
}

/**
 * How long a run nobody comes back to keeps its collected files. They are health records, at rest in the browser
 * profile, so a paused or stopped export is not left there indefinitely: a week after it was last saved, it is
 * discarded as Cancel would.
 */
export const STAGING_TTL_MS = 7 * 24 * 3600_000;
export const STAGING_TTL_DAYS = STAGING_TTL_MS / (24 * 3600_000);

/**
 * A stored run that has not been saved for STAGING_TTL_MS. A run with a worker driving it saves at every step, so the
 * runner asks this only of a run no loop holds; one stored before heartbeatAt existed counts from its start.
 */
export function abandoned(run: { heartbeatAt?: number; startedAt?: string }, now: number): boolean {
  const last = run.heartbeatAt ?? (run.startedAt ? Date.parse(run.startedAt) : NaN);
  return Number.isFinite(last) && now - last > STAGING_TTL_MS;
}

/** The moves a run's status can make: every status the runner sets goes through nextStatus. */
export type RunEvent = 'resume' | 'pause' | 'hide' | 'show' | 'stop' | 'save' | 'saved' | 'saveFailed' | 'retrySave' | 'obsolete';

const ALL_STATUSES: readonly RunStatus[] = ['running', 'paused_session', 'paused_hidden', 'saving', 'done', 'error'];

const MOVES: Record<RunEvent, { from: readonly RunStatus[]; to: RunStatus }> = {
  // Resume, from a pause, a stop or a run no worker holds any more.
  resume: { from: ['paused_session', 'paused_hidden', 'running', 'error'], to: 'running' },
  // The session ended, or Chrome restarted, with the run going, waiting for its tab or saving.
  pause: { from: ['running', 'paused_hidden', 'saving'], to: 'paused_session' },
  hide: { from: ['running', 'paused_hidden'], to: 'paused_hidden' },
  show: { from: ['running', 'paused_hidden'], to: 'running' },
  stop: { from: ['running', 'paused_hidden', 'saving'], to: 'error' },
  save: { from: ['running'], to: 'saving' },
  saved: { from: ['saving'], to: 'done' },
  saveFailed: { from: ['saving'], to: 'error' },
  retrySave: { from: ['error'], to: 'running' },
  // Stored by a version this one cannot continue: it can only be discarded.
  obsolete: { from: ALL_STATUSES, to: 'error' },
};

/** Whether the event applies to a run in this status. */
export function canMove(status: RunStatus, event: RunEvent): boolean {
  return MOVES[event].from.includes(status);
}

/** The status after the event; a status it does not apply to stays as it is. */
export function nextStatus(status: RunStatus, event: RunEvent): RunStatus {
  return canMove(status, event) ? MOVES[event].to : status;
}

/** A worker's loop or a download is carrying the run forward. */
export function isDriven(status: RunStatus): boolean {
  return status === 'running' || status === 'saving';
}

/** The run is not over, so a new one cannot start beside it. */
export function isUnderway(status: RunStatus): boolean {
  return isDriven(status) || status === 'paused_session' || status === 'paused_hidden';
}

export const OFFLINE_MESSAGE =
  'This computer seems to be offline, so the export paused. Once it is back online, click the extension’s icon on the Maccabi Online tab and press Resume. Files collected so far are kept.';

export const SESSION_ENDED_MESSAGE =
  'Your Maccabi Online session ended. Log in again, then click the extension’s icon on the Maccabi Online tab and press Resume. Files collected so far are kept.';

/** The "Export saved" notification's last sentence, when the export has no fresh medical file. */
export function lateFileNotice(late: NonNullable<RunState['medicalFileLate']>): string {
  if (!late.refused) return 'When Maccabi texts you, export again.';
  return 'Maccabi asked to try again later: export again when it texts you, or ' +
    (late.retryAt ? 'from ' + israelTime(Date.parse(late.retryAt)) + ' if it doesn’t.' : 'tomorrow if it doesn’t.');
}

/** Problems without the one about the late medical file, which the finished view and the notification say in full. */
export function withoutLateFile<P extends Problem>(problems: P[], run: Pick<RunState, 'medicalFileLate'>): P[] {
  return run.medicalFileLate ? problems.filter((p) => p.where !== MEDICAL_FILE) : problems;
}

/** What the run does when a step throws: the runner carries it out, this only decides. */
type StepFailure =
  | { action: 'cancel' }
  /** Do what Resume does and run the step again; if that fails, pause with SESSION_ENDED_MESSAGE. */
  | { action: 'reconnect' }
  | { action: 'pause'; message: string }
  | { action: 'stop'; message: string; detail?: string };

/** The run allows this many reconnects in a row before it pauses for the member. */
export const MAX_RECONNECTS = 2;

export function stepFailure(
  e: unknown,
  { step, cancelRequested, reconnects }: { step: PlanStep; cancelRequested: boolean; reconnects: number },
): StepFailure {
  const flags = (e && typeof e === 'object' ? e : {}) as { cancelled?: boolean; sessionEnded?: boolean; rateLimited?: boolean };
  if (cancelRequested || flags.cancelled) return { action: 'cancel' };
  // The member is often still logged in: a token is good for about 10 h (measured 2026-09-18), so a run never
  // outlives one and what ended is the site's session. Do what Resume does, then try again.
  if (flags.sessionEnded) return reconnects < MAX_RECONNECTS ? { action: 'reconnect' } : { action: 'pause', message: SESSION_ENDED_MESSAGE };
  if (flags.rateLimited) {
    return {
      action: 'stop',
      message: 'Maccabi Online asked the extension to slow down, so the export stopped. Files collected so far are kept: wait a few minutes, then press “Try again”.',
    };
  }
  return {
    action: 'stop',
    message: 'Something unexpected stopped the export during “' + LABELS[step] + '”.',
    detail: errMessage(e),
  };
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

/** An export is named by the day it is in Israel, as the medical file it orders is dated. */
export function exportName(now: number): string {
  return 'maccabi-export-' + israelToday(now);
}
