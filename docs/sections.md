# Popup sections: steps, parts and files

While an export runs, the popup lists the export's sections, one line per thing the member gets. This maps each
line to the run steps behind it, the parts of a step it stands for, and what those steps write into the ZIP.

- **Step**: an entry in `PLAN` (`src/extension/shared/state.ts`), the run's ordered unit of work; the runner
  checkpoints after each one.
- **Parts**: the name a step gives each phase in its progress detail (`c.progress(done, total, part)`). A line with
  `parts` in `STAGES` (`src/extension/popup/model.ts`) is current only while its step reports one of them; `''` is
  the step before its first report. The part also picks the description shown under the current line
  (`DESCRIPTIONS`).
- **Writes**: paths inside the ZIP, from `src/core/sections/`. A folder exists only when the site returned
  something. `docs/endpoints.json` lists every request with the file it produces.

| # | Line | Step | Parts | Writes |
|---|---|---|---|---|
| 1 | Ordering your medical file | `openLegacyPage`, `orderMedicalFile` | – | nothing: it places the order (and the SMS) |
| 2 | Your details and doctor | `profileAndDoctors`, `emptySections` | – | `profile/member.json`, `entitlement.json`, `insurance-seniority.json`, `providers.json`; `my-doctor/assigned-practitioners.json`, `eligibilities.json`, `ascribed.json`; and, each only when not empty, `allergies-sensitivity/list.json`, `appointments/list.json`, `requests-approvals/list.json` |
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
| 14 | Messages with your doctor | `doctorCommunications` | `doctor inquiries` | `communication-with-doctor/list.json`, `details/`, `files/` |
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
- **Several lines, one folder** (3–4): prescriptions and purchases both write to `medications-and-prescriptions/`.

Twenty lines is what fits under Chrome's 600px popup cap; there are seventeen. Keep this table in step with `STAGES` and the collectors.
