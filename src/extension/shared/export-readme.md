# Maccabi health records export

> **Member:** to ask an AI assistant about these records, open this whole folder in one. How, and what
> to ask: {{site}}

Exported {{exported}} from online.maccabi4u.co.il with the
Health Records Export for Maccabi browser extension, {{version}}; everything here belongs to one member. If you are an AI assistant working with
these records, this file is your instructions and the records are your project files: read it
before them. It says where to start, what the export lacks and which values mislead.

## How to work with these records

- **Say where each fact comes from** — the file's path, and the page of a PDF — so the member can
  check it, a weight or blood pressure read off the medical file included. Give each finding its date: a record describes the day it was made, and a diagnosis or
  a medication in an old one may no longer hold.
- **Leave the export as it is.** Write what you make — notes, tables, summaries — into a new folder
  of your own, such as `notes/`; never edit, rename or delete the export's files.
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

Where to look: first list every file — most names start with the record's date, so
sorted by file name, not path, they make a timeline; for a health history, the medical file; for one condition, its line in the medical
file's known problems, then every visit, referral and result about it, whichever doctor it was
with, and the specialists' answers in `approvals/` — keep a condition's notes together, not a doctor's; for a measurement over time,
`test-results/history/`, and the latest of each in `latest-lab-results.json`; for what changed
since the last visit, whatever is dated after the newest file in `visit-summaries/` — results,
prescriptions, referrals, letters; for an appointment, the medical file's known problems, the latest
results, recent `visit-summaries/` and open `referrals/`; for what is still open, each referral,
each request in a visit's notes and each prescription's `to_date` against what is dated after it
(nothing there is not proof it wasn't done: ask); for allergies, `allergies-sensitivity/`
and the medical file's sensitivities; for preventive care due, age and sex in
`profile/member.json`, `vaccinations/` and the screenings in `test-results/`, judged by Israel's
current guidance (the Ministry of Health's and Maccabi Healthcare Services's), which differs from
other countries' and changes: look it up, don't recall it. What the member
actually bought is in `purchased-history.html`, not the prescriptions; neither shows what they take
now, so ask.

## Start with the full medical file

{{medicalFile}}

## What this export does not contain

**Something missing here is not evidence that it never happened.** The export holds what the member
site returns, which is less than Maccabi Healthcare Services holds, which is less than the member's medical history.

- Visits over 12 months old, except those that answered an inquiry to a doctor, and tests older
  than the site's list — as data. `history/` goes
  further back, but only for measurements taken in at least one listed test.
- Prescriptions beyond the recent ones the site lists, and purchases over 2 years old in
  `purchased-report.pdf`. `purchased-history.html` still covers every purchase.
- Images: no DICOM, ever — the site opens studies only in its own viewer.
- Values for anything but lab tests: imaging, cardiology and external findings are only in a PDF,
  and blood pressure, weight and BMI only in the medical file.
- Care outside Maccabi Healthcare Services, except what was filed with it: external results, documents copied into
  the medical file, the member's own uploads.
- Sections the site had nothing for. A folder exists only when the site returned something, so a
  missing folder that did not fail means "nothing on record", not "this was not checked".{{absent}}

## What is in this export

A folder holds the site's list in `list.json`, one JSON file per item in `details/` where the site
has one, and documents in `files/`; a record's JSON and its PDF share a file name.

{{folders}}

## What this export failed to collect

{{failed}}

## Lab values

Every value in `group_values[]`, `current_result`, `other_results[]` and
`latest-lab-results.json` has the same fields: `test_id` names the measurement, and
`min_lim`–`max_lim` is its reference range.

- **`min_lim` and `max_lim` both 0 means no range in those fields**, not a range of 0 to 0, and
  `numeric_percentage` (where `result` sits in the range) is then 0 and means nothing. The range is
  then often a line of `message_list` (`200 mg/dL -מומלץ: קטן מ`, recommended below 200).
- `is_messages` is `"0"` for a bare value, `"1"` for a value with a note in `message_list`, `"2"`
  for an answer only in text.
- **A `result` of 0 is often not a measurement.** When the answer is text, `result` is 0 and the
  text is in `message` (`NEGATIVE`, or a bound: `0.5 mg/dl :קטן מ` is below 0.5) or
  `message_list` (`Undetectable`, or that the test was not done). Read both before trusting a 0.
- `message_list` is one note split into display lines (a reference range, a method change, an
  interpretation); join them. Its Hebrew is sometimes in visual order, numbers and punctuation at the
  wrong end: `.60 ערך רצוי מעל` reads "a value above 60 is desirable".
- **Ranges, units and methods change over time**: within one `history/` file, `min_lim`–`max_lim` and
  `units` can differ by date, and older `units` may be blank. Judge each result against its own
  range; don't trend across a change of units or of method, which a `message_list` note dates on
  only rows near it (`שונתה שיטת הבדיקה`).
- Two measurements can share a name and differ only by a symbol — `Eosinophils #` is a count,
  `Eosinophils %` a share. `history/` file names drop the symbol; `test_desc` and `units` keep it.
- **The same values appear up to three times:** in `details/` by test, in `history/` by measurement,
  and the latest in `latest-lab-results.json`. Count each (`test_id`, `lab_date`) once;
  `history/` holds the most.

## Dates, text and ids

- Dates are ISO 8601 in Israel local time, usually without an offset (`2026-02-25T11:09:00`);
  `fetched_at` is UTC. `T00:00:00` means no time of day. A few are not ISO: `DD/MM/YY`
  (`item_date`, `next_month_date`), `DD/MM/YYYY` (`DocumentDate`), `YYYYMMDD` and `YYYYMM`
  (insurance dates), `DD-MM-YYYY` (`purchased-history.html`).
- **Some dates are placeholders:** `0001-01-01T00:00:00` means never set, `1900-01-01T00:00:00` in
  a validity range means there is none. The one real `1900-01-01`, the medical file's
  `from_date` in `letters/list.json`, means it was asked for from the start, not that it is complete.
- Field names are English and keep the site's misspellings (`has_summery_file`) — search for
  them as spelled. Values are mostly
  Hebrew, often padded with spaces; `""`, `"0"` and `null` usually mean none. Codes (status,
  type, insurance, speciality) are the site's own and documented nowhere: trust the description beside them.
- Match people by id, never by name: names run either way round and titles are spelled several ways
  (`ד"ר`, `דר'`, `ד'ר`). An id can be a number in one file and a zero-padded string in another
  (`12345678`, `"012345678"`) — compare ids as numbers.
- **Fields that say nothing about the record**, re-signed or re-stamped on every request: `hash`,
  `timestamp`, `time_stamp`, `t`, `corona_hash`, `corona_t`, `token`, `searchQueryId`,
  `file_name_title`, `url`, and every field whose name ends in `link` (expiring signed paths, not
  stable references). A `timestamp` is the request moment in .NET ticks, not the record's time —
  `timestamp_sequence` is a real time. `is_read`, `is_advertised` and `fetched_at` describe the
  site and the export, not the member.

## Joining records across files

| To connect | Use |
|---|---|
| A list item, its details and its PDF | The file name: the id in it is the list item's id |
| A lab measurement over time | `test_id`, in `test-results/history/<test_id>_*.json` |
| A visit to what it produced | `referrals[].referral_id` is `referral_id` in `referrals/list.json`; `drugs[].largo_code` is `drug_largo_code` in `medications-and-prescriptions/list.json` |
| A purchase to its prescription | The drug code in `purchased-history.html` is mostly `dispensed_drug_largo_code`, not `drug_largo_code` |
| A referral's lab tests to their results | `lab_tests[].lab_test_number` is often a `test_id` padded with zeros (`06291` is `6291`) |
| A doctor across files | Employee number: `employee_id`, `emp_number`, `employee_number`, `pernr`. Position: `position_id`, `position_number`, `object_id`. Practitioner id: `practitioner_id`, `service_provider_id`, `doctor_id` |

## How files are shaped

Every JSON file is one response from the site, kept as it was sent, wrapped as
`{endpoint, fetched_at, status, data}`. `{mid}` stands for the member id, never written into
`endpoint`. `status` is 200, or 204 when the site had nothing — `data` is then null. `omitted`
names what was left out of `data` (a report's PDF, kept in `files/` instead of as base64). A
details file repeats the list fields it was fetched with, so it stands on its own. `files[]` lists a
record's documents: `file`, its own, or `same_as`, a file elsewhere in the export with the same
bytes, which is kept instead of a second copy.

File names are `<date>_<id>_<title>.<ext>`. `<date>` is the record's own date or `undated`;
`<id>` is the site's id (with the test type, in `test-results/`), or a hash where the site gives
none, plus `-1`, `-2` when a record has several documents; `<title>` is a display string,
Hebrew kept (with its abbreviation marks, ״ and ׳) and other punctuation turned into `-`, left out
when there is none. `_` appears nowhere else, and `test-results/history/` and `vaccinations/details/` name files by what they hold, with no date.

## Before sharing this export

The member's national ID number runs through the data — `id_number`, `member_id`, `user_id`,
`recipient_id`, inside `doc_id`, `virtual_key` and `name_document` — and is printed on nearly
every page of the medical file and on most PDFs. File names never carry it. `profile/member.json`
also holds the address, phone numbers and email. The ZIP is not encrypted: anyone, or any service,
given it can read it.
