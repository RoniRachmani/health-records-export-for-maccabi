# Popup redesign: the Exporting view, header and footer

A spec for a new session to implement. It was designed with the user over several rounds of mockups; the mockups are
at https://claude.ai/artifact/3WLeUJP2ErYwwTxUmfqoXC (read it with the Artifact tool, `action: "read"`). The final choices are
the sections headed *The chosen header*, *G3e-2 with a pale-blue panel* (G3e-2), *The bottom of the popup* ("Made to be
noticed"), *A tidier footer* ("Grouped by purpose") and *G3e-2 with Cancel export*. Where this spec and a mockup
disagree, this spec wins: it records decisions made after the mockups were drawn.

Read `CLAUDE.md` and the README's *How it works* first. Keep to the repo's rules: `src/core/` stays free of browser APIs,
decisions go in `popup/model.ts` (pure, unit-tested) and DOM in `popup.ts`, every text colour stays WCAG AA, no font is
shipped or fetched, and every non-disclosure view stays under Chrome's 600px popup cap.

## 1. What changes, in one picture

```
┌──────────────────────────────────────────────┐
│ [icon] Health Records Export  (Unofficial)   │  header: one line, on one axis
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │ (Exporting · 47%)        (Cancel export) │ │  pale-blue panel: everything that moves
│ │ Saving how each lab value changed 38 of 61│ │
│ │ ███████████████▒▒▒▒░░░░░░░░░░░░░░░░░░░░░ │ │  bar; ▒ = rest of the current section
│ │ 124 files · 5.1 MB · 2 min elapsed       │ │
│ └──────────────────────────────────────────┘ │
│ ✓ Ordering your medical file                 │
│ ✓ Your details and doctor                  6 │  finished lines: files they collected
│ ✓ Test results                            96 │
│ ◉ Lab histories                              │  current line: name only
│ ○ Visit summaries                            │
│ …                                            │
│ ┌──────────────────────────────────────────┐ │
│ │ [tab] Keep the Maccabi Online tab open…  │ │  reminder strip
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ Privacy · Terms  Report a problem · v0.6.1 gh│  footer: legal left, project right
└──────────────────────────────────────────────┘
```

Rule behind all of it: **each fact appears once in the view.** The step's name is only in the list; what it is doing
and how far along it is are only in the panel; sections done are only the list's ticks (the "7 of 17 sections" counter
goes).

## 2. Header (every view)

`popup.html` header: the 38px icon, then on one line the name and an *Unofficial* chip.

- Name: "Health Records Export", 20px, weight 500, line-height 24px, `--heading`, `white-space: nowrap`.
- Chip: text "Unofficial", 11px, weight 500, line-height 1, padding 3px 7px, pill radius, background `#eef1f6`,
  colour `--muted` (check AA on that fill). It carries the rest of the disclaimer for hover and screen readers:
  `title="Not affiliated with Maccabi Healthcare Services"` plus an accessible description (for example a
  visually-hidden span, so the full sentence is read out, not only "Unofficial").
- The tagline paragraph (`.tagline`, "Unofficial · Not affiliated with Maccabi") is removed.
- Alignment: the middle of the icon, the middle of the name's capitals and the middle of the chip lie on one
  horizontal line. With Roboto at 20/24 in the mockup this held to 0.1px with plain flex centring. Measure it in the real
  popup (canvas `measureText('H').actualBoundingBoxAscent` against the line box) with Roboto and with the system
  fallback (Roboto is **not** installed on this Mac); if the fallback is off by more than 0.5px, nudge the name with
  `position: relative; top: …`. No layout change beyond that.
- The name and chip must fit beside the icon at 360px (22px did not; 20px does). The header stays 58px tall.

## 3. Footer (every view)

Replace "No servers, no analytics." and the current row with two groups:

- Left, legal: `Privacy` · `Terms` (the existing links to `/privacy.html` and `/terms.html`, `target="_blank"`).
- Right, project: `Report a problem` · `v0.6.1` then the GitHub mark.
  - *Report a problem* opens `https://github.com/RoniRachmani/health-records-export-for-maccabi/issues/new/choose`
    (the repo has issue forms in `.github/ISSUE_TEMPLATE/`), `target="_blank" rel="noreferrer"`.
  - The version is text in `--faint`, as today (`#version`).
  - The GitHub mark is the existing link (`aria-label="Source code on GitHub"`), icon in `--faint`.
- Links magenta (`--accent`) with **no underline** at rest; underline on hover and focus-visible. Separators are a `·`
  in `--faint`, `aria-hidden`. 6px gaps. One line, same 39px height as today.

"No servers, no analytics." leaves the popup. The claim stays in the README, the privacy policy and the store listing.

## 4. The Exporting view (`progressView`)

### 4.1 The panel

One pale-blue panel (`--surface-2` fill, 1px `--line-soft` border, 14px radius) at the top of the view, holding in
this order (reading order: what, then how far, then totals):

1. **Pill row**: the status pill (`Exporting · 47%`, or `Saving`) and on the right the **Cancel export** button
   (replaces `Stop…`; see §6). The button sits on the panel; give it the white `--bg` fill so it stays a button.
2. **Activity line**, navy (`--heading`) 12.5px/17px: on the left the current description (`stepText(run).detail`, one
   line, ellipsis); on the right, when the step reports a record count, `38 of 61` in 500 weight with tabular figures.
   No count, no right side. The line is always present (keeps the height steady); before the first report it shows
   the step's `''` description.
3. **Bar with the section band** (§4.2).
4. **Totals**: `124 files · 5.1 MB · 2 min elapsed` (`statsText`), muted 12.5px. The right-hand `n of 17 sections`
   is removed.

### 4.2 The bar and the section band

The main bar keeps its fill (`run.percent`). Behind the fill, a darker band (`color-mix(in srgb, var(--primary) 30%,
var(--tint))`) covers the **rest of the current section**: from the fill's end to the section's end. As the count
rises the fill eats the band; when it is gone the line ticks. Inside the panel the bar's track is white with a 1px
`--line-soft` inset ring so the fill and band keep their contrast. The band updates in place with the fill.

Section span comes from the plan's weights: add to `model.ts` a pure `stageSpan(stageIndex): { start: number; end:
number }` in percent, built from `STAGES`, `PLAN` and `WEIGHTS` the same way `percentOf` in `shared/state.ts` counts.
A stage split into parts (`Test results` / `Lab histories`, both `testResults`) gets its share of the step as the
collector reports it: `testResults.ts` reports the two halves as `tests.length * 2`, so each part is half the step's
weight. Check with the real numbers: total weight 85, Lab histories spans 36.5% to 54.1%, and at 38 of 61 the run is
at 47%. Unit-test `stageSpan` against `percentOf` so they can't drift.

### 4.3 The list

- Current line: the name only, marked as today (pulsing ring, navy, `aria-current="step"`). Its `.detail` line goes;
  the description is in the panel.
- Finished lines: on the right, in `--faint` tabular figures, **how many files that line collected** (§5.2). Show
  nothing when the count is unknown or 0 (the ordering line writes no file of its own, and an empty section has
  nothing to count).
- Pending lines: unchanged.
- The list is hidden while the cancel question is asked, as today.

### 4.4 The reminder strip

Below the list, a strip in the style of the popup's notes: `--surface-2` fill, 10px radius, padding 7px 10px, a 14px
browser-window icon in `--primary` (a rounded rectangle with a top bar and two dots, **not** a folder, which would echo
the extension's mark), then the text in `--heading` 12px. The text is `hintText(run)` from `model.ts`, unchanged in
logic: "Keep the Maccabi Online tab open and in front." normally, "Usually ready within minutes, 15 at most." while the
medical file is still being prepared, "It will be in your Downloads folder in a moment." while saving. The old `.hint`
line under the stats and the divider are removed.

### 4.5 Spacing

One rhythm, measured in the mockup: 16px from the popup's edges; 12px from the header to the panel, inside the panel
(11px padding + 1px border), and from the panel to the list; 8px between the panel's parts; 12px from the list to the
strip and from the strip to the footer. The list's own lines stay 16px, back to back.

### 4.6 Height

The mockup measured 557px of 600 for the Exporting view (today 526px). Measure every view after the change with the
store stage (`?state=` in `store/src/mock-chrome.ts`, see §8) and keep each under 600px with the header and footer in.

## 5. Data the popup needs

### 5.1 A record count for the current step

`stepDone`/`stepTotal` are not record counts everywhere (profile counts 6 phases, purchases 3, the medical-file wait
milliseconds, and test results / lab histories share one scaled total). Add an optional record count to the progress
event, reported only where a step counts records:

- `core/types.ts`: `ProgressEvent` gains `items?: { done: number; total: number }`; `Collector.progress(done, total,
  detail?, items?)`.
- Report it in: `visits` (visits), `testResults` (test results: `i` of `tests.length`; lab histories: `j` of
  `ids.length`), `medications` (prescriptions), `referrals` (referrals, approvals, information pages), `letters`
  (letters), `other.ts` (doctor inquiries, saved documents, hospital letters), `vaccinations` (groups, without the
  `+ 1` booklet step). Not in profile, purchases, the empty sections, the order or the medical-file wait.
- `RunState` gains `items?: { done: number; total: number }`, set from the event in `runner.ts` next to
  `stepDone`/`stepTotal` and cleared where those are reset at a step's start.
- Popup: `model.ts` `countText(run)` returns `"38 of 61"` or `''`. Tests for both.

### 5.2 Files per list line

`fileCount` is the staged total, including files a resumed run had already staged, so a snapshot difference would read
0 for re-run work. Instead, record which step and part first wrote each staged file:

- The staging sink (`shared/staging.ts`) stores, in each file's meta, the key of the step and part that first wrote it
  (`step` or `step:part`, the part as in `partOf`); an `unchanged`/`kept_existing` write keeps the existing key.
  Aliases (`same_as`) are not files and are not counted.
- `stagedTotals()` also returns counts per key; `runner.ts` `save()` stores them in `RunState.filesByKey`.
- `model.ts` `stageFileCounts(run)` maps them to `STAGES` lines (a line's steps and parts), returning a number or
  `undefined` per line. Files staged by an older version have no key and count nowhere; that is fine (the line shows
  nothing).
- This does not rename files, so `FILE_LAYOUT` stays.

## 6. Cancel export

- The running view's button is **Cancel export** (today `Stop…`, `cancelButton()` in `popup.ts`). The paused view's
  button uses the same function and changes with it.
- The question: *Cancel the export and delete the files collected so far?*
- **Decision needed before implementing:** the two answers. The mockup shows *Keep exporting* / *Cancel and delete*.
  The concern raised: in a dialog, a button starting with "Cancel" usually means "never mind", and here it is the
  destructive one. Proposed instead: *Keep exporting* / **Delete and stop**. Ask the user which; do not guess.
- Update `test/popup.test.ts` (`buttonNamed('Stop…')` and the question text).

## 7. What does not change

The notice, ready, login, paused (except the button label), error, stopping and done views keep their content; they
only get the new header and footer. `STAGES`, `LABELS`, `DESCRIPTIONS` and `docs/sections.md` stay. No new request, so
`docs/endpoints.json` stays. The design tokens stay; the only new colour is the chip's `#eef1f6` fill.

## 8. Checking it

1. `npm run typecheck` and `npm test`. New unit tests: `stageSpan` (against `percentOf`), `countText`,
   `stageFileCounts`, the sink's key rule (first writer keeps it). Popup tests: the chip and its full-sentence
   description, the footer's links and targets, the panel's order, no `.detail` in the list, no "sections" counter,
   the strip text per state, the new cancel wording.
2. Every state at the popup's size: `npm run build:dev` is not enough, use the store stage. Build it with
   `npx vite build --config vite.store.config.ts`, serve `dist-store/`, open
   `src/extension/popup/popup.html?state=notice|ready|login|running|paused|error|done|problems` at 360px wide and
   measure `document.body` height (all under 600px) and the header alignment (§2). Add `items` and `filesByKey` to
   the `running` state in `store/src/mock-chrome.ts` so the counts show.
3. A live run: ask the user to run `npm run live -- --screenshots` in their terminal (it signs in with their
   password, so they run it, not you) and read the result; the popup screenshots land in
   `.cache/live-screenshots/<UTC time>/`. It never orders the medical file and stops before the ZIP.

## 9. Docs and assets to update

- `README.md` *The look*: the header no longer says "Unofficial · Not affiliated with Maccabi"; describe the chip and
  its tooltip. The feature list's "No servers, no analytics, no remote code" stays.
- `CLAUDE.md` design-system paragraph and the comment at the top of `popup.css` ("the header says it is unofficial on
  every screen"): the header says *Unofficial*, with the full disclaimer as the chip's description.
- `docs/store-listing.md` line ~155 quotes the popup's tagline; update it.
- `store/src/video.ts` and `store/src/stage.ts` show the real popup, so they pick the change up; re-render with
  `npm run store-assets` (and `store-video` if its states look stale) only after installing Roboto on this Mac
  (`fc-list | grep -i roboto` must find it; see CLAUDE.md), and remember the video needs re-uploading to YouTube.
- Commit to `main` per CLAUDE.md, after typecheck and tests. Delete this spec in the same commit, or keep it in
  `docs/` if the user wants a record.
