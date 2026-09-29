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
import { israelDay, type PlanStep } from './state';

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
    detail: 'Flags in `member.json` such as `is_diabetes` and `is_cardio` are undocumented — not diagnoses.',
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
hash of the study id in its \`request_id\`), \`cardiology_result\`, \`external_test_result\`. A lab test keeps its values in \`details/\`
(\`results[]\`, one per group, each with \`group_values[]\`; see *Lab values*) and has no PDF; **every
other type has \`results\` empty** and its finding only in the PDF in \`files/\`.
\`history/<test_id>_<name>.json\` is one measurement over time and reaches years further back than
\`details/\`; \`latest-lab-results.json\` is the latest of each.`,
  },
  {
    name: 'visit-summaries',
    summary: 'the last 12 months of visits, and older visits that answered a doctor inquiry, with their summary PDFs',
    detail: `\`details/\` holds the doctor's own words (\`visit_recommendations\`, \`online_requests\`)
and what the visit produced (\`referrals[]\`, \`drugs[]\`, \`approvals\`, \`tutorials\`).
**\`diagnosis[]\` may hold only null fields** — the diagnosis is then in the PDF and the medical file only.
A visit with no summary is \`status\` 204 with \`data\` null; \`has_summery_file\` (sic) says which.
An older visit is named by its \`open_medical_record_number\`, and its \`linked_from\` is the inquiry it answered.`,
  },
  {
    name: 'medications-and-prescriptions',
    summary: 'prescriptions, the full purchase history, a 2-year purchase report',
    detail: `\`list.json\` lists recent prescriptions only, one PDF each. \`is_active\` can stay true
after \`to_date\` has passed. \`purchased-history.html\` is every purchase, as the site's own Hebrew table, encoded
**windows-1255**, with no JSON equivalent; \`purchased-report.json\` and its PDF cover 2 years.`,
  },
  {
    name: 'referrals',
    summary: 'referrals, with their diagnoses and ordered tests, and their PDFs',
    detail: `The reason is \`diagnoses[]\` (\`diagnosis_name\`, in English) — one of the few places the
JSON names a diagnosis; what was ordered is \`lab_tests[]\`, or \`actions[]\` for other referrals.`,
  },
  {
    name: 'approvals',
    summary: 'medical certificates and approvals, and their PDFs',
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
its doses. Older doses may be missing here and appear only in the medical file or the uploads.`,
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
and the reply (\`doctor_remark\`, \`personal_doctor_remark\`); \`files/\` holds the forms, numbered in
list order and named by their kind (\`הפניה\`, \`אישור\`). A form that is the same file as a referral,
prescription or approval is saved once, in its own folder, and the inquiry's \`files[]\` names it;
another form can still be one of those in a different file. \`visit\` is the visit the reply was, in
\`visit-summaries/\`.`,
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
}

const KNOWN = new Set([MEDICAL_FILE, ...FOLDERS.map((f) => f.name)]);

/** The run's problems as the export records them. */
export function exportErrors(problems: { step?: string; where: string; what: string; at: string }[]): ExportError[] {
  return problems.map((p) => {
    const top = p.where.split('/')[0];
    const step = p.step ?? '';
    const folders = KNOWN.has(top) ? [top] : (STEP_FOLDERS[step as PlanStep] ?? []);
    return { folders, step, where: p.where, what: p.what, at: p.at };
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
  return n + ' ' + what + (n === 1 ? '' : 's');
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
    const records = mine.filter((e) => ext(e) === 'json').length;
    const documents = mine.filter((e) => ext(e) && ext(e) !== 'json').length;
    const parts = [records && count(records, 'record'), documents && count(documents, 'document')].filter(Boolean) as string[];
    let line = parts.length ? inWords(parts) + ' could not be collected' : '';
    if (records + documents < mine.length) line = line ? line + ', and collecting the rest stopped partway' : 'collecting it stopped partway';
    lines.push('- `' + name + '/`: ' + line + '.');
  }
  const loose = errors.filter((e) => !e.folders.length).length;
  if (loose) lines.push('- ' + count(loose, 'other failure') + ', not tied to a folder.');
  return lines.join('\n') + '\n\n`' + EXPORT_ERRORS + '` lists each, with where it happened and the error it gave.';
}

function medicalFileSection(file: string | null): string {
  if (!file) {
    return `**This export has no full medical file.** Ordering or downloading it failed, and
\`${EXPORT_ERRORS}\` says why. Without it, this export reaches back only as far as the data below.`;
  }
  return `\`${file}\`, beside this file, is Maccabi Healthcare Services's own printout of the member's record
as of ${file.slice(0, 10)}: personal details, known problems (diagnoses, with the date each began),
sensitivities and lifestyle, then visits back to the earliest on record — reason, findings, diagnosis,
medications, referrals, vaccinations — then copies of the documents filed in the record. **Start
there**: it reaches far further back than the JSON, which holds a few years. Maccabi Healthcare Services's own heading
still calls it partial (חלקי), and if the fresh order this run makes failed, this is an older
file covering less. Its range is the \`from_date\`–\`to_date\` of the \`letter_type\` 2 entry in
\`letters/list.json\`. It runs to hundreds of pages, and extractors often get its Hebrew out
scrambled — a letter per line, or words reversed. If that text reads as nonsense, read the pages
as images.`;
}

/**
 * The README for one export. present is the folders this export actually has, with how many files
 * each holds, so nothing is described that is not there; medicalFile is the name of the full
 * medical file PDF at the root, or null when the export has none; errors is what the run failed to
 * collect (export-errors.json), and made names the extension and file layout that made it.
 */
export function exportReadme(
  exportedOn: string, present: Record<string, number>, medicalFile: string | null, errors: ExportError[], made: MadeBy,
): string {
  const here = FOLDERS.filter((f) => present[f.name]);
  // A step writes its folder whenever the site answers, and files a problem when it does not: a
  // missing folder with a problem against it failed, and one without had nothing on record.
  const failedIn = new Set(errors.flatMap((e) => e.folders));
  const missing = FOLDERS.filter((f) => !present[f.name]);
  const empty = missing.filter((f) => !failedIn.has(f.name)).map((f) => '`' + f.name + '/`');
  const failed = missing.filter((f) => failedIn.has(f.name)).map((f) => '`' + f.name + '/`');
  const absent = (empty.length
    ? '\n  This export has no ' + inWords(empty) + ': the site had nothing on record for ' + (empty.length > 1 ? 'them' : 'it') + '.'
    : '') + (failed.length
    ? '\n  This export has no ' + inWords(failed) + ' because collecting ' + (failed.length > 1 ? 'them' : 'it') +
      ' failed: it cannot say what is\n  on record there. Look in the medical file, and ask.'
    : '');
  const started = israelDay(Date.parse(made.startedAt));
  const version = 'version ' + made.version + ', file layout ' + made.layout + (made.dev ? ' (development build)' : '');
  const folders = here
    .map((f) => '**`' + f.name + '/`** · ' + present[f.name] + ' files — ' + f.summary + '.' +
      (f.detail ? '\n' + f.detail : ''))
    .join('\n\n');
  return `# Maccabi health records export

Exported ${exportedOn}${started !== exportedOn ? ' (collected from ' + started + ')' : ''} from online.maccabi4u.co.il with the
Health Records Export for Maccabi browser extension, ${version}; everything here belongs to one member. If you are an AI assistant working with
these records, this file is your instructions and the records are your project files: read it
before them. It says where to start, what the export lacks and which values mislead.

## How to work with these records

- **Say where each fact comes from** — the file's path, and the page of a PDF — so the member can
  check it. Give each finding its date: a record describes the day it was made, and a diagnosis or
  a medication in an old one may no longer hold.
- **Leave the export as it is.** Write what you make — notes, tables, summaries — into a new folder
  of your own, such as \`notes/\`; never edit, rename or delete the export's files.
- **Keep what the member tells you.** The export cannot say what they take now, what care they had
  elsewhere or what they are allergic to that was never recorded: when they tell you, note it in
  your folder, dated and marked as their word rather than a record's, and read it before asking again.
  Where their word and a record disagree, show both, each with its date; don't choose between them.
  This export starts with no notes: if the member points you to an earlier export's, read them first
  and copy them into this export's folder.
- **Keep the member's name, ID number and contact details out of anything that leaves this
  computer** — web searches, other services, messages — unless the member asks for it.
- **If a record suggests something needs a doctor soon, say so plainly** and point to it. Explain
  the records in plain language, not the clinical shorthand they are written in, and when the member
  should ask for something — a test, a referral — give the Hebrew name to ask for it by. Don't
  diagnose, and don't advise changing a treatment.

Where to look: for a health history, the medical file; for one condition, its line in the medical
file's known problems, then every visit, referral and result about it, whichever doctor it was
with — keep a condition's notes together, not a doctor's; for a measurement over time,
\`test-results/history/\`, and the latest of each in \`latest-lab-results.json\`; for what changed
since the last visit, whatever is dated after the newest file in \`visit-summaries/\` — results,
prescriptions, referrals, letters; for an appointment, the medical file's known problems, the latest
results, recent \`visit-summaries/\` and open \`referrals/\`; for allergies, \`allergies-sensitivity/\`
and the medical file's sensitivities; for hospital stays, \`hospital-stays/\` for when and where,
its discharge letters and the medical file for what happened; for preventive care due, age and sex in
\`profile/member.json\`, \`vaccinations/\` and the screenings in \`test-results/\`, judged by Israel's
current guidance (the Ministry of Health's and Maccabi Healthcare Services's), which differs from
other countries' and changes: look it up, don't recall it. What the member
actually bought is in \`purchased-history.html\`, not the prescriptions; neither shows what they take
now, so ask.

## Start with the full medical file

${medicalFileSection(medicalFile)}

## What this export does not contain

**Something missing here is not evidence that it never happened.** The export holds what the member
site returns, which is less than Maccabi Healthcare Services holds, which is less than the member's medical history.

- Visits over 12 months old, except those that answered an inquiry to a doctor, and tests older
  than the site's list — as data. \`history/\` goes
  further back, but only for measurements taken in at least one listed test.
- Prescriptions beyond the recent ones the site lists, and purchases over 2 years old in
  \`purchased-report.pdf\`. \`purchased-history.html\` still covers every purchase.
- Images: no DICOM, ever — the site opens studies only in its own viewer.
- Values for anything but lab tests: imaging, cardiology and external findings are only in a PDF.
- Care outside Maccabi Healthcare Services, except what was filed with Maccabi Healthcare Services: external results, documents copied into
  the medical file, the member's own uploads.
- Sections the site had nothing for. A folder exists only when the site returned something, so a
  missing folder that did not fail means "nothing on record", not "this was not checked".${absent}

## What is in this export

A folder holds the site's list in \`list.json\`, one JSON file per item in \`details/\` where the site
has one, and documents in \`files/\`; a record's JSON and its PDF share a file name.

${folders}

## What this export failed to collect

${failedSection(errors)}

## Lab values

Every value in \`group_values[]\`, \`current_result\`, \`other_results[]\` and
\`latest-lab-results.json\` has the same fields: \`test_id\` and \`test_desc\` (the measurement),
\`result\`, \`units\`, the reference range \`min_lim\`–\`max_lim\` (all numbers) and \`lab_date\`.

- **\`min_lim\` and \`max_lim\` both 0 means no range was given**, not a range of 0 to 0, and
  \`numeric_percentage\` (where \`result\` sits in the range) is then 0 and means nothing.
- **A \`result\` of 0 is often not a measurement.** When the answer is text, \`result\` is 0 and the
  text is in \`message\` (\`NEGATIVE\`) or, when \`is_messages\` is \`"2"\`, only in \`message_list\`
  (\`Undetectable\`, or a note that the test was not done). Read both before trusting a 0.
- \`message_list\` is one note split into display lines (a reference range, a method change, an
  interpretation); join them. Its Hebrew is sometimes in visual order, numbers and punctuation at the
  wrong end: \`.60 ערך רצוי מעל\` reads "a value above 60 is desirable".
- **Ranges and units change over time**: within one \`history/\` file, \`min_lim\`–\`max_lim\` and
  \`units\` can differ by date, and older \`units\` may be blank. Judge each result against its own
  range; don't trend across a change of units.
- Two measurements can share a name and differ only by a symbol — \`Eosinophils #\` is a count,
  \`Eosinophils %\` a share. \`history/\` file names drop the symbol; \`test_desc\` and \`units\` keep it.
- **The same values appear up to three times:** in \`details/\` by test, in \`history/\` by measurement,
  and the latest in \`latest-lab-results.json\`. Count each (\`test_id\`, \`lab_date\`) once;
  \`history/\` holds the most.

## Dates, text and ids

- Dates are ISO 8601 in Israel local time, usually without an offset (\`2026-02-25T11:09:00\`);
  \`fetched_at\` is UTC. \`T00:00:00\` means no time of day. A few are not ISO: \`DD/MM/YY\`
  (\`item_date\`, \`next_month_date\`), \`DD/MM/YYYY\` (\`DocumentDate\`), \`YYYYMMDD\` and \`YYYYMM\`
  (insurance dates), \`DD-MM-YYYY\` (\`purchased-history.html\`).
- **Some dates are placeholders:** \`0001-01-01T00:00:00\` means never set, \`1900-01-01T00:00:00\` in
  a validity range means there is none. The one real \`1900-01-01\` is the medical file's
  \`from_date\` in \`letters/list.json\`: it means the file was asked for from the start, not that it
  is complete.
- Field names are English and keep the site's misspellings (\`has_summery_file\`) — search for
  them as spelled. Values are mostly
  Hebrew, often padded with spaces; \`""\`, \`"0"\` and \`null\` usually mean none. Codes (status,
  type, insurance, speciality) are Maccabi Healthcare Services's own and documented nowhere: trust the description beside them.
- Match people by id, never by name: names run either way round and titles are spelled several ways
  (\`ד"ר\`, \`דר'\`, \`ד'ר\`). An id can be a number in one file and a zero-padded string in another
  (\`12345678\`, \`"012345678"\`) — compare ids as numbers.
- **Fields that say nothing about the record**, re-signed or re-stamped on every request: \`hash\`,
  \`timestamp\`, \`time_stamp\`, \`t\`, \`corona_hash\`, \`corona_t\`, \`token\`, \`searchQueryId\`,
  \`file_name_title\`, \`url\`, and every field whose name ends in \`link\` (expiring signed paths, not
  stable references). A \`timestamp\` is the request moment in .NET ticks, not the record's time —
  \`timestamp_sequence\` is a real time. \`is_read\`, \`is_advertised\` and \`fetched_at\` describe the
  site and the export, not the member.

## Joining records across files

| To connect | Use |
|---|---|
| A list item, its details and its PDF | The file name: the id in it is the list item's id |
| A lab measurement over time | \`test_id\`, in \`test-results/history/<test_id>_*.json\` |
| A visit to what it produced | \`referrals[].referral_id\` is \`referral_id\` in \`referrals/list.json\`; \`drugs[].largo_code\` is \`drug_largo_code\` in \`medications-and-prescriptions/list.json\` |
| A referral's lab tests to their results | \`lab_tests[].lab_test_number\` is often a \`test_id\` padded with zeros (\`06291\` is \`6291\`) |
| A doctor across files | Employee number: \`employee_id\`, \`emp_number\`, \`employee_number\`, \`pernr\`. Position: \`position_id\`, \`position_number\`, \`object_id\`. Practitioner id: \`practitioner_id\`, \`service_provider_id\`, \`doctor_id\` |

## How files are shaped

Every JSON file is one response from the site, kept as it was sent, wrapped as
\`{endpoint, fetched_at, status, data}\`. \`{mid}\` stands for the member id, never written into
\`endpoint\`. \`status\` is 200, or 204 when the site had nothing — \`data\` is then null. \`omitted\`
names what was left out of \`data\` (a report's PDF, kept in \`files/\` instead of as base64). A
details file repeats the list fields it was fetched with, so it stands on its own. \`files[]\` lists a
record's documents: \`file\`, its own, or \`same_as\`, a file elsewhere in the export with the same
bytes, which is kept instead of a second copy.

File names are \`<date>_<id>_<title>.<ext>\`. \`<date>\` is the record's own date or \`undated\`;
\`<id>\` is the site's id (with the test type, in \`test-results/\`), or a hash where the site gives
none, plus \`-1\`, \`-2\` when a record has several documents; \`<title>\` is a display string,
Hebrew kept (with its abbreviation marks, ״ and ׳) and other punctuation turned into \`-\`, left out
when there is none. \`_\` appears nowhere else, and \`test-results/history/\` and \`vaccinations/details/\` name files by what they hold, with no date.

## Before sharing this export

The member's national ID number runs through the data — \`id_number\`, \`member_id\`, \`user_id\`,
\`recipient_id\`, inside \`doc_id\`, \`virtual_key\` and \`name_document\` — and is printed on nearly
every page of the medical file and on most PDFs. File names never carry it. \`profile/member.json\`
also holds the address, phone numbers and email. The ZIP is not encrypted: anyone, or any service,
given it can read it.
`;
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
