# Popup sections: steps, parts and files

While an export runs, the popup lists the export's sections, one line per thing the member gets. This maps each
line to the run steps behind it, the parts of a step it stands for, and what those steps write into the ZIP.

- **Step**: an entry in `PLAN` (`src/extension/shared/state.ts`), the run's ordered unit of work; the runner
  checkpoints after each one.
- **Parts**: the name a step gives each phase in its progress detail (`c.progress(done, total, part)`). A line with
  `parts` in `STAGES` (`src/extension/popup/model.ts`) is current only while its step reports one of them; `''` is
  the step before its first report. The part also picks the description the panel shows for the current line
  (`DESCRIPTIONS`), and it keys the files the part writes, which the line counts once it is done.
- **Writes**: paths inside the ZIP, from `src/core/sections/`. A folder exists only when the site returned
  something. `docs/endpoints.json` lists every request with the file it produces.

| # | Line | Step | Parts | Writes |
|---|---|---|---|---|
| 1 | Ordering your medical file | `openLegacyPage`, `orderMedicalFile` | – | nothing: it places the order (and the SMS) |
| 2 | Your details and doctor | `profileAndDoctors`, `emptySections` | – | `profile/member.json`, `entitlement.json`, `insurance-seniority.json`, `providers.json`; `my-doctor/assigned-practitioners.json`, `eligibilities.json`, `ascribed.json`; `allergies-sensitivity/list.json` whenever the site answers, even when empty; and, each only when not empty, `appointments/list.json`, `requests-approvals/list.json` |
| 3 | Prescriptions | `medications` | `prescriptions` | `medications-and-prescriptions/list.json`, `files/<prescription>.pdf` |
| 4 | Medication purchases | `purchases` | `purchase history`, `purchase report` | `medications-and-prescriptions/purchased-history.html`, `purchased-report.json`, `files/purchased-report.pdf` |
| 5 | Hospital stays | `hospitalStays` | `hospital stays`, `hospital letters` | `hospital-stays/list.json`, `files/` (discharge letters) |
| 6 | Your uploads | `savedDocuments` | `saved documents` | `uploads/details/`, `uploads/files/` |
| 7 | Test results | `returnToSonline`, `testResults` | `''`, `test results` | `test-results/list.json`, `latest-lab-results.json`, `followed-counter.json`, `details/`, `files/` |
| 8 | Lab histories | `testResults` | `lab histories` | `test-results/history/<test_id>_<name>.json` |
| 9 | Visit summaries | `visits` | `visits` | `visit-summaries/list.json`, `details/`, `files/` |
| 10 | Referrals | `referrals` | `referrals` | `referrals/list.json`, `files/` |
| 11 | Approvals | `approvals` | `approvals` | `approvals/list.json`, `files/` |
| 12 | Vaccinations | `vaccinations` | `vaccinations` | `vaccinations/list.json`, `details/`, `flu-eligibility.json`, `vaccination-booklet-report.json`, `files/vaccination-booklet-report.pdf` |
| 13 | Letters | `letters` | `letters` | `letters/list.json`, `files/` |
| 14 | Messages with your doctor | `doctorCommunications` | `doctor inquiries` | `communication-with-doctor/list.json`, `details/`, `files/` (a form whose bytes are already in the export is not written again); `visit-summaries/details/`, `files/` for a visit an inquiry links to that the visit list no longer has |
| 15 | Information pages | `infoPages` | `information pages` | `info-pages/list.json`, `files/` |
| 16 | Collecting your medical file | `waitMedicalFile` | `waiting for the medical file to appear`, `medical file status …`, `letters` | `<date>_medical-file.pdf`, at the root |
| 17 | Saving the ZIP | `save` | – | `README.md`, `CLAUDE.md`, `AGENTS.md` at the root, then the ZIP |

Lines 1–6 run with the tab on the old site's page: the order, purchases, hospital stays and uploads need it, and
the details and prescriptions come from the REST API, which answers from any page. Line 7 starts with the tab's way
back to `/sonline/`.

Three shapes:

- **Several steps, one line** (1, 2, 7): `openLegacyPage` and `returnToSonline` only move the tab between the two
  sites, so they share the line of the step they serve. `emptySections` (allergies, upcoming appointments and
  requests: three requests, usually empty) rides along on line 2, and keeps its own name in errors and the problems
  list: "Allergies, appointments and requests". Its parts (`allergies`, `appointments`, `requests`) only pick the
  description under the line.
- **One step, several lines** (7–8): a step split by the parts it reports. `LABELS` names the whole step, as errors
  and the problems list show it: "Test results".
- **Several lines, one folder** (3–4, 9 and 14): prescriptions and purchases both write to
  `medications-and-prescriptions/`; the visits and the doctor messages both write to `visit-summaries/`.

## How long each line takes

The run keeps `timings`: the time and the requests of each step, or `step:part` (the keys the popup counts files
by), summed over every time a step ran. `npm run live` prints them. The time is wall-clock, so it includes the
`PACE_MS` (300 ms) between requests and any wait. `alive` pings are not counted.

Measured on 2026-09-29 by `npm run live` on one account (228 files), with the Maccabi tab in front throughout:

| # | Line | Keys | Time | Requests |
|---|---|---|---|---|
| 1 | Ordering your medical file | `openLegacyPage` | 4.2 s | 0 |
| 2 | Your details and doctor | `profileAndDoctors`, `emptySections:*` | 6.6 s | 10 |
| 3 | Prescriptions | `medications`, `medications:prescriptions` | 2.0 s | 3 |
| 4 | Medication purchases | `purchases:purchase history`, `purchases:purchase report` | 2.2 s | 3 |
| 5 | Hospital stays | `hospitalStays:hospital stays` | 0.6 s | 1 |
| 6 | Your uploads | `savedDocuments`, `savedDocuments:saved documents` | 5.1 s | 9 |
| 7 | Test results | `returnToSonline` (5.7 s), `testResults`, `testResults:test results` | 36.2 s | 31 |
| 8 | Lab histories | `testResults:lab histories` | 44.4 s | 73 |
| 9 | Visit summaries | `visits`, `visits:visits` | 8.6 s | 17 |
| 10 | Referrals | `referrals`, `referrals:referrals` | 19.9 s | 32 |
| 11 | Approvals | `approvals`, `approvals:approvals` | 3.1 s | 6 |
| 12 | Vaccinations | `vaccinations`, `vaccinations:vaccinations` | 5.0 s | 9 |
| 13 | Letters | `letters`, `letters:letters` | 2.6 s | 4 |
| 14 | Messages with your doctor | `doctorCommunications`, `doctorCommunications:doctor inquiries` | 23.3 s | 48 |
| 15 | Information pages | `infoPages`, `infoPages:information pages` | 1.1 s | 2 |
| 16 | Collecting your medical file | `waitMedicalFile`, `waitMedicalFile:letters` | 8.4 s | 3 |
| 17 | Saving the ZIP | `save` | not measured | – |
| | All | | 2 min 53 s | 251 |

About 0.69 s a request: the 300 ms of pacing and about 0.4 s of the site's answer. Lab histories, test results,
the doctor messages and referrals are about 70% of the time; each grows with the member's history.

Two lines are shorter here than in a real export. A live test never orders (`dev:skipOrder`), so line 1 is only the
page change, and line 16 found a medical file ordered the day before instead of waiting while Maccabi builds a new
one: that wait is up to 15 minutes (`waitMedicalFile`'s `timeoutMs`), and the run orders first so that the rest of the collection overlaps it.
`save` is not measured because a live test stops before it.

Twenty lines is what fits under Chrome's 600px popup cap; there are seventeen. Keep this table in step with `STAGES` and the collectors.
