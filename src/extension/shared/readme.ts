/* The README.md written at the root of the ZIP. It is the export's data dictionary, aimed at
   whoever -- or whatever -- reads the export next: where to start, what the export does not
   contain, what each file holds, and the fields that do not mean what they appear to mean. It is
   written from real exports; every claim about a field was checked against one. */

interface Folder {
  name: string;
  /** One line in the contents table. */
  summary: string;
  /** Its entry under "Folder by folder": what each file holds and the fields worth knowing. */
  detail: string;
}

/** Folders that may appear in an export, in reading order. */
const FOLDERS: Folder[] = [
  {
    name: 'profile',
    summary: "The member's details, entitlements, insurance seniority, and their doctors' directory entries.",
    detail: `- \`member.json\` — the member: name in Hebrew and English (\`first_name_hebrew\`,
  \`last_name_english\`, ...), \`birth_date\`, \`sex\`, \`age\`, home address (\`living_*\`), phone
  numbers, \`email\`, the family doctor (\`linked_doc_first_name\`, \`linked_doc_last_name\`), and
  supplementary insurance (\`ins_group_N\`, joined \`ins_date_N\`, paid until
  \`ins_payed_until_date_N\`). Flags such as \`is_diabetes\` and \`is_cardio\` are undocumented; do
  not read them as diagnoses.
- \`entitlement.json\` — the member's current eligibility for services, and who pays.
- \`insurance-seniority.json\` — \`insurance_groups[]\`: each insurance plan (\`ins_type_code\`),
  when it began (\`ins_seniority_date\`), and whether it is \`active\` or \`cancelled\`.
- \`providers.json\` — the site's directory entry for each of the member's assigned doctors:
  clinic address, phones (\`contacts[]\`), specialities, and reception hours
  (\`schedules.schedule[]\`).`,
  },
  {
    name: 'my-doctor',
    summary: "The member's assigned doctors, and whether they may change them.",
    detail: `- \`assigned-practitioners.json\` — \`data[]\`: the doctors the member is assigned to, with
  \`practitioner_name\`, \`clinic_address\` and their ids.
- \`ascribed.json\` — the member's family doctor as of the export day: name, \`license_number\`,
  clinic address and phones. Present only when the site named one.
- \`eligibilities.json\` — whether the member may change doctor now, and \`last_visit_date\` with
  the assigned doctor.`,
  },
  {
    name: 'test-results',
    summary: 'Lab, imaging, cardiology and external results: the list, each result, each lab measurement over time, and result PDFs.',
    detail: `- \`list.json\` — \`tests[]\`: every test the site lists, of every \`type\`: \`lab_result\`,
  \`imaging_result\` (a radiologist's report), \`imaging_study\` (the images, not exported),
  \`cardiology_result\`, \`external_test_result\` (done at another institute), and possibly
  others. Each has \`execute_date\`, \`result_date\`, \`category_name\`, \`referrer_name\` (who
  ordered it) and \`executing_institute\`; anything but a lab test is named in \`test_category[]\`
  and \`procedures[]\`.
- \`details/<date>_<request_id>-<type>.json\` — one test. For a lab test, \`results[]\` holds groups
  (\`group_name\`, in Hebrew: blood chemistry, blood count, urine, ...) of \`group_values[]\`, one
  per measurement; see *Reading lab values*. For any other type \`results\` is empty: the finding
  is only in the PDF.
- \`files/\` — the result PDF, under the same name as its details file, for tests that have one.
  Lab tests have none: their values are the data.
- \`history/<test_id>_<name>.json\` — one measurement over time: \`current_result\` (the latest)
  and \`other_results[]\` (every earlier one), each with the ordering doctor (\`doc_first_name\`,
  \`doc_last_name\`). History reaches years further back than \`details/\`.
- \`latest-lab-results.json\` — the latest value of each measurement.
- \`followed-counter.json\` — how many results the member follows on the site. Not medical.`,
  },
  {
    name: 'visit-summaries',
    summary: 'Visits of the last 12 months, and their summary PDFs.',
    detail: `- \`list.json\` — \`results[]\`: each visit of the last 12 months, with \`appointment_id\`,
  \`appointment_date\`, the practitioner (\`service_provider_name\`), the speciality
  (\`service_name\`), and \`has_summery_file\` (sic).
- \`details/<date>_<appointment_id>_<speciality>.json\` — one visit: \`visit_summary_date\`, the
  practitioner and \`service_provider_specialization\`, the doctor's own words in
  \`visit_recommendations\` and \`online_requests\`, and what the visit produced: \`referrals[]\`,
  \`drugs[]\` (with \`instructions\`), \`approvals\`, \`tutorials\`. \`diagnosis[]\` may hold only
  nulls; the diagnosis is then in the PDF and the medical file. A visit with no summary is
  \`status\` 204 with \`data\` null.
- \`files/\` — the visit summary PDF, for visits that have one.`,
  },
  {
    name: 'medications-and-prescriptions',
    summary: 'Recent prescriptions and their PDFs, the full purchase history, and a 2-year purchase report.',
    detail: `- \`list.json\` — \`results[]\`: the prescriptions the site lists, which are recent ones:
  \`drug_name\`, \`drug_instructions\`, validity \`from_date\`–\`to_date\`, \`prescriber_name\`,
  \`specialization\`, \`prescription_number\`, and the drug's code \`drug_largo_code\`.
- \`files/<date>_<prescription_number>_<drug>.pdf\` — each prescription.
- \`purchased-history.html\` — every purchase, as the site's own HTML table, headed in Hebrew:
  purchase date (\`DD-MM-YYYY\`), drug or product, doctor, units, pharmacy, price, price for
  members. It is in **windows-1255**, not UTF-8; the site has no JSON version of it.
- \`purchased-report.json\` and \`files/purchased-report.pdf\` — the site's purchase report, for
  the last 2 years.`,
  },
  {
    name: 'referrals',
    summary: 'Referrals, with their diagnoses and ordered tests, and their PDFs.',
    detail: `- \`list.json\` — \`referrals[]\`: \`title_name\` and \`displaying_name\`, \`referral_date\`,
  validity \`referral_date_from\`–\`referral_date_to\`, the referring doctor
  (\`service_provider_full_name\`, \`service_provider_specialization_Description\`), and the
  reason as \`diagnoses[]\` (\`diagnosis_name\`, in English). A lab referral lists the tests
  ordered in \`lab_tests[]\`; others list procedures in \`actions[]\`. Referrals are one of the few
  places the JSON names diagnoses.
- \`files/<date>_<referral_id>_<title>.pdf\` — each referral.`,
  },
  {
    name: 'approvals',
    summary: 'Medical certificates and approvals, and their PDFs.',
    detail: `- \`list.json\` — \`approval[]\`: \`title_name\`, \`approval_date\`, the practitioner and
  speciality, \`approval_type_code\`. \`approval_date_from\` and \`approval_date_to\` are
  \`1900-01-01\` when the approval has no validity period.
- \`files/<date>_<hash>_<title>.pdf\` — each approval. The site gives approvals no id, so the name
  carries a hash of the approval's fields.`,
  },
  {
    name: 'info-pages',
    summary: 'Information pages practitioners gave the member, and their PDFs.',
    detail: `- \`list.json\` — \`tutorials[]\`: information pages a practitioner gave the member:
  \`display_text\` (the title), \`session_datetime\`, \`practitioner_name\`, \`specialization\`.
- \`files/<date>_<hash>_<title>.pdf\` — each page, named like approvals. They are general health
  information, not about the member, except that they were given to them.`,
  },
  {
    name: 'vaccinations',
    summary: 'Vaccinations by vaccine, flu vaccine eligibility, and the vaccination booklet PDF.',
    detail: `- \`list.json\` — \`timeline[]\`: one entry per vaccine, with \`vaccine_group_name\`,
  \`vaccinations_amount\`, \`first_date\` and \`last_date\`.
- \`details/<vaccine_group_code>_<name>.json\` — \`data[]\`, one per dose: \`vaccination_date\`,
  \`vaccine_name\`, \`vaccine_code\`, \`age_on_vaccination\` (in years), \`vaccination_place\`,
  \`operator_name\`.
- \`flu-eligibility.json\` — whether the member can have a flu vaccine now.
- \`vaccination-booklet-report.json\` and \`files/vaccination-booklet-report.pdf\` — the vaccination
  booklet as the site prints it.

Older vaccinations may be missing here and appear only in the medical file, or in documents the
member uploaded.`,
  },
  {
    name: 'letters',
    summary: 'Letters Maccabi sent the member, and their PDFs. Also lists the full medical file.',
    detail: `- \`list.json\` — \`letters[]\`. \`letter_type\` 1 is a letter Maccabi sent the member, such
  as an insurance notice (\`letter_desc\`, \`original_item_date\`); its PDF is in \`files/\`.
  \`letter_type\` 2 is the full medical file: \`from_date\`–\`to_date\` is the range it covers,
  \`status\` 1 means it is ready, and its PDF is the one beside this README, not in \`files/\`. Use
  \`original_item_date\`: \`item_date\` is a display string such as \`היום\` ("today").
- \`files/<date>_<reference_id>_<title>.pdf\` — each letter.`,
  },
  {
    name: 'communication-with-doctor',
    summary: 'Questions and requests to doctors, their replies, and the forms attached.',
    detail: `- \`list.json\` — \`inquiries[]\`: every exchange with a doctor through the site, both the
  member's questions and requests and forms a doctor sent on their own initiative:
  \`service_provider_name\`, \`creation_date\`, \`request_status\` (in Hebrew),
  \`request_subjects[]\`, and the forms attached (\`medical_forms_documents[]\`).
- \`details/<date>_<request_id>_<doctor>.json\` — one exchange: what the member wrote
  (\`general_question_subject\`, \`patient_remark\`,
  \`approval_request_details[].approval_additional_text\`), the doctor's reply (\`doctor_remark\`,
  \`personal_doctor_remark\`), and the forms (\`medical_forms_details[]\`: a referral, drug
  instructions or an approval by \`document_description\`, valid \`valid_from\`–\`valid_until\`).
- \`files/<date>_<request_id>-<n>_<doctor>.pdf\` — the forms, numbered in the order the list gives
  them. **Most are also in their own folder**: a referral in \`referrals/files/\` (the referral
  number printed on the form is its \`referral_id\`), drug instructions in
  \`medications-and-prescriptions/files/\`, sometimes as the very same file. Count each document
  once.`,
  },
  {
    name: 'uploads',
    summary: 'Documents the member uploaded to the site.',
    detail: `- \`details/<date>_<FileId>_<title>.json\` — one document the member uploaded:
  \`DocumentTitle\`, \`DocumentDescription\`, \`DocumentDate\` (\`DD/MM/YYYY\`), and
  \`DocumentOriginName\`, the file's name when it was uploaded. There is no \`list.json\`: the
  site's list is a web page, not data.
- \`files/\` — the document itself, in the format it was uploaded in, often a photo or a scan.`,
  },
  {
    name: 'allergies-sensitivity',
    summary: 'Recorded sensitivities and intolerances.',
    detail: '- `list.json` — the sensitivities and intolerances Maccabi has recorded (`intolerance[]`).',
  },
  {
    name: 'appointments',
    summary: 'Future appointments only. Past ones are in visit-summaries/.',
    detail: '- `list.json` — future appointments. Past appointments are visits, in `visit-summaries/`.',
  },
  {
    name: 'requests-approvals',
    summary: 'Open requests and cases.',
    detail: '- `list.json` — requests and cases the member has open with Maccabi.',
  },
];

/** "a", "a and b", "a, b and c". */
function inWords(items: string[]): string {
  return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

function medicalFileSection(file: string | null): string {
  if (!file) {
    return `**This export has no full medical file.** Ordering or downloading it failed, and the
extension said why in its popup. That file is where the member's whole history is: without it,
this export reaches back only as far as the structured data below.`;
  }
  return `\`${file}\`, beside this file, is the member's **full medical file**,
as Maccabi produced it on ${file.slice(0, 10)}. It is Maccabi's printout of the member's record.
It opens with personal details, known problems (diagnoses, with the date each began),
sensitivities and lifestyle, then goes through the visits in date order back to the earliest
entry — reason, findings, diagnosis, medications, referrals, vaccinations — and ends with copies
of documents filed in the record: referrals, lab printouts, imaging and ECG reports, letters,
certificates. It is the best place to start by a wide margin. Maccabi's own heading calls it
partial (חלקי), so even this is not everything Maccabi holds.

At the start of every export the extension orders one over the member's whole history, or uses
one already ordered that day over the same range. If the order fails, the file is the last one
Maccabi made, which can be older or cover less. The range this one covers is the \`from_date\`–\`to_date\` of the \`letter_type\` 2 entry in
\`letters/list.json\`. It can run to hundreds of pages. It has a text layer, but its Hebrew often
comes out of text extractors scrambled, a letter per line or words in reverse order. If extracted
text reads as nonsense, read the pages as images instead.`;
}

/**
 * The README for one export. present is the folders this export actually has, with how many files
 * each holds, so nothing is described that is not there; medicalFile is the name of the full
 * medical file PDF at the root, or null when the export has none.
 */
export function exportReadme(exportedOn: string, present: Record<string, number>, medicalFile: string | null): string {
  const here = FOLDERS.filter((f) => present[f.name]);
  const missing = FOLDERS.filter((f) => !present[f.name]).map((f) => '`' + f.name + '/`');
  const absent = missing.length
    ? '\n  This export has no ' + inWords(missing) + ': the site returned nothing for ' +
      (missing.length > 1 ? 'them' : 'it') + ', or the request failed.'
    : '';
  const rows = here.map((f) => '| `' + f.name + '/` | ' + present[f.name] + ' | ' + f.summary + ' |').join('\n');
  const folders = here.map((f) => '### `' + f.name + '/`\n\n' + f.detail).join('\n\n');
  return `# Maccabi health records export

Exported ${exportedOn} from online.maccabi4u.co.il with the Health Records Export for Maccabi
browser extension. Everything here belongs to one member.

This file is the data dictionary for the export: where to start, what the export leaves out,
what each file holds, and how to read its values. If you are an AI assistant working from these
records, read all of it before the records themselves: several fields do not mean what they
appear to mean.

## Start with the full medical file

${medicalFileSection(medicalFile)}

The JSON files are the other half: the site's own data, exact where the medical file is
narrative (lab values with their reference ranges, dates, ids, the doctors' notes from recent
visits) but reaching back only a few years. Use the medical file for the history, and the JSON
for the numbers.

## What this export does not contain

**Something missing here is not evidence that it never happened.** The export holds what the
Maccabi member site returns, which is less than Maccabi holds, which is less than the member's
whole medical history.

- **Visits older than 12 months, as data.** \`visit-summaries/\` covers the last 12 months only,
  because that is all the site returns. Earlier visits are in the medical file.
- **Older tests, as data.** \`test-results/list.json\` and \`details/\` reach back only as far as
  the site lists tests. \`history/\` goes further back, but only for measurements taken in at
  least one listed test. The medical file holds more.
- **Older prescriptions.** \`medications-and-prescriptions/list.json\` has only the prescriptions
  the site lists, which are recent ones. \`purchased-history.html\` and the medical file go further
  back.
- **Images.** No DICOM image is exported: the site opens imaging studies only in its own viewer.
  An \`imaging_study\` record is a placeholder with no file. The written report, when there is one,
  is a separate \`imaging_result\` with a PDF.
- **Findings of anything but lab tests, as data.** For imaging, cardiology and external results the
  JSON holds no values: the finding is only in the PDF in \`test-results/files/\`.
- **Purchases older than 2 years, in the report.**
  \`medications-and-prescriptions/files/purchased-report.pdf\` covers 2 years.
  \`purchased-history.html\` covers the whole history.
- **Care outside Maccabi**, except documents about it that were filed with Maccabi: external test
  results, documents copied into the medical file, and the member's own uploads.
- **Sections the site had nothing for, and anything that failed.** A folder exists only when the
  site returned something for it, so a missing folder means "nothing was returned",
  not "this was not checked".${absent}
  A single failed request does not stop an export; the extension lists failures in its popup
  when it finishes, not in this ZIP.

## What is in this export

| Folder | Files | Contents |
|---|---|---|
${rows}

Most folders keep the list as the site shows it in \`list.json\`, one JSON file per list item in
\`details/\`, and documents in \`files/\`. A record's JSON and its PDF share a file name.

## Folder by folder

Fields are named as the site names them. Values are mostly Hebrew.

${folders}

## Reading lab values

Every value in \`group_values[]\`, \`current_result\`, \`other_results[]\` and
\`latest-lab-results.json\` has the same fields:

- \`test_id\` and \`test_desc\` name the measurement. Two measurements can share a name and differ
  only by a symbol: \`Eosinophils #\` is a count, \`Eosinophils %\` a share. File names in
  \`history/\` drop the symbol; \`test_desc\` and \`units\` keep it.
- \`result\` and \`units\`, with the reference range \`min_lim\`–\`max_lim\`, all as numbers.
- **\`min_lim\` and \`max_lim\` both 0 means no range was given**, not a range of 0 to 0.
- **A \`result\` of 0 is often not a measurement.** When the answer is text, \`result\` is 0 and the
  text is in \`message\` (\`NEGATIVE\`) or, when \`is_messages\` is \`"2"\`, only in
  \`message_list\` (\`Undetectable\`, or a note that the test was not done). Read both before
  trusting a 0.
- \`message_list\` is one note split into display lines, such as reference ranges, method changes
  or interpretation, in Hebrew and English. Join the lines to read it. Hebrew lines are sometimes in
  visual order, with numbers and punctuation at the wrong end: \`.60 ערך רצוי מעל\` reads "a
  value above 60 is desirable."
- \`numeric_percentage\` is where \`result\` sits in the range: 0 at \`min_lim\`, 100 at
  \`max_lim\`, above 100 above the range. Without a range it is 0 and means nothing.
- \`lab_date\` is the test's date; the time is in the details file's \`execute_date\`.
- **The same values appear up to three times:** in \`details/\` by test, in \`history/\` by
  measurement, and the latest in \`latest-lab-results.json\`. Count each (\`test_id\`, \`lab_date\`)
  once. \`history/\` holds the most.

## Dates

- Most dates are ISO 8601 in Israel local time with no offset (\`2026-02-25T11:09:00\`); a few
  carry one (\`+02:00\`). \`fetched_at\` is UTC and ends in \`Z\`. \`T00:00:00\` means the date
  has no time of day.
- Some are not ISO: \`DD/MM/YY\` (\`item_date\` in \`letters/\`, \`next_month_date\` in
  \`profile/entitlement.json\`), \`DD/MM/YYYY\` (\`DocumentDate\` in \`uploads/\`), \`YYYYMMDD\`
  and \`YYYYMM\` (the insurance dates in \`profile/member.json\`), and \`DD-MM-YYYY\`
  (\`purchased-history.html\`).
- **Some dates are placeholders:** \`0001-01-01T00:00:00\` means never set, and
  \`1900-01-01T00:00:00\` in a validity range (\`approval_date_from\`, \`referral_date_to\`, ...)
  means there is none. The one real \`1900-01-01\` is the medical file's \`from_date\` in
  \`letters/list.json\`: it means the file covers everything.

## Text, names and ids

- **Field names are English, values Hebrew.** Field names are the site's own, misspellings
  included (\`has_summery_file\`, \`scpecializations\`, \`orginal_package_count\`), so search for
  them as spelled.
- Strings are often padded with spaces (\`vaccine_group_name\`, \`orginal_package_count\`). Trim
  them before comparing.
- People's names come first name first or last name first, with titles spelled several ways
  (\`ד"ר\`, \`דר'\`, \`ד'ר\`). Match people by id, not by name.
- The same id can be a number in one file and a zero-padded string in another (\`12345678\`,
  \`"012345678"\`). Compare ids as numbers.
- In text fields, \`""\`, \`"0"\` and \`null\` usually mean none.
- Codes (status, type, insurance, speciality) are Maccabi's own and documented nowhere. Where a
  record has both a code and a description, trust the description.

## Joining records across files

| To connect | Use |
|---|---|
| A list item, its details and its PDF | The file name: the id in it is the list item's id |
| A lab measurement over time | \`test_id\`, in \`test-results/history/<test_id>_*.json\` |
| A visit to what it produced | \`referrals[].referral_id\` is \`referral_id\` in \`referrals/list.json\`; \`drugs[].largo_code\` is \`drug_largo_code\` in \`medications-and-prescriptions/list.json\` |
| A referral's lab tests to their results | \`lab_tests[].lab_test_number\` is often a \`test_id\` padded with zeros (\`06291\` is \`6291\`) |
| A doctor across files | Employee number: \`employee_id\`, \`emp_number\`, \`employee_number\`, \`pernr\`. Position: \`position_id\`, \`position_number\`, \`object_id\`. Practitioner id: \`practitioner_id\`, \`service_provider_id\`, \`doctor_id\` |

## Fields to ignore

These are re-signed or re-stamped on every request and carry no information about the record:
\`hash\`, \`timestamp\`, \`time_stamp\`, \`t\`, \`corona_hash\`, \`corona_t\`, \`token\`,
\`searchQueryId\`, \`file_name_title\`, \`url\`, and every field whose name ends in \`link\`
(expiring signed paths, not stable references). A \`timestamp\` is the moment of the request in
.NET ticks, not the record's time; \`timestamp_sequence\`, by contrast, is a real time. \`is_read\`,
\`is_advertised\` and \`fetched_at\` describe the site and the export, not the member.

## How each JSON file is wrapped

Every JSON file is one response from the site, kept as it was sent, wrapped in where it came from:

    {
      "endpoint": "GET MainAppAPI/v1/members/0/{mid}",
      "fetched_at": "2026-09-17T08:12:03.512Z",
      "status": 200,
      "data": { "...": "the response, unchanged" }
    }

- \`{mid}\` stands for the member id, which is never written into \`endpoint\`. Query strings are
  left out of it.
- \`status\` is 200, or 204 when the site had nothing to return; \`data\` is then \`null\`.
- \`request_body\` is the body of a POST request.
- A details file repeats the list fields it was fetched with, so it stands on its own:
  \`request_id\` and \`type\` in \`test-results/details/\`; \`test_id\`, \`test_desc\` and
  \`date_of_result\` in \`test-results/history/\`; \`appointment_date\` in
  \`visit-summaries/details/\`; \`vaccine_group_code\` in \`vaccinations/details/\`.
- \`omitted\` lists what was left out of \`data\`: the two report files carry their PDF in
  \`files/\` instead of as base64.
- \`uploads/details/\` files also carry \`content_type\` and \`decoded_from\`: the site sent them in
  windows-1255, and they are stored as UTF-8.

Two files are not JSON: \`medications-and-prescriptions/purchased-history.html\`, described above,
and the documents in each \`files/\`, which are the site's own.

## How files are named

\`<date>_<id>_<title>.<ext>\`, so a record's JSON and its document share a name:

    test-results/details/2026-02-01_41234567-imaging-result.json
    test-results/files/2026-02-01_41234567-imaging-result.pdf
    referrals/files/2026-02-01_412345678_בדיקות-מעבדה.pdf

- \`<date>\` is the record's own date, always \`YYYY-MM-DD\`, or \`undated\` when it had none.
- \`<id>\` is the site's id for the record, reduced to ASCII; an id that had to be shortened ends in
  an 8-character digest. Where the site gives no id (approvals, info pages), it is a hash of the
  record's fields. Test results use \`<request_id>-<type>\`, and several documents under one
  record are numbered \`-1\`, \`-2\`, ...
- \`<title>\` is a display string from the record as the site sent it: Hebrew kept, spaces and
  punctuation turned into \`-\`, at most 40 characters. It is left out when the record has none.
- \`_\` separates those parts and appears nowhere else.
- Two folders name files by what they hold, with no date: \`test-results/history/\` as
  \`<test_id>_<name>\`, and \`vaccinations/details/\` as \`<vaccine_group_code>_<name>\`.

File names are UTF-8. macOS's \`unzip\` command garbles the Hebrew in them; \`ditto -x -k\` does not.

## Before sharing this export

The member's national ID number runs through the data: in \`id_number\`, \`member_id\`,
\`user_id\` and \`recipient_id\`, inside \`doc_id\`, \`virtual_key\` and \`name_document\`, and
printed on nearly every page of the medical file and on most PDFs. File names never carry it.
\`profile/member.json\` also holds the member's address, phone numbers and email. This ZIP is not
encrypted, and it is health information: anyone who can open it can read it, including any
service it is uploaded to.
`;
}
