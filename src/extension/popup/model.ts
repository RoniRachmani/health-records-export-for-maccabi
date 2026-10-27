/* What the popup shows, as pure functions of the run state (unit-tested, no DOM). */
import type { Problem } from '../../core';
import { countOf } from '../../core/util';
import { LABELS, PLAN, WEIGHTS, type PlanStep, type Request, type RunState, type StateReply } from '../shared/state';

interface Stage {
  label: string;
  steps: PlanStep[];
  /**
   * Only these parts of the step being split, as its progress detail names them ('' is a step before its first
   * report), for a step long enough to deserve more than one line.
   */
  parts?: string[];
}

/**
 * The run plan as the user sees it, and the popup's main view of the run: one line per part of the export,
 * named for what it collects, so the list reads as an inventory of the member's records and ticks along at a
 * steady pace. Page changes and bookkeeping steps are folded into the line they serve. What the current line is
 * doing (DESCRIPTIONS) is said in the panel above the list, and a finished line shows the files it collected. Stages are in PLAN order, a step's stages consecutive, and the first
 * stage is labelled with one of its steps' LABELS entries, so errors and problems name it the same way. A step that
 * only serves another shares its label; a step that collects something of its own keeps its own name there, and a
 * step split into parts is named as a whole.
 *
 * Room is the constraint: Chrome caps the popup at 600px, and today's 17 lines (16px each) under the file counts' column
 * head take the running view to 589px. Merge before adding an eighteenth.
 */
export const STAGES: Stage[] = [
  // Ordering comes first so Maccabi can build the file while everything else is collected; collecting it is the
  // last stage before the ZIP.
  { label: 'Ordering your medical file', steps: ['openLegacyPage', 'orderMedicalFile'] },
  // Allergies, upcoming appointments and requests are three requests, usually empty: they ride along here.
  { label: 'Your details and doctor', steps: ['profileAndDoctors', 'emptySections'] },
  { label: 'Prescriptions', steps: ['medications'] },
  { label: 'Medication purchases', steps: ['purchases'] },
  { label: 'Hospital stays', steps: ['hospitalStays'] },
  { label: 'Your uploads', steps: ['savedDocuments'] },
  // The longest step by far: its two halves are two lines, or the list would sit on one for a third of the run. The
  // tab's way back to the main site, just before it, is part of its first line.
  { label: 'Test results', steps: ['returnToSonline', 'testResults'], parts: ['', 'test results'] },
  { label: 'Lab histories', steps: ['testResults'], parts: ['lab histories'] },
  { label: 'Visit summaries', steps: ['visits'] },
  { label: 'Referrals', steps: ['referrals'] },
  { label: 'Approvals', steps: ['approvals'] },
  { label: 'Vaccinations', steps: ['vaccinations'] },
  { label: 'Letters', steps: ['letters'] },
  { label: 'Messages with your doctor', steps: ['doctorCommunications'] },
  { label: 'Information pages', steps: ['infoPages'] },
  { label: 'Collecting your medical file', steps: ['waitMedicalFile'] },
  { label: 'Saving the ZIP', steps: ['save'] },
];

type StageState = 'done' | 'current' | 'pending';

type Position = Pick<RunState, 'next' | 'detail'>;

/** The part of the current step the collector last reported ('' before its first report). */
function partOf(run: Position): string {
  if (run.next >= PLAN.length) return '';
  const title = LABELS[PLAN[run.next]];
  const part = run.detail?.startsWith(title + ': ') ? run.detail.slice(title.length + 2) : '';
  return part.replace(/^medical file status .*/, 'medical file status');
}

/** The line a part of a step is on. A part no stage names (or a step with one line) is on the step's first line. */
function stageOf(step: PlanStep, part: string): number {
  const own = STAGES.findIndex((s) => s.steps.includes(step) && s.parts?.includes(part));
  return own >= 0 ? own : STAGES.findIndex((s) => s.steps.includes(step));
}

/** The index in STAGES of the line the run is on; STAGES.length once it has finished. */
export function currentStage(run: Position): number {
  if (run.next >= PLAN.length) return STAGES.length;
  return stageOf(PLAN[run.next], partOf(run));
}

/**
 * Each line's share of the run's weight, counted as percentOf counts it. A step split over several lines gives each
 * an equal share, which is how the collector reports it: testResults counts its two halves as tests.length each.
 */
const SHARES = STAGES.map((s) => s.steps.reduce((a, step) => a + WEIGHTS[step] / STAGES.filter((t) => t.steps.includes(step)).length, 0));
const TOTAL_WEIGHT = PLAN.reduce((a, s) => a + WEIGHTS[s], 0);

/** Where a line starts and ends on the progress bar, in percent: the bar's band marks the rest of the current one. */
export function stageSpan(stage: number): { start: number; end: number } {
  const before = SHARES.slice(0, stage).reduce((a, w) => a + w, 0);
  return { start: (before / TOTAL_WEIGHT) * 100, end: ((before + (SHARES[stage] ?? 0)) / TOTAL_WEIGHT) * 100 };
}

/**
 * Records done of those listed, for the panel's activity line ("38 of 61"), or '' where the step counts none. The
 * medical-file wait reads the letters list to find the file: those are not what it is collecting.
 */
export function countText(run: Pick<RunState, 'next' | 'items'>): string {
  if (!run.items || PLAN[run.next] === 'waitMedicalFile') return '';
  return run.items.done.toLocaleString('en-US') + ' of ' + run.items.total.toLocaleString('en-US');
}

/**
 * How many files each line collected, from the staged files' keys (the step, or `step:part`, that first wrote each):
 * undefined for a line that wrote none, or whose files were staged by a version that kept no keys.
 */
export function stageFileCounts(run: Pick<RunState, 'filesByKey'>): (number | undefined)[] {
  const counts: (number | undefined)[] = STAGES.map(() => undefined);
  for (const [key, n] of Object.entries(run.filesByKey ?? {})) {
    const at = key.indexOf(':');
    const step = (at < 0 ? key : key.slice(0, at)) as PlanStep;
    const stage = PLAN.includes(step) ? stageOf(step, at < 0 ? '' : key.slice(at + 1)) : -1;
    if (stage >= 0 && n > 0) counts[stage] = (counts[stage] ?? 0) + n;
  }
  return counts;
}

export function stageStates(run: Position): StageState[] {
  const at = currentStage(run);
  return STAGES.map((_, i) => (i < at ? 'done' : i === at ? 'current' : 'pending'));
}

export function formatDuration(ms: number): string {
  if (!(ms >= 60_000)) return 'under a minute';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return minutes + ' min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h + ' h' + (m ? ' ' + m + ' min' : '');
}

/** Decimal units, as file managers show them: 227 KB, 3.2 MB, 12 MB. */
export function formatBytes(n: number): string {
  if (!(n >= 1000)) return Math.max(0, Math.round(n || 0)) + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = -1;
  do {
    v /= 1000;
    u++;
  } while (v >= 999.95 && u < units.length - 1);
  return (v < 9.95 ? v.toFixed(1) : String(Math.round(v))) + ' ' + units[u];
}

/**
 * The running export's counters: files and size staged so far, and time since it started. The first sections are
 * quick, so the first minute says how long it has been, not "just started" beside a bar a fifth of the way along.
 * One line in the panel, so "<1 min", not "under a minute".
 */
export function statsText(run: RunState, now: number): string {
  const elapsed = now - Date.parse(run.startedAt);
  return [
    run.fileCount !== undefined && countOf(run.fileCount, 'file', 'files'),
    run.byteCount !== undefined && formatBytes(run.byteCount),
    (elapsed >= 60_000 ? formatDuration(elapsed) : '<1 min') + ' elapsed',
  ].filter(Boolean).join(' · ');
}

/**
 * While Maccabi prepares the medical file: the export's longest stretch, when there is nothing to do but wait. Not once
 * it is downloading (the collector's `letters` part), which the panel says.
 */
export function waitingForFile(run: RunState): boolean {
  return run.status === 'running' && PLAN[run.next] === 'waitMedicalFile' && partOf(run) !== 'letters';
}

/**
 * The reminder at the foot of the panel. While the medical file is being prepared it leads into the link to the AI assistant
 * page (the panel says how long that can take). One line, in any font: the running view has no room to spare under
 * Chrome's 600px cap.
 */
export function hintText(run: RunState): string {
  if (run.status === 'saving') return 'It will be in your Downloads folder in a moment.';
  if (waitingForFile(run)) return 'While you wait:';
  return 'Keep the Maccabi Online tab open and in front.';
}

/**
 * What the panel says the current line is doing, per step and per part of it: the key is the collector's progress detail
 * ("lab histories"), and '' is the step before its first progress report. Kept short enough for one line in the system face as well as in
 * Roboto, with a count in the hundreds beside it ("888 of 888"): a longer one is cut to an ellipsis.
 */
export const DESCRIPTIONS: Record<PlanStep, Record<string, string>> = {
  profileAndDoctors: { '': 'Reading your details and your doctor' },
  testResults: {
    '': 'Reading your list of tests',
    'test results': 'Downloading each result and its PDF',
    'lab histories': 'Saving each lab value’s history',
  },
  visits: { '': 'Reading your visit history', visits: 'Downloading visit summaries' },
  medications: { '': 'Reading your prescriptions', prescriptions: 'Downloading prescription PDFs' },
  referrals: { '': 'Reading your referrals', referrals: 'Downloading each referral as a PDF' },
  approvals: { '': 'Reading your approvals', approvals: 'Downloading each approval as a PDF' },
  infoPages: { '': 'Reading your information pages', 'information pages': 'Downloading each page as a PDF' },
  vaccinations: { '': 'Reading your vaccinations', vaccinations: 'Reading vaccines and the vaccine booklet' },
  letters: { '': 'Reading your letters', letters: 'Downloading your letters as PDFs' },
  doctorCommunications: { '': 'Reading your messages with your doctor', 'doctor inquiries': 'Downloading messages and forms' },
  emptySections: {
    '': 'Checking for allergies and sensitivities',
    allergies: 'Checking for allergies and sensitivities',
    appointments: 'Checking for upcoming appointments',
    requests: 'Checking your requests with Maccabi',
  },
  openLegacyPage: { '': 'Opening the medical file page in your tab' },
  purchases: {
    '': 'Reading every medication purchase',
    'purchase history': 'Reading every medication purchase',
    'purchase report': 'Creating the 2-year purchase report',
  },
  savedDocuments: { '': 'Reading the documents you uploaded', 'saved documents': 'Downloading your uploads' },
  hospitalStays: { '': 'Reading your hospital stays', 'hospital stays': 'Reading your hospital stays', 'hospital letters': 'Downloading hospital discharge letters' },
  orderMedicalFile: { '': 'Ordering a fresh copy (Maccabi texts you)' },
  returnToSonline: { '': 'Taking your tab back to the main site' },
  waitMedicalFile: {
    '': 'Checking whether your file is ready',
    'waiting for the medical file to appear': 'Waiting for the new file to be listed',
    'medical file status': 'Maccabi is preparing it: up to 15 min',
    letters: 'Downloading your medical file',
  },
  save: { '': 'Packing all files into one ZIP' },
};

/** The current line's name, and a plain description of what it is collecting right now (the panel's activity line). */
export function stepText(run: RunState): { title: string; detail: string } {
  if (run.next >= PLAN.length) return { title: '', detail: '' };
  const step = PLAN[run.next];
  const title = STAGES[currentStage(run)].label;
  const part = partOf(run);
  const described = DESCRIPTIONS[step][part];
  if (described) return { title, detail: described };
  // A part added to the collector without a description here: show it as the collector names it.
  const raw = part.toLowerCase() === title.toLowerCase() ? '' : part;
  return { title, detail: raw && raw[0].toUpperCase() + raw.slice(1) };
}

const FOLDER_LABELS: Record<string, string> = {
  profile: 'Member profile',
  'my-doctor': 'My doctor',
  'test-results': 'Test results',
  'visit-summaries': 'Visit summaries',
  'medications-and-prescriptions': 'Medications and prescriptions',
  referrals: 'Referrals',
  approvals: 'Approvals',
  'info-pages': 'Information pages',
  vaccinations: 'Vaccinations',
  letters: 'Letters',
  // Core's MEDICAL_FILE, spelled out: importing it would bundle the whole collector into the popup.
  'medical-file': 'Full medical file',
  'communication-with-doctor': 'Messages with your doctor',
  uploads: 'Your uploads',
  'hospital-stays': 'Hospital stays',
  'allergies-sensitivity': 'Allergies',
  appointments: 'Upcoming appointments',
  'requests-approvals': 'Your requests to Maccabi',
};

interface ProblemGroup {
  label: string;
  items: Problem[];
}

/**
 * Problems grouped by section, in first-seen order. `where` is a path in the ZIP, `medical-file` for
 * the full medical file, or, for a failed step, the step's name.
 */
export function groupProblems(problems: Problem[]): ProblemGroup[] {
  const groups = new Map<string, Problem[]>();
  for (const p of problems) {
    const head = p.where.split('/')[0];
    const label = FOLDER_LABELS[head] ?? (LABELS as Record<string, string>)[head] ?? head;
    const items = groups.get(label);
    if (items) items.push(p);
    else groups.set(label, [p]);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}

/**
 * A problem as the member reads it. The collector records what the site answered ("HTTP 500"); the popup says what
 * that means and keeps the code, which is what a report needs.
 */
export function problemText(what: string): string {
  const code = /^HTTP (\d{3})\b/.exec(what)?.[1];
  if (!code) return what;
  if (code === '404' || code === '410') return 'Maccabi Online no longer has this file (' + what + ')';
  if (code === '401' || code === '403') return 'Maccabi Online would not release this file (' + what + ')';
  if (code[0] === '5') return 'Maccabi Online failed to send this file (' + what + ')';
  return 'Maccabi Online did not send this file (' + what + ')';
}

export type Confirm = 'cancel' | 'discard';

/** Popup-local interaction state. */
export interface UiFlags {
  /** The request being sent, while waiting for its reply. */
  busy: string | null;
  confirm: Confirm | null;
  /** Cancel was accepted and the run is winding down. */
  stopping: boolean;
  error: string;
}

/**
 * Changes only when the popup's structure must change. Progress updates (percent, detail,
 * step) keep the key, so they are applied in place and never replace a button under the pointer.
 */
export function viewKey(st: StateReply, ui: UiFlags): string {
  const r = st.run;
  const base = r
    ? ['run', r.id, r.status, r.message ?? '', r.status === 'error' ? r.next : '', st.tab.onMaccabi]
    : ['idle', st.noticeAccepted, st.tab.onMaccabi, st.tab.loggedIn, st.tab.name ?? ''];
  return [...base, ui.busy ?? '', ui.confirm ?? '', ui.stopping, ui.error].join('|');
}

/**
 * A confirmation still open, or null when the run has moved past what it asks about: Cancel only while the run can be
 * cancelled, deleting the files only on the error view.
 */
export function keptConfirm(confirm: Confirm | null, run: RunState | null): Confirm | null {
  if (confirm === 'cancel' && !(run && (run.status === 'running' || run.status === 'paused_hidden' || run.status === 'paused_session'))) return null;
  if (confirm === 'discard' && run?.status !== 'error') return null;
  return confirm;
}

/** The one full-width button on the paused and error views: what gets the run going again from here. */
interface NextAction {
  label: string;
  req: Request;
  busyLabel: string;
}

/**
 * Saving again when only the ZIP failed; resuming when the popup is on the Maccabi tab and nothing else is in the way;
 * otherwise going to that tab, since a run is only resumed from it (and a hidden one only by bringing it to the front).
 */
export function nextAction(run: RunState, onMaccabi: boolean): NextAction {
  const focus: NextAction = { label: 'Go to the Maccabi Online tab', req: { type: 'focusTab' }, busyLabel: 'Go to the Maccabi Online tab' };
  if (run.status === 'error' && run.next === PLAN.indexOf('save')) return { label: 'Save again', req: { type: 'retrySave' }, busyLabel: 'Saving…' };
  if (run.status === 'paused_hidden' || !onMaccabi) return focus;
  return { label: run.status === 'error' ? 'Try again' : 'Resume', req: { type: 'resume' }, busyLabel: 'Reconnecting…' };
}

/** The bar's band: from the fill to the end of the current line, in percent (nothing once the run is past the last). */
export function bandSpan(run: RunState): { left: number; width: number } {
  const at = currentStage(run);
  const end = at < STAGES.length ? stageSpan(at).end : run.percent;
  return { left: run.percent, width: Math.max(0, end - run.percent) };
}

/** The running panel's pill, and what a screen reader hears as the bar's value. */
export function progressTexts(run: RunState): { pill: string; valueText: string } {
  const { title, detail } = stepText(run);
  const count = countText(run);
  return {
    pill: run.status === 'saving' ? 'Saving' : 'Exporting · ' + run.percent + '%',
    valueText: run.percent + '%' + (title ? ', ' + title : '') + (detail ? ': ' + detail : '') + (count ? ', ' + count : ''),
  };
}

/** The finished export's line under its name: files, size, how long it took, where it is. */
export function doneSummary(run: RunState): string {
  const took = run.finishedAt ? 'took ' + formatDuration(Date.parse(run.finishedAt) - Date.parse(run.startedAt)) : '';
  return [countOf(run.fileCount ?? 0, 'file', 'files'), run.zipBytes !== undefined && formatBytes(run.zipBytes), took, 'in your Downloads folder']
    .filter(Boolean)
    .join(' · ');
}

/** How many items could not be exported: the total kept beside the first few, never fewer than are shown. */
export function problemCount(run: RunState): number {
  return Math.max(run.problemCount ?? 0, (run.problems || []).length);
}

/** The status a screen reader is told about: a run's, the winding down of a cancelled one, or none. */
export type Announced = RunState['status'] | 'stopping' | 'idle';

const ANNOUNCEMENTS: Record<Exclude<Announced, 'idle'>, string> = {
  running: 'Export running',
  saving: 'Saving the ZIP',
  paused_session: 'Export paused',
  paused_hidden: 'Export waiting for the Maccabi Online tab',
  done: 'Export saved',
  error: 'Export stopped',
  stopping: 'Stopping the export',
};

/**
 * What to tell a screen reader when the status changes from prev to now: null when it has not changed, or when the
 * popup has only just opened (prev null), since its content is read then anyway.
 */
export function announcement(prev: Announced | null, now: Announced): string | null {
  if (prev === now || prev === null) return null;
  if (now === 'idle') return prev === 'stopping' ? 'Export cancelled' : '';
  return ANNOUNCEMENTS[now];
}
