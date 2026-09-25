/* What the popup shows, as pure functions of the run state (unit-tested, no DOM). */
import type { Problem } from '../../core';
import { LABELS, PLAN, type PlanStep, type RunState, type StateReply } from '../shared/state';

export interface Stage {
  label: string;
  steps: PlanStep[];
  /**
   * Only these parts of a single step, as its progress detail names them ('' is the step before its first report),
   * for a step long enough to deserve more than one line.
   */
  parts?: string[];
}

/**
 * The run plan as the user sees it, and the popup's main view of the run: one line per part of the export,
 * named for what it collects, so the list reads as an inventory of the member's records and ticks along at a
 * steady pace. Page changes and bookkeeping steps are folded into the line they serve. The current line says what
 * it is doing under its name (DESCRIPTIONS). Stages are in PLAN order, a step's stages consecutive, and the first
 * stage is labelled with one of its steps' LABELS entries, so errors and problems name it the same way. A step that
 * only serves another shares its label; a step that collects something of its own keeps its own name there, and a
 * step split into parts is named as a whole.
 *
 * Room is the constraint: Chrome caps the popup at 600px, which leaves 20 lines here (16px each, plus the current
 * line's description). Merge before adding a twenty-first.
 */
export const STAGES: Stage[] = [
  // Ordering comes first so Maccabi can build the file while everything else is collected; collecting it is the
  // last stage before the ZIP.
  { label: 'Ordering your medical file', steps: ['openLegacyPage', 'orderMedicalFile'] },
  { label: 'Prescriptions', steps: ['medications'] },
  { label: 'Medication purchases', steps: ['purchases'] },
  { label: 'Your uploads', steps: ['savedDocuments'] },
  { label: 'Hospital stays', steps: ['hospitalStays'] },
  // Allergies, upcoming appointments and requests are three requests, usually empty: they ride along here.
  { label: 'Your details and doctor', steps: ['returnToSonline', 'profileAndDoctors', 'emptySections'] },
  // The longest step by far: its two halves are two lines, or the list would sit on one for a third of the run.
  { label: 'Test results', steps: ['testResults'], parts: ['', 'test results'] },
  { label: 'Lab histories', steps: ['testResults'], parts: ['lab histories'] },
  { label: 'Visit summaries', steps: ['visits'] },
  { label: 'Referrals', steps: ['referrals'] },
  { label: 'Approvals', steps: ['approvals'] },
  { label: 'Information pages', steps: ['infoPages'] },
  { label: 'Vaccinations', steps: ['vaccinations'] },
  { label: 'Letters', steps: ['letters'] },
  { label: 'Messages with your doctor', steps: ['doctorCommunications'] },
  { label: 'Collecting your medical file', steps: ['waitMedicalFile'] },
  { label: 'Saving the ZIP', steps: ['save'] },
];

export type StageState = 'done' | 'current' | 'pending';

type Position = Pick<RunState, 'next' | 'detail'>;

/** The part of the current step the collector last reported ('' before its first report). */
export function partOf(run: Position): string {
  if (run.next >= PLAN.length) return '';
  const title = LABELS[PLAN[run.next]];
  const part = run.detail?.startsWith(title + ': ') ? run.detail.slice(title.length + 2) : '';
  return part.replace(/^medical file status .*/, 'medical file status');
}

/** The index in STAGES of the line the run is on; STAGES.length once it has finished. */
export function currentStage(run: Position): number {
  if (run.next >= PLAN.length) return STAGES.length;
  const step = PLAN[run.next];
  const part = partOf(run);
  const own = STAGES.findIndex((s) => s.steps.includes(step) && s.parts?.includes(part));
  // A part no stage names (or a step with one line) stays on the step's first line.
  return own >= 0 ? own : STAGES.findIndex((s) => s.steps.includes(step));
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

export function countOf(n: number, one: string, many: string): string {
  return n.toLocaleString('en-US') + ' ' + (n === 1 ? one : many);
}

/** The running export's counters: files and size staged so far, and time since it started. */
export function statsText(run: RunState, now: number): string {
  const elapsed = now - Date.parse(run.startedAt);
  return [
    run.fileCount !== undefined && countOf(run.fileCount, 'file', 'files'),
    run.byteCount !== undefined && formatBytes(run.byteCount),
    elapsed >= 60_000 ? formatDuration(elapsed) + ' elapsed' : 'just started',
  ].filter(Boolean).join(' · ');
}

/**
 * What the line under the heading says, per step and per part of it: the key is the collector's progress detail
 * ("lab histories"), and '' is the step before its first progress report. Kept short enough for one line.
 */
export const DESCRIPTIONS: Record<PlanStep, Record<string, string>> = {
  profileAndDoctors: { '': 'Reading your details and your doctor' },
  testResults: {
    '': 'Reading your list of tests',
    'test results': 'Downloading each test result and its PDF',
    'lab histories': 'Saving how each lab value changed over time',
  },
  visits: { '': 'Reading your visit history', visits: 'Downloading visit details and summaries' },
  medications: { '': 'Reading your prescriptions', prescriptions: 'Downloading prescription PDFs' },
  referrals: { '': 'Reading your referrals', referrals: 'Downloading each referral as a PDF' },
  approvals: { '': 'Reading your approvals', approvals: 'Downloading each approval as a PDF' },
  infoPages: { '': 'Reading your information pages', 'information pages': 'Downloading each page as a PDF' },
  vaccinations: { '': 'Reading your vaccinations', vaccinations: 'Reading vaccines and the vaccination booklet' },
  letters: { '': 'Reading your letters', letters: 'Downloading your letters as PDFs' },
  doctorCommunications: { '': 'Reading your messages to your doctor', 'doctor inquiries': 'Downloading messages and attached forms' },
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
    'purchase report': 'Creating the 2-year purchase report PDF',
  },
  savedDocuments: { '': 'Reading the documents you uploaded', 'saved documents': 'Downloading the documents you uploaded' },
  hospitalStays: { '': 'Reading your hospital stays', 'hospital stays': 'Reading your hospital stays', 'hospital letters': 'Downloading hospital discharge letters' },
  orderMedicalFile: { '': 'Ordering a fresh copy (you’ll get an SMS)' },
  returnToSonline: { '': 'Taking your tab back to the main site' },
  waitMedicalFile: {
    '': 'Checking whether your file is ready',
    'waiting for the medical file to appear': 'Waiting for the new file to be listed',
    'medical file status': 'Your medical file is being prepared',
    letters: 'Downloading your medical file',
  },
  save: { '': 'Packing all files into one ZIP' },
};

/** The current line's name, and a plain description of what it is collecting right now. */
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
  appointments: 'Appointments',
  'requests-approvals': 'Requests and approvals',
};

export interface ProblemGroup {
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
