/* What the popup shows, as pure functions of the run state (unit-tested, no DOM). */
import type { Problem } from '../../core';
import { LABELS, PLAN, type PlanStep, type RunState, type StateReply } from '../shared/state';

export interface Stage {
  label: string;
  steps: PlanStep[];
}

/**
 * The run plan as the user sees it: page changes and bookkeeping steps belong to the section they
 * serve, and a stage per collection step wherever there is room for one. Room is the constraint:
 * Chrome caps the popup at 600px, which leaves about 13 lines here, so steps that take little time
 * and write little (the often-empty sections, the three referral resources) share a stage with the
 * one beside them. Each stage's steps must be consecutive in PLAN, or stageStates would mark a
 * stage current again after a later one is done.
 */
export const STAGES: Stage[] = [
  // Ordering comes first so Maccabi can build the file while everything else is collected; the
  // download of it is the last stage before the ZIP.
  { label: 'Ordering your medical file', steps: ['openLegacyPage', 'orderMedicalFile'] },
  // One folder, medications-and-prescriptions/, but two stages: the REST API's prescriptions, then
  // the legacy purchase history and its report, which fail in quite different ways.
  { label: 'Prescriptions', steps: ['medications'] },
  { label: 'Medication purchases', steps: ['purchases'] },
  // The uploads and the hospital stays both come from the old site; the stays are one request, too
  // small for a line of their own.
  { label: 'Your uploads and hospital stays', steps: ['savedDocuments', 'hospitalStays'] },
  { label: 'Your details and doctor', steps: ['returnToSonline', 'profileAndDoctors'] },
  { label: 'Test results', steps: ['testResults'] },
  { label: 'Visit summaries', steps: ['visits'] },
  // Three steps and three folders under one line: the step title names each as it runs.
  { label: 'Referrals, approvals and information pages', steps: ['referrals', 'approvals', 'infoPages'] },
  { label: 'Vaccinations', steps: ['vaccinations'] },
  { label: 'Letters', steps: ['letters'] },
  // emptySections is three requests for sections that are usually empty; it rides along here
  // rather than taking a line of its own.
  { label: 'Messages with your doctor', steps: ['doctorCommunications', 'emptySections'] },
  { label: 'Full medical file', steps: ['waitMedicalFile'] },
  { label: 'Saving the ZIP', steps: ['save'] },
];

export type StageState = 'done' | 'current' | 'pending';

/** next is the index into PLAN of the step to run next (PLAN.length once finished). */
export function stageStates(next: number): StageState[] {
  return STAGES.map((stage) => {
    const idx = stage.steps.map((s) => PLAN.indexOf(s));
    if (idx.every((i) => i < next)) return 'done';
    if (idx.some((i) => i <= next)) return 'current';
    return 'pending';
  });
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
  emptySections: { '': 'Checking sections that are often empty', 'other sections': 'Checking allergies, appointments and requests' },
  openLegacyPage: { '': 'Needed for the old site’s records and the order' },
  purchases: {
    '': 'Reading every medication purchase',
    'purchase history': 'Reading every medication purchase',
    'purchase report': 'Creating the 2-year purchase report PDF',
  },
  savedDocuments: { '': 'Reading the documents you uploaded', 'saved documents': 'Downloading the documents you uploaded' },
  hospitalStays: { '': 'Reading your hospital stays', 'hospital stays': 'Reading your hospital stays' },
  orderMedicalFile: { '': 'Ordering a fresh copy (you’ll get an SMS)' },
  returnToSonline: { '': 'Keeps your session alive during the wait' },
  waitMedicalFile: {
    '': 'Collecting your newly prepared medical file',
    'waiting for the medical file to appear': 'Waiting for the new file to be listed',
    'medical file status': 'Your medical file is being prepared',
    letters: 'Downloading your medical file',
  },
  save: { '': 'Packing all files into one ZIP' },
};

/** The current step's name, and a plain description of what it is collecting right now. */
export function stepText(run: RunState): { title: string; detail: string } {
  if (run.next >= PLAN.length) return { title: '', detail: '' };
  const step = PLAN[run.next];
  const title = LABELS[step];
  const part = run.detail?.startsWith(title + ': ') ? run.detail.slice(title.length + 2) : '';
  const described = DESCRIPTIONS[step][part.replace(/^medical file status .*/, 'medical file status')];
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
