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
npm run store-assets              # re-render store/assets/ images (needs Chrome; CHROME_PATH)
npm run store-assets -- marquee   # just one, by shot name
npm run store-video               # re-render store/assets/promo-video.mp4 (not committed; ffmpeg or macOS)
npm run store-video -- 8 12       # just those seconds of it, while working on a scene
npm run store-video -- --audio-only   # just the soundtrack, to store/assets/promo-soundtrack.wav
npm run store-video -- --remux        # a changed soundtrack on the last render's picture, in seconds
npm run store-video -- --script       # the narration as one take's text, for ElevenLabs
npm run store-video -- --import take.mp3 --audio-only   # cut that take into the narration's lines
npm run icons                     # public/icons/ + store/assets/icon-128.png
```

There is no linter or formatter configured; `typecheck` and `test` are the whole gate you can run
here. GitHub adds one more: CodeQL default setup scans pull requests and runs weekly, and it has no
workflow file in the repo — it is configured in the repository's settings. Load `dist-dev/`
(or `dist/`) unpacked at `chrome://extensions` to run it; the dev build is named "… (dev)" and can be
driven from the Maccabi page's console (see *Driving a run from the console* in the README).

## Git

Work directly on `main`: commit and push to `main` (`git push origin main`), even when a session
assigns a `claude/...` branch — this is standing permission. Don't open pull requests unless asked.
Run `npm run typecheck` and `npm test` before every push, since nothing reviews a push before it lands.

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
- update `STAGES` in `src/extension/popup/model.ts`, the popup's list of sections, which is its view of the
  run: stages are **in `PLAN` order**, one line per thing the member gets (a long step may take a line per part,
  with `parts`), and the first stage holding a step is labelled with its `LABELS` entry. A step that only
  serves another (a page change, a wait) shares that one's line and label and says what it does in
  `DESCRIPTIONS`, which the current line shows under its name. 20 lines is what fits under the 600px cap.
  `docs/sections.md` maps each line to its steps, parts and files: update it with `STAGES`;
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
- **The export's `README.md`** (`shared/readme.ts`) is written for an AI assistant: the ZIP is made to be
  opened in Claude Cowork, Claude Code, ChatGPT Work or Codex, with the README as the assistant's saved
  instructions and the records as its project files. It opens with how to work with the records, then is
  their data dictionary, and it is kept short because it shares the assistant's context with them.
  `INSTRUCTION_POINTERS` writes a `CLAUDE.md` (which imports it) and an `AGENTS.md` (which points to it) beside
  it, because those tools load those names and never a README.
- **Staging** (`shared/staging.ts`) is IndexedDB; it holds collected files until the ZIP downloads, then
  is cleared. The session token lives only in `chrome.storage.session` (memory).
- **Popup**: `popup/model.ts` is pure, unit-tested view logic; `popup.ts` is DOM only. Put anything with a
  decision in it in `model.ts`.
- **Design system**: navy (`#083f92`) headings, one blue (`#296bed`) for actions and progress, magenta
  (`#b83b7c`) for links, pale-blue cards at 20px, pill buttons — a register meant to sit comfortably next
  to Maccabi Online while staying the extension's own. Never add Maccabi's logo, wordmark or any other
  brand asset. The font stacks ask for `Roboto` first and fall back to the system face — a local lookup
  only: never ship or fetch a font here. Tokens are at the top of `popup.css`; `public/pages.css` repeats
  the ones the shipped pages need, since `public/` is copied verbatim. There is no dark theme: both
  files pin `color-scheme: light`, which also keeps Chrome's auto-dark-mode off them, and every text colour
  must stay at WCAG AA. Chrome caps a popup at 600px tall: keep every non-disclosure state under it
  (`notice` and open `<details>` may scroll).
- **Store assets**: `store/src/stage.ts` draws the images (one layout per `?shot=`), `store/src/video.ts` draws the
  promo video a frame at a time (`window.video.at(n)`, nothing animates by itself, so the render is the same
  everywhere: every value is a function of the second, shaped by the helpers in `motion.ts`). Both are built
  around the **real popup** in an iframe, fed made-up states by `mock-chrome.ts`; the video drives a whole run
  through it with `demoRun`, which fires the popup's own `storage.onChanged` listener with states built from
  `PLAN` and `WEIGHTS`. The README's poster is that page again, asked for one frame with a play badge over it
  (`?poster=`, taken by `store-assets` as the `poster` shot). What all of them draw lives in
  `store/src/parts.ts` and `parts.css`; `scripts/stage.mjs` builds, serves and photographs them in headless
  Chrome. The video is 4K at 60 fps (the stage at `deviceScaleFactor` 2), each frame piped as it is taken to
  `ffmpeg` if it is on `PATH`, else to `scripts/encode-mp4.swift` (macOS); the popup's own CSS animations are
  put on the film's clock, or they would flicker. A frame must look the same in a browser that has just
  started as in one that drew the frames before it (the render restarts it every 150 frames): no
  `translate3d`, whose layers keep text where it was first drawn, and no camera or element creeping by
  fractions of a pixel, which reads as text shivering. The soundtrack is scored from the same timeline
  (`window.video.soundtrack`: the parts, `NARRATION`, `SOUNDS`) by `scripts/soundtrack.mjs`, which synthesizes the
  music and effects itself; the voice is ElevenLabs (`scripts/narration.mjs`): one take of the script
  (`--script`) cut into lines by `--import <take>`, or line by line with `ELEVENLABS_API_KEY` from `.env`, and
  cached in `.cache/narration/`. Retime a scene and the narration moves with it; a line that no longer fits stops
  the render before the first frame. The MP4 is gitignored, because the store's video field takes a YouTube link.
- **The mark** is a folder with a download arrow, drawn in Maccabi Online's own illustration register:
  a navy (`#083f92`) outline of even weight with round joins, and a pale-pink (`#f1c1cd`) echo of that
  outline offset up and left, so it reads as slightly off-register print. The folder is filled white so
  the navy survives a dark Chrome toolbar. Its geometry lives twice — as a rounded polygon in
  `scripts/make-icons.mjs` and as `MARK_PATH` in `store/src/parts.ts` — so change both together. 16 and
  32px have hand-tuned layouts in `PIXEL`, on the pixel grid; at 16px the arrow is a solid staircase,
  because a 1px chevron there just makes a cross.
- **Dev bridge**: `__DEV_BRIDGE__` (a Vite `define`) and the `mode === 'development'` branch in
  `manifest.config.ts` keep `background/dev.ts` and the content script out of the store build.
- File names are `<date>_<id>_<title>`, built with `stem`/`iso`/`safe`/`titleOf` from `core/util.ts`;
  `_` is the segment separator, so `safe()` and `title()` never emit one.

## Rules this repo enforces

- **Never commit real data.** No responses, exports, PDFs or anything from a real account; fixtures in
  `test/fakes.ts` are synthetic. `.gitignore` blocks `*.pdf`, `*.raw.json`, `maccabi-export-*/`. The one
  picture of a real session is the README's `docs/images/screenshot.png`, and it passes that bar only because
  nothing in it identifies anyone: no name, no member id, no record content, an empty content area. Hold a
  replacement to the same check, and strip the file's metadata. Everything under `store/` stays on the
  placeholder page — the store's screenshots must not carry Maccabi's site or brand.
- **Read-only, except one call.** The medical-file order (`core/sections/letters.ts` `placeOrder`) is the
  only request that changes anything. Don't add another, and don't call anything that marks items read,
  returns credentials or touches payments. Requests are paced `PACE_MS` (300 ms) apart, one at a time.
- **Every request goes in `docs/endpoints.json`** with the file it produces — the privacy policy and the
  store review depend on it being complete. `test/endpoints.test.ts` fails if a path in `src/core` isn't there.
- **Never write the member id into a path or a stored `endpoint` string**; `Collector.rec` keeps `{mid}`
  as a placeholder.
- **Keep the policies in sync**: `docs/privacy.md` ↔ `public/privacy.html`, `docs/terms.md` ↔
  `public/terms.html`, and change their effective date. For a material change also bump `TERMS_EFFECTIVE`
  in `shared/state.ts`, which makes the popup ask everyone to accept again. Likewise the README's *Hand it to an
  AI assistant* ↔ `public/ai-assistant.html` (the popup's "See how").
- **Keep `public/third-party-notices.txt` current** when a runtime dependency changes (only `fflate`
  today, plus Vite's module preload polyfill). The README's `docs/images/chrome-web-store-badge.png` isn't one of
  them: it is Google's own badge, committed byte for byte as it is served from
  [their branding page](https://developer.chrome.com/docs/webstore/branding), and their terms allow resizing
  it and nothing else. It has to keep linking to the listing. It is the bordered version, whose fill is opaque
  white, because the borderless one is transparent and would be dark text on dark in GitHub's dark theme.
- **Re-run `npm run store-assets`** when the popup's appearance changes, and `npm run store-video` if the video's
  own copy or the popup states it shows go stale; a re-rendered video has to be re-uploaded to YouTube, and its
  poster (`store-assets -- poster`) re-rendered with it.
- Builds are deliberately **not minified** so reviewers and users can read what ships.
