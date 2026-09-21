# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Chrome MV3 extension (TypeScript, Vite, no framework) that exports a member's Maccabi Online medical
records as one ZIP. `README.md` is the user- and contributor-facing document and is kept current: read
its *How it works* section before changing the run, and update it when behaviour changes.

## Commands

```sh
npm test                          # vitest run (synthetic fixtures only)
npx vitest run test/zip.test.ts   # one file
npx vitest run -t "round-trips"   # one test by name
npm run typecheck                 # tsc --noEmit
npm run dev                       # watch build into dist-dev/ (dev build, extra dev bridge)
npm run build                     # typecheck + store build into dist/
npm run package                   # build + release/<name>-<version>.zip (refuses a dev build)
npm run store-assets              # re-render store/ images (needs Chrome; CHROME_PATH)
npm run store-assets -- marquee   # just one, by shot name
npm run icons                     # public/icons/ + store/icon-128.png
```

There is no linter or formatter configured; `typecheck` and `test` are the whole gate. Load `dist-dev/`
(or `dist/`) unpacked at `chrome://extensions` to run it; the dev build is named "… (dev)" and can be
driven from the Maccabi page's console (see *Driving a run from the console* in the README).

## Architecture

Three layers, and the boundary between the first two is the point of the design:

- **`src/core/`** — all collection logic, and no extension or browser API. It reaches the site through
  `Transport`, writes through `Sink`, parses HTML through `HtmlParser` and gets time from `Clock`
  (all in `core/types.ts`). That is why the whole collector runs in Node under Vitest against a fake
  site. Keep it that way: no `chrome.*`, no `fetch`, no `DOMParser`, no `Date.now()` in `src/core/`.
- **`src/extension/`** — MV3 wiring: the service worker run loop, the tab, the offscreen document,
  IndexedDB staging, the popup.
- **`test/`** — Vitest against `fakes.ts`: a fake Maccabi (`fakeMaccabi`), `MemorySink`, `FakeClock`
  (sleeps are instant and advance time), and `happy-dom` for `DOMParser`.

### Two sites, two routes

The site has a REST API under `/sonline/` and legacy services under `/online/`. They authenticate
differently and the difference drives most of the run's shape:

- `/sonline/`: `Authorization: Bearer <sessionStorage.token>` read out of the tab; sent **from the
  extension** (host permission). The token is only issued and renewed on `/sonline/` pages.
- `/online/`: session cookies, and requests must **originate inside the tab** (`chrome.scripting`,
  `world: 'MAIN'`), after some `/online/` page has been loaded in the session.

`DEFAULT_ROUTES` in `background/tab.ts` encodes this; `routedTransport` picks per request path.
Functions passed to `executeScript` run in the page and must be self-contained (no closures, no imports).

### The run plan is the source of truth

`PLAN` in `src/extension/shared/state.ts` is the ordered list of run steps, and `next` (an index into
it) is checkpointed to `chrome.storage.local` after every step, so a paused run, a restarted service
worker or a Chrome restart continues from there. When you touch `PLAN`:

- add the collection function to `STEPS` in `src/core/steps.ts` first (its key is the plan step name);
- update `WEIGHTS` and `LABELS` in `state.ts` (both are `Record<PlanStep, …>`, so TS catches omissions);
- update `STAGES` in `src/extension/popup/model.ts` — each stage's steps **must be consecutive in
  `PLAN`**, or `stageStates` marks a finished stage current again;
- add an entry to `OPENED_BY` if the step only works on a page an earlier step opened (`resumeIndex`
  rewinds a resume to that opener);
- a stored run carries `nextStep` by name beside the index, so `alignToPlan` survives reordering across
  an extension update; a step that no longer exists forces the user to discard the run.

Order matters for reasons that are not arbitrary: the medical file is ordered first (Maccabi builds it
while everything else is collected) and downloaded last; the run crosses to the legacy page once and
collects everything that needs it there; `returnToSonline` re-takes a fresh token before the long wait.

### Resumability is a write-level property

`core/sinkRules.ts` decides `written | updated | unchanged | kept_existing`: JSON is rewritten only when
its canonical content differs (`core/canon.ts`), binaries are kept unless `replace` is asked for.
Steps use `c.exists()` / `c.pdfIfMissing()` to skip what they already have. **Every step must be safe to
re-run from the start** — a resume, a reconnect or a rewind through `OPENED_BY` will do exactly that.
`orderMedicalFile` guards itself (`run.order`) because re-running it would order and SMS again.

### Errors

`SessionEndedError`, `CancelledError` and `RateLimitedError` are *control* errors (`isControl`): they
propagate out of a step and the runner decides (reconnect twice, then pause; stop; discard). Anything
else thrown inside a step is recorded as a problem against that step and the run continues — so a single
bad record never ends an export. Problems are filed under the current step and cleared when that step
re-runs. Legacy steps don't get a 401, so `runner.ts` treats "Failed to fetch" in them as a dead session.

### Other pieces

- **Offscreen document** (`extension/offscreen/`) does the two things a service worker cannot: `DOMParser`
  for the two legacy HTML responses, and a `blob:` URL for the finished ZIP. Talk to it only through
  `offscreenClient.ts`.
- **Staging** (`shared/staging.ts`) is IndexedDB; it holds collected files until the ZIP downloads, then
  is cleared. The session token lives only in `chrome.storage.session` (memory).
- **Popup**: `popup/model.ts` is pure, unit-tested view logic; `popup.ts` is DOM only. Put anything with a
  decision in it in `model.ts`.
- **Design system**: navy (`#083f92`) headings, one blue (`#296bed`) for actions and progress, magenta
  (`#b83b7c`) for links, pale-blue cards at 20px, pill buttons — a register meant to sit comfortably next
  to Maccabi Online while staying the extension's own. Never add Maccabi's logo, wordmark or any other
  brand asset. The font stacks ask for `Roboto` first and fall back to the system face — a local lookup
  only: never ship or fetch a font here. Tokens are at the top of `popup.css`; `public/pages.css` repeats
  the ones the shipped policy pages need, since `public/` is copied verbatim. There is no dark theme: both
  files pin `color-scheme: light`, which also keeps Chrome's auto-dark-mode off them, and every text colour
  must stay at WCAG AA. Chrome caps a popup at 600px tall: keep every non-disclosure state under it
  (`notice` and open `<details>` may scroll).
- **Dev bridge**: `__DEV_BRIDGE__` (a Vite `define`) and the `mode === 'development'` branch in
  `manifest.config.ts` keep `background/dev.ts` and the content script out of the store build.
- File names are `<date>_<id>_<title>`, built with `stem`/`iso`/`safe`/`titleOf` from `core/util.ts`;
  `_` is the segment separator, so `safe()` and `title()` never emit one.

## Rules this repo enforces

- **Never commit real data.** No responses, exports, PDFs or anything from a real account; fixtures in
  `test/fakes.ts` are synthetic. `.gitignore` blocks `*.pdf`, `*.raw.json`, `maccabi-export-*/`.
- **Read-only, except one call.** The medical-file order (`core/sections/letters.ts` `placeOrder`) is the
  only request that changes anything. Don't add another, and don't call anything that marks items read,
  returns credentials or touches payments. Requests are paced `PACE_MS` (300 ms) apart, one at a time.
- **Every request goes in `docs/endpoints.json`** with the file it produces — the privacy policy and the
  store review depend on it being complete. `test/endpoints.test.ts` fails if a path in `src/core` isn't there.
- **Never write the member id into a path or a stored `endpoint` string**; `Collector.rec` keeps `{mid}`
  as a placeholder.
- **Keep the policies in sync**: `docs/privacy.md` ↔ `public/privacy.html`, `docs/terms.md` ↔
  `public/terms.html`, and change their effective date. For a material change also bump `TERMS_EFFECTIVE`
  in `shared/state.ts`, which makes the popup ask everyone to accept again.
- **Keep `public/third-party-notices.txt` current** when a runtime dependency changes (only `fflate`
  today, plus Vite's module preload polyfill).
- **Re-run `npm run store-assets`** when the popup's appearance changes.
- Builds are deliberately **not minified** so reviewers and users can read what ships.
