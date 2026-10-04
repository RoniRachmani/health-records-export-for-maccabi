# healthHQ use cases: what to build

This is for whoever builds these use cases into the chart-gallery artifact
(<https://claude.ai/artifact/6vAGBT53qbT3dtrtpSMvY3>). That artifact holds the gallery of charts and the healthHQ viewer
mockup. The why behind each use case is in [positioning.md](positioning.md). This file gives each one's place, picture,
data, rules and copy.

Every value here belongs to the demo persona and is made up. Never use a value from a real export, even your own.

The landing page's mockups (Round 7, the approved one) draw six of these: all but *Is it the season?*. Where the
landing page changed a picture, this file follows it, so the two agree. The landing page shows the pictures without
their answer copy, except for *What I spent*. The `say` column is for the artifact, where each chart keeps a short
answer.

## How the artifact is built

- **Charts** are entries in `CHARTS`: `{ chip, q, say, form, from, draw(w), table() }`. `draw` returns SVG drawn at
  the container's real width, and `table` returns the same data as a table, which goes under every chart.
- **The viewer's tabs** are panels with the id `panel-<tab>`. A tab shows a gallery chart by holding
  `<div class="plot" data-chart="<chip>">`. Each tab's link is `#os-<tab>`.
- **Today** is `TODAY = 2026-10-01`. Every "overdue", "lapsed" and "due" is judged against it.
- **Colour:** `--s1` (blue) is the member's own data, `--ctx` (gray) is context, and `--s2` (magenta) is the one thing
  to notice. The status colours mean only state, and always come with an icon and a word: *Done* ✓, *Lapsed* !,
  *Overdue* !, *Open* ●, *Upcoming* ●. A new colour has to pass `/dataviz`'s `validate_palette.js` in light and dark.
- **Every mark** has a hover and keyboard tooltip (`data-tip`) that gives the date, value and record.

## The table

| Use case | Where in the artifact | Picture | Data and sources | Rules | Answer copy (`say`) |
|---|---|---|---|---|---|
| **Did it work?** "My vitamin D was low. Did the treatment help?" | Gallery card. healthHQ: *Now* (One thing this week) and *Problems* (vitamin D) | A line against the healthy range, 20 to 50 ng/mL, shaded. Below it, an event track on the same time axis, in four labelled lanes: *Visits*, each with the word the note used ("tired", "better", "tired again"); *Prescribed*, as magenta diamonds; *Bought*, as blue dots; and *Messages*. The winters are shaded behind the line and labelled. A *Today* line, labelled on the years' axis. | `VITD`, `VITD_RX`, `VITD_BUY`, `VITD_VISITS`, `VITD_MSG` below. From `test-results/history/`, `medications-and-prescriptions/list.json`, `medications-and-prescriptions/purchased-history.html`, `visit-summaries/details/` and the doctor inquiries | A missing purchase means only that none was recorded. Ask, and keep the answer in `notes/`. If the tests fall in different seasons, say so and point to *Is it the season?*. | "It helped while you took it: 11, then 24. You stopped buying it in August 2024, and it's back to 17. Worth restarting." |
| **Loose ends** "Anything my doctors asked me to do that I haven't?" | Gallery card. healthHQ: *Now* (Loose ends, Due) | One row per request: its name, its state as an icon and a word on the right, and a bar from when it was asked for to when it was due. An overdue request gets a thin line from its due date to *Today*. Years on the axis. No source label under a name. | `ENDS` below. From `referrals/list.json` (validity dates), the approvals, `visit-summaries/details/` (`follow_up_in_time`, `follow_up_time_type`, `visit_recommendations`), `test-results/list.json`, `vaccinations/` | A referral counts as used if a later test or visit has its `referral_id`. Matching on type and dates within its validity is an inference: label it as one. A request whose due date has passed with no match is *Overdue*, and a referral past its validity with no match is *Lapsed*. | "Three slipped. The eye-doctor referral expired, so ask your family doctor for a new one (הפניה לרופא עיניים)." |
| **What I spent** "Chart what I've spent on medicines, and what insurance covered" | Gallery card. healthHQ: *Medicines* | Stacked columns, one a year, at most 24px wide: what you paid in `--s1` at the bottom, what insurance covered in `--q2` above it, with a 2px gap and a rounded top. The two totals as large figures above the chart, a legend, and a label only on the peak years. Say "insurance covered", never "Maccabi covered". | `SPEND` below. From `medications-and-prescriptions/purchased-history.html` (each purchase's price and member price; windows-1255, `DD-MM-YYYY`) | Covered is price minus member price. Sum by calendar year. The current year is partial, so say so in its tooltip. | "2016, the knee operation, was the biggest year. Most years you pay under ₪200." The totals, ₪4,120 you paid and ₪3,270 insurance covered, are the figures above the chart. |
| **Is there a pattern?** "Do my asthma flares have a season?" | Gallery card (*Correlation and causation*). healthHQ: *Problems* (asthma) | Four rows of columns by month of the year, with every year added together: inhalers bought, asthma visits, antibiotic courses and sick notes. Each row is named, with its share in spring under the name ("27 of 41 in spring"). March to May in `--s1`, and the other months in `--ctx`. | `BY_MONTH` below. From `purchased-history.html`, the medical file's asthma visits and the medical certificates | Count purchases, not prescriptions. Keep the cause a guess ("likely"): the records show when, not why. Name the test to ask for in Hebrew. | "Two thirds of your inhalers were bought in spring. Pollen is a likely trigger; an allergy test (בדיקת אלרגיה) can tell." |
| **Is it the season?** "Is my vitamin D low, or is it just winter?" | Gallery card (*Correlation and causation*) | Dots on a calendar of months, January to December, with the years folded together and November to March shaded *Winter*. The healthy band is shaded, and each dot is labelled with its year and value, beside the dot so neighbours don't collide. | `VITD` (shared with *Did it work?*) | Point out both possible causes: the May result came from both the season and the supplements. Don't decide between them. | "Both low results were winter tests, in November and January. Your one good result was in May, while you were taking supplements. Vitamin D is lowest in winter for almost everyone, so a test in September would show where you really stand." |
| **Changes no test flags** "Is anything moving, even though it's still normal?" | Its own section in the gallery. healthHQ: *Now* (Moving inside the normal range, with sparklines) and *Results* | One row per series, in three groups: *Blood tests*, *Visit notes* (weight, blood pressure) and *Each year* (visits, sick days, medicines bought). Each row has its name with first and latest value, and a small line of its six points (a dot each), over its own normal range in green where it has one. *Mention it* rows in `--s1`, *Leave it* rows in `--ctx`. A legend: *Normal range*, and *2016 to 2026*. Don't draw the typical variation as a band: a pale band reads as the normal range. | `DRIFT`, `DRIFT_NOTES` and `DRIFT_YEARLY` below. From `test-results/history/`, `visit-summaries/details/`, the medical certificates and `purchased-history.html` | Change is (latest − first) ÷ first. Mention a test if its change is past its typical variation, or if it moved the same way at every test, at least three in a row. Leave out what age or a change of lab method explains. Leave out results that are already outside their range: those are the dashboard's. End with "worth raising at your next check-up". | "Three are drifting, though all still normal. Worth raising together at your next check-up." |
| **Everything since 1981** The Timeline view in healthHQ | healthHQ: *Timeline*, the first chart. Also the gallery's wide card | An event strip: five labelled lanes (Visits, Tests, Medicines, Vaccines, Hospital stays), each with its count and its own colour. One dot for each year that holds a record of that kind, evenly sized, with hospital stays larger. Milestone labels above with dashed leader lines. A pale blue panel over the years the site shows, from 2020, with the caption *Your full medical file* under the axis. Ticks every 5 years; on a phone every other year's dot is hidden, ticks are every 10 years, and the milestones become a list. The landing page draws only a slim strip of this: the total beside five flat lanes, with no lane names or milestones. | `TIMELINE` below. From every dated record, plus the medical file for everything before the JSON's few years | The counts must add up to the header's total. A dot means at least one record that year, not one record. This autumn's flu shot has no dot: *Loose ends* shows it as open. | "612 records over 45 years: 214 visits, 63 blood tests, 41 inhaler purchases, 31 vaccinations and two hospital stays: your tonsils in 1989, and the knee operation in 2016." |

## Sample data

Every number here is made up, and the copy above is written from it. Change one, and change the copy and the
[demo persona](positioning.md#demo-persona) with it.

```js
// Did it work? and Is it the season?: ng/mL, healthy 20 to 50
const VITD = [['2023-11-14', 11], ['2024-05-20', 24], ['2026-01-12', 17]];
const VITD_RX = [['2023-11-16', 'Vitamin D 1000 IU, 3 months'], ['2024-05-21', 'Vitamin D 1000 IU, renewed for 3 months']];
const VITD_BUY = ['2023-11-17', '2024-02-15', '2024-05-22', '2024-08-19']; // none after August 2024
const VITD_VISITS = [['2023-11-12', 'tired'], ['2024-05-21', 'better'], ['2026-01-05', 'tired again']]; // the word in the visit note
const VITD_MSG = ['2026-01-14']; // the doctor's message after the last result

// Loose ends: a = asked for or issued, b = due or valid until
const ENDS = [
  { n: 'Knee X-ray', a: '2026-02-10', b: '2026-02-24', st: 'done', word: 'Done' },
  { n: 'Blood sugar retest', a: '2026-01-20', b: '2026-04-20', st: 'overdue', word: 'Overdue' }, // "repeat fasting blood sugar in 3 months"
  { n: 'Mole check, dermatology', a: '2025-07-15', b: '2026-07-15', st: 'overdue', word: 'Overdue' }, // "again in a year"
  { n: 'Eye doctor', a: '2025-12-02', b: '2026-06-01', st: 'lapsed', word: 'Lapsed' }, // referral, never used
  { n: 'Physiotherapy', a: '2026-08-15', b: '2026-11-15', st: 'open', word: 'Until 15 Nov' }, // an approval, part used
  { n: 'Shoulder ultrasound', a: '2026-08-01', b: '2027-02-01', st: 'open', word: 'Open' }, // referral
  { n: 'Flu shot, 2026-27 season', a: '2026-09-01', b: '2027-03-31', st: 'open', word: 'Open now' },
  { n: 'Tetanus booster', a: '2017-06-20', b: '2027-06-20', st: 'upcoming', word: 'Next June' },
];

// What I spent: ₪ a year, 2008 to 2026 (2026 runs to September). Paid adds to 4,120 and covered to 3,270.
const SPEND_YEARS = Array.from({ length: 19 }, (_, i) => 2008 + i);
const PAID = [200, 220, 160, 260, 140, 200, 160, 170, 890, 230, 240, 170, 110, 130, 120, 150, 310, 140, 120];
const COVERED = [160, 170, 130, 190, 120, 150, 130, 140, 760, 170, 180, 130, 100, 110, 100, 120, 200, 110, 100];

// Is there a pattern?: counts by month, January first, every year added together. Inhalers are 1990 to 2018: 41 in
// all, 27 from March to May.
const BY_MONTH = {
  'Inhalers bought': [1, 2, 8, 11, 8, 2, 1, 1, 1, 3, 2, 1], // 27 of 41 in spring
  'Asthma visits': [1, 1, 5, 6, 4, 1, 1, 0, 1, 1, 1, 1], // 15 of 23
  'Antibiotic courses': [1, 1, 3, 3, 2, 1, 0, 0, 1, 1, 0, 1], // 8 of 14
  'Sick notes': [1, 1, 4, 4, 3, 1, 0, 0, 1, 1, 1, 0], // 11 of 17
};

// Changes no test flags: one value per test date, with the typical variation (%) a real change has to pass
const DRIFT_DATES = ['2016-03-08', '2018-04-17', '2020-06-09', '2022-05-24', '2024-05-20', '2026-01-12'];
const DRIFT = [
  { n: 'Liver enzyme (ALT)', u: 'U/L', r: 'normal up to 40', v: [18, 21, 24, 27, 31, 34], rcv: 54 }, // +89%: mention
  { n: 'Good cholesterol', u: 'mg/dL', r: 'healthy above 40', v: [58, 55, 53, 50, 47, 44], rcv: 20 }, // −24%: mention
  { n: 'Blood sugar', u: 'mg/dL', r: 'normal 70 to 100', v: [88, 90, 92, 95, 97, 99], rcv: 16 }, // +12.5%, up every time: mention
  { n: 'Platelets', u: '×1000/µL', r: 'normal 150 to 450', v: [262, 248, 270, 255, 259, 251], rcv: 26 }, // −4%: leave it
  { n: 'Potassium', u: 'mmol/L', r: 'normal 3.5 to 5.1', v: [4.3, 4.1, 4.4, 4.2, 4.0, 4.3], rcv: 13 }, // 0%: leave it
];

// The same six dates, read from visit notes. Weight has no normal range to draw.
const DRIFT_NOTES = [
  { n: 'Weight', u: 'kg', v: [78, 79, 81, 83, 85, 87] }, // mention
  { n: 'Blood pressure', u: 'mmHg, upper', r: 'normal 90 to 130', v: [118, 121, 123, 126, 128, 131] }, // mention
];
// Counts a year, in the same six years
const DRIFT_YEARLY = [
  { n: 'Visits', v: [4, 5, 5, 7, 8, 9] }, // mention
  { n: 'Sick days', v: [3, 2, 4, 2, 3, 3] }, // leave it
  { n: 'Medicines bought', v: [14, 12, 15, 13, 14, 13] }, // leave it
];

// Everything since 1981: records per lane (612 in all), and the milestones
const TIMELINE = { Visits: 214, Tests: 72 /* 63 blood tests, 9 imaging and ECG */, Medicines: 293 /* 41 of them inhalers */, Vaccines: 31, 'Hospital stays': 2 };
const MILESTONES = [
  ['1981-06-02', 'First check-up'], ['1988-05-01', 'Asthma diagnosed'], ['1989-03-14', 'Tonsils out'],
  ['2011-08-03', 'Penicillin rash'], ['2016-06-14', 'Knee operation'], ['2019-01-01', 'Asthma quiet since'],
];
```

## Before publishing

- Run each new categorical colour through `/dataviz`'s `validate_palette.js`, in `--mode light` and `--mode dark`.
- Render the page and look at every changed chart at desktop width, at 375px and in dark mode. The palette check covers
  colour only: labels that collide and bands that run off the plot only show up on the page.
- Check that every number in `say` matches the sample data. The copy is written from it.
