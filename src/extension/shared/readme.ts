/* The README.md written at the root of the ZIP. The export is made to be handed to an AI assistant
   -- the Claude desktop app, Claude Code, ChatGPT Work, Codex -- and this file is that assistant's saved
   instructions, the records its project files. So it opens with how to work with them, then is the
   export's data dictionary: where to start, what the export does not contain, how it is laid out,
   and the fields that do not mean what they appear to mean. It is written from real exports; every
   claim about a field was checked against one.

   It shares the assistant's context with the records themselves, so it is kept short on purpose.
   It says only what a reader cannot get by opening a file -- the layout, the gaps, the traps, the
   join keys -- and leaves the field names to the JSON, which carries them already. Before adding a
   line, ask whether a record would be read wrongly without it; if not, leave it out. */
import { countOf, israelToday } from '../../core/util';
import { PRODUCT_NAME } from './name';
import { SITE_OPEN, type PlanStep } from './state';
import template from './export-readme.md?raw';

interface Folder {
  name: string;
  /** One line: what the folder holds. */
  summary: string;
  /** Only what a reader would get wrong without it: layout that is not obvious, and fields that mislead. */
  detail: string;
}

/** Folders that may appear in an export, in reading order. */
const FOLDERS: Folder[] = [
  {
    name: 'profile',
    summary: "the member, entitlements, insurance seniority, their doctors' directory entries",
    detail: `Flags in \`member.json\` such as \`is_diabetes\` and \`is_cardio\` are undocumented — not diagnoses,
and false says nothing either: \`is_chronical_prescriptions\` can be false for a member on permanent drugs.`,
  },
  {
    name: 'my-doctor',
    summary: 'the assigned doctors, and whether the member may change them',
    detail: '`ascribed.json` is the family doctor on the export day, present only when the site named one.',
  },
  {
    name: 'test-results',
    summary: 'lab, imaging, cardiology and external results',
    detail: `\`list.json\` is \`tests[]\`, each with a \`type\`: \`lab_result\`, \`imaging_result\` (a
radiologist's report), \`imaging_study\` (the images — never exported; details, no PDF, named by a
hash of the study id in its \`request_id\`), \`usg_result\` (ultrasound), \`pat_lab_result\`
(pathology, such as PAP, also listed as a \`lab_result\`: both hold only a note), \`cardiology_result\`, \`external_test_result\`. A lab test keeps its values in \`details/\`
(\`results[]\`, one per group, each with \`group_values[]\`; see *Lab values*) and has no PDF; **every
other type has its finding only in the PDF** in \`files/\`.
\`history/<test_id>_<name>.json\` is one measurement over time and reaches years further back than
\`details/\`; \`latest-lab-results.json\` is the latest of each.`,
  },
  {
    name: 'visit-summaries',
    summary: 'the last 12 months of visits, and older visits that answered a doctor inquiry, with their summary PDFs',
    detail: `\`details/\` holds the doctor's own words (\`visit_recommendations\`, \`online_requests\`)
and what the visit produced (\`referrals[]\`, \`drugs[]\`, \`approvals\`, \`tutorials\`).
**\`diagnosis[]\` often holds only null fields** — the diagnosis is then in the PDF and the medical file only.
A visit with no summary is \`status\` 204 with \`data\` null; \`has_summery_file\` (sic) says which, and what it
held (a vaccination, blood pressure, weight) is in the medical file under its date. A visit is not always a
meeting: a doctor answering an online request opens one (\`online_requests\` \`הטפסים הופקו לבקשתך\`, the
forms issued at the member's request), often only a prescription renewal, with the member not seen.
An older visit is named by its \`open_medical_record_number\`, and its \`linked_from\` is the inquiry it answered.`,
  },
  {
    name: 'medications-and-prescriptions',
    summary: 'prescriptions, the full purchase history, a 2-year purchase report',
    detail: `\`list.json\` lists recent prescriptions only. \`files/\` holds one PDF per visit, named by its
\`clicks_visit_number\`: the page of every drug prescribed then, not a prescription of its own. \`is_active\` stays true long after \`to_date\` has passed: go by the dates. A long course is a chain
of monthly prescriptions, often all dispensed on one day, the last starting after the export;
\`purchased-history.html\` then has one row per pack, identical ones included: count every row. \`drug_*\` is what was prescribed and
\`dispensed_drug_*\` what the pharmacy gave, often another product (a generic). \`purchased-history.html\` is every purchase, as the site's own Hebrew table, encoded
**windows-1255**, with no JSON equivalent; \`purchased-report.json\` and its PDF cover 2 years.`,
  },
  {
    name: 'referrals',
    summary: 'referrals, with their diagnoses and ordered tests, and their PDFs',
    detail: `The reason is \`diagnoses[]\` (\`diagnosis_name\`, in English) — one of the few places the
JSON names a diagnosis, though some are a purpose, not a condition (\`CHRONIC MEDICATION REFILL\`,
\`TEST LABORATORY\`, \`PERIODIC COMPREHENSIVE HEALTH ASSESSMENT\`), or a risk (\`FAMILY HISTORY OF COLON CANCER\`); what was ordered is \`lab_tests[]\`, or \`actions[]\`, or when both are empty only
\`displaying_name\` (\`title_name\` is just the kind, such as a specialist consultation).
\`chronic_medications[]\` is the member's chronic drug list on the referral's day.`,
  },
  {
    name: 'approvals',
    summary: "medical certificates, approvals and specialists' answers (\`תשובת יועץ\`), and their PDFs",
    detail: `\`approval_date_from\` and \`approval_date_to\` of \`1900-01-01\` mean no validity period.
Approvals have no id, so their file names carry a hash of the record's fields.`,
  },
  {
    name: 'info-pages',
    summary: 'pages a practitioner gave the member, with their PDFs',
    detail: 'They are general health information, **not about the member** — only being given them is.',
  },
  {
    name: 'vaccinations',
    summary: 'vaccinations by vaccine, flu eligibility, the vaccination booklet PDF',
    detail: `\`list.json\` is one entry per vaccine, and \`details/<vaccine_group_code>_<name>.json\` lists
its doses. Older doses may be missing here and appear only in the medical file or the uploads.
\`age_on_vaccination\` is years.months with a trailing zero dropped (\`68.1\` can be 68 years 10 months):
work age out from \`vaccination_date\` and the birth date instead.`,
  },
  {
    name: 'letters',
    summary: 'letters Maccabi Healthcare Services sent the member; also lists the full medical file',
    detail: `\`letter_type\` 1 is a letter, its PDF in \`files/\`; \`letter_type\` 2 is the full medical
file — \`from_date\`–\`to_date\` is the range it covers, \`status\` 1 means ready, and its PDF is the
one beside this README. Use \`original_item_date\`: \`item_date\` is a display string (\`היום\`, "today").`,
  },
  {
    name: 'communication-with-doctor',
    summary: 'exchanges with doctors, both ways, and the forms attached',
    detail: `\`details/\` holds what the member wrote (\`general_question_subject\`, \`patient_remark\`)
and the reply (\`doctor_remark\`, \`personal_doctor_remark\`). Not every one is the member's: the doctor
starts some (\`request_status_desc\` \`יזומה ע"י הרופא\`), and a structured request, such as a prescription
renewal, has no text of the member's, only what was asked for (\`prescription_largo_code_list\`). \`files/\` holds the forms, numbered in
list order and named by the kind the site gives them (\`הפניה\`, \`אישור\`), which can be wrong. A form that is the same file as a referral,
prescription or approval is saved once, in its own folder, and the inquiry's \`files[]\` names it;
another form can still be one of those in a different file. \`visit\` is the visit the reply was, in
\`visit-summaries/\`. \`patient_gender\` and \`patient_age\` can be wrong (\`נ\`, female, for a man): take
sex and age from \`profile/member.json\`.`,
  },
  {
    name: 'uploads',
    summary: 'documents the member uploaded to the site',
    detail: `\`files/\` holds each document in the format it was uploaded in, often a photo or a scan.
A document uploaded twice is saved once, and the second's \`files[]\` names the first.
There is no \`list.json\`: the site's list is a web page, not data.`,
  },
  {
    name: 'hospital-stays',
    summary: 'hospital visits: date, kind of visit, hospital and department, with any discharge letters',
    detail: `\`TypeCommitment\` is the kind of visit (\`אשפוז\` is an admission). Use \`Date\`:
\`DateHospitalization\` is day, month and year run together, not zero-padded. Maccabi Healthcare
Services's own page shows only those four; \`DescriptionTreatment\` and \`DescriptionDistinction\` are
not shown there, and **can hold only billing lines** such as \`HOSPITALIZATION - PER DAY\`, not
treatments or diagnoses. What happened in hospital is in the discharge letter in \`files/\` (the
visits with \`HasLink\` true have one) or else in the medical file, under the visit's dates. The list
is as the site sent it: strings padded with spaces, blank \`Description\` entries, and a visit can be
listed twice (count it once).`,
  },
  {
    name: 'allergies-sensitivity',
    summary: 'recorded sensitivities and intolerances (`intolerance[]`)',
    detail: `An empty \`intolerance\` means Maccabi Healthcare Services has no sensitivity on record, not that the
member has none: check the medical file's sensitivities, and ask.`,
  },
  { name: 'appointments', summary: 'future appointments only — past ones are visits, in `visit-summaries/`', detail: '' },
  { name: 'requests-approvals', summary: 'requests and cases the member has open with Maccabi Healthcare Services', detail: '' },
];

/** Core's MEDICAL_FILE, the name its problems are filed under, spelled out: this file imports nothing from core. */
const MEDICAL_FILE = 'medical-file';

/**
 * The folders each plan step writes, for a problem filed under the step rather than a file: a step
 * that failed as a whole. The medical file's steps write to the root, and are put against the file.
 */
export const STEP_FOLDERS: Record<PlanStep, string[]> = {
  openLegacyPage: [],
  orderMedicalFile: [MEDICAL_FILE],
  profileAndDoctors: ['profile', 'my-doctor'],
  emptySections: ['allergies-sensitivity', 'appointments', 'requests-approvals'],
  medications: ['medications-and-prescriptions'],
  purchases: ['medications-and-prescriptions'],
  hospitalStays: ['hospital-stays'],
  savedDocuments: ['uploads'],
  returnToSonline: [],
  testResults: ['test-results'],
  visits: ['visit-summaries'],
  referrals: ['referrals'],
  approvals: ['approvals'],
  vaccinations: ['vaccinations'],
  letters: ['letters'],
  doctorCommunications: ['communication-with-doctor'],
  infoPages: ['info-pages'],
  waitMedicalFile: [MEDICAL_FILE],
  save: [],
};

/**
 * The folders, and the medical file, that a run of only these steps did not ask the site for: what the steps it
 * left out write, less what the ones it ran write too. A popup run takes every step, so this is for a run that
 * does not (the terminal export): its README must not say the site had nothing there.
 */
export function notCollected(ran: readonly string[]): string[] {
  const asked = new Set(ran.flatMap((s) => STEP_FOLDERS[s as PlanStep] ?? []));
  const left = (Object.keys(STEP_FOLDERS) as PlanStep[]).filter((s) => !ran.includes(s)).flatMap((s) => STEP_FOLDERS[s]);
  return [...new Set(left)].filter((f) => !asked.has(f));
}

/** The export's list of what it failed to collect, written beside the README. */
export const EXPORT_ERRORS = 'export-errors.json';

/**
 * One entry of export-errors.json: a problem the run filed, with the folders it is about -- the one
 * its path is in, else the ones its step writes, else none.
 */
export interface ExportError {
  folders: string[];
  step: string;
  where: string;
  what: string;
  at: string;
  /** 'shape': the site answered in a shape the extension does not read, so it may have changed (core's Problem.kind). */
  kind?: 'shape';
}

const KNOWN = new Set([MEDICAL_FILE, ...FOLDERS.map((f) => f.name)]);

/** The run's problems as the export records them. */
export function exportErrors(problems: { step?: string; where: string; what: string; at: string; kind?: 'shape' }[]): ExportError[] {
  return problems.map((p) => {
    const top = p.where.split('/')[0];
    const step = p.step ?? '';
    const folders = KNOWN.has(top) ? [top] : (STEP_FOLDERS[step as PlanStep] ?? []);
    return { folders, step, where: p.where, what: p.what, at: p.at, ...(p.kind && { kind: p.kind }) };
  });
}

/** What the export's version line says made it. startedAt is the run's start, an ISO time. */
export interface MadeBy {
  version: string;
  layout: number;
  startedAt: string;
  dev: boolean;
}

/** "a", "a and b", "a, b and c". */
function inWords(items: string[]): string {
  return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

function count(n: number, what: string): string {
  return countOf(n, what, what + 's');
}

/** One line per folder something failed in, in reading order, and one for the rest. */
function failedSection(errors: ExportError[]): string {
  if (!errors.length) return 'Every request in this run was answered: `' + EXPORT_ERRORS + '` is empty.';
  const lines: string[] = [];
  for (const name of [MEDICAL_FILE, ...FOLDERS.map((f) => f.name)]) {
    const mine = errors.filter((e) => e.folders.includes(name));
    if (!mine.length) continue;
    if (name === MEDICAL_FILE) {
      lines.push('- The full medical file: ordering or downloading a fresh one failed.');
      continue;
    }
    // A path with an extension is one file; a bare folder or a step's name is the step failing partway.
    const ext = (e: ExportError) => (e.where.split('/').pop() || '').match(/\.([a-z0-9]+)$/i)?.[1];
    // A list in a shape the extension does not read left its records uncollected, however many there were.
    const shape = mine.filter((e) => e.kind === 'shape');
    const rest = mine.filter((e) => e.kind !== 'shape');
    const records = rest.filter((e) => ext(e) === 'json').length;
    const documents = rest.filter((e) => ext(e) && ext(e) !== 'json').length;
    const parts = [records && count(records, 'record'), documents && count(documents, 'document')].filter(Boolean) as string[];
    let line = parts.length ? inWords(parts) + ' could not be collected' : '';
    if (records + documents < rest.length) line = line ? line + ', and collecting the rest stopped partway' : 'collecting it stopped partway';
    if (shape.length) {
      const changed = 'Maccabi answered in a shape the extension does not know (the site may have changed), so records in it may be missing';
      line = line ? changed + '; also, ' + line : changed;
    }
    lines.push('- `' + name + '/`: ' + line + '.');
  }
  const loose = errors.filter((e) => !e.folders.length).length;
  if (loose) lines.push('- ' + count(loose, 'other failure') + ', not tied to a folder.');
  return lines.join('\n') + '\n\n`' + EXPORT_ERRORS + '` lists each, with where it happened and the error it gave.';
}

function medicalFileSection(file: string | null, asked: boolean): string {
  if (!file && !asked) {
    return `**This export has no full medical file.** This run did not order one, and took none from the
site. Without it, this export reaches back only as far as the data below.`;
  }
  if (!file) {
    return `**This export has no full medical file.** Ordering or downloading it failed, and
\`${EXPORT_ERRORS}\` says why. Without it, this export reaches back only as far as the data below.`;
  }
  return `\`${file}\`, beside this file, is Maccabi Healthcare Services's own printout of the member's record
as of ${file.slice(0, 10)}. **Start there**: it reaches far further back than the JSON. In order:

- The printout, each page headed \`דף N\`, its page in the PDF. Page 1 has known problems (diagnoses,
  with the date each began) and sensitivities; then visits back to the earliest on record, in groups,
  each in date order.
- A few documents in no order, then copies of older ones headed \`העתק\` and their copy date
  (mid-2021): the document's own date is inside it.
- The documents filed since, in date order.

Its heading still calls it partial (חלקי), and if the fresh order this run makes failed, this is an
older file covering less (its range is in \`letters/\`). Extracted, its Hebrew often comes out
scrambled — a letter per line, or words reversed: then read the pages as images.`;
}

/**
 * The README's fixed text, with a {{name}} where exportReadme puts what this export holds. Its wording is edited
 * there, as Markdown; the parts that depend on the export (the medical file, the folders, what failed) are built here.
 */
const TEMPLATE: string = template;

/** The template with each {{name}} replaced; a name with no value is a mistake in one or the other. */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error('export-readme.md asks for {{' + name + '}}, which exportReadme does not give');
    return values[name];
  });
}

/**
 * The website's section on opening an export, for the one line addressed to the member: whoever opens the export
 * months later has no popup to ask, only this file.
 */
const AI_PAGE = SITE_OPEN;

/**
 * The README for one export. present is the folders this export actually has, with how many files
 * each holds, so nothing is described that is not there; medicalFile is the name of the full
 * medical file PDF at the root, or null when the export has none; errors is what the run failed to
 * collect (export-errors.json), and made names the extension and file layout that made it. skipped
 * is what this run did not ask for (notCollected), for a run that takes only some of the steps.
 */
export function exportReadme(
  exportedOn: string, present: Record<string, number>, medicalFile: string | null, errors: ExportError[], made: MadeBy,
  skipped: readonly string[] = [],
): string {
  const here = FOLDERS.filter((f) => present[f.name]);
  // A step writes its folder whenever the site answers, and files a problem when it does not: a
  // missing folder with a problem against it failed, and one without had nothing on record.
  const failedIn = new Set(errors.flatMap((e) => e.folders));
  const missing = FOLDERS.filter((f) => !present[f.name]);
  const empty = missing.filter((f) => !failedIn.has(f.name) && !skipped.includes(f.name)).map((f) => '`' + f.name + '/`');
  const failed = missing.filter((f) => failedIn.has(f.name)).map((f) => '`' + f.name + '/`');
  const unasked = missing.filter((f) => !failedIn.has(f.name) && skipped.includes(f.name)).map((f) => '`' + f.name + '/`');
  const absent = (unasked.length
    ? '\n  This export has no ' + inWords(unasked) + ': ' + (unasked.length > 1 ? 'they were' : 'it was') +
      ' not collected in this run, so it cannot say what is\n  on record there.'
    : '') + (empty.length
    ? '\n  This export has no ' + inWords(empty) + ': the site had nothing on record for ' + (empty.length > 1 ? 'them' : 'it') + '.'
    : '') + (failed.length
    ? '\n  This export has no ' + inWords(failed) + ' because collecting ' + (failed.length > 1 ? 'them' : 'it') +
      ' failed: it cannot say what is\n  on record there. Look in the medical file, and ask.'
    : '');
  const started = israelToday(Date.parse(made.startedAt));
  const version = 'version ' + made.version + ', file layout ' + made.layout + (made.dev ? ' (development build)' : '');
  const folders = here
    .map((f) => '**`' + f.name + '/`** · ' + count(present[f.name], 'file') + ' — ' + f.summary + '.' +
      (f.detail ? '\n' + f.detail : ''))
    .join('\n\n');
  return fill(TEMPLATE, {
    site: AI_PAGE,
    exported: exportedOn + (started !== exportedOn ? ' (collected from ' + started + ')' : ''),
    product: PRODUCT_NAME,
    version,
    medicalFile: medicalFileSection(medicalFile, failedIn.has(MEDICAL_FILE) || !skipped.includes(MEDICAL_FILE)),
    absent,
    folders,
    failed: failedSection(errors),
  });
}

/**
 * Files written beside README.md so that coding assistants take it as their instructions without
 * being told to: each loads a file of its own name from the folder it is opened in, and none loads a
 * README. Claude Code's CLAUDE.md imports it with `@`; Codex's AGENTS.md has no imports, so it says
 * where to look.
 */
export const INSTRUCTION_POINTERS: Record<string, string> = {
  'CLAUDE.md': `This folder's instructions are in README.md, beside this file:

@README.md
`,
  'AGENTS.md': `Read README.md, beside this file, before anything else, and follow it: it is this folder's
instructions — where to start, what the export lacks and which values mislead.
`,
};
