# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Chrome MV3 extension (TypeScript, Vite, no framework) that exports a member's Maccabi Online medical
records as one ZIP. `README.md` is the user-facing document and `CONTRIBUTING.md` the contributor-facing one, and
both are kept current: read `CONTRIBUTING.md`'s *How a run works* before changing the run, and update them when
behaviour changes. `docs/README.md` says what each file in `docs/` is for; `tools/endpoint-scan/README.md` describes the
endpoint scan.

## Commands

```sh
npm test                          # vitest run (synthetic fixtures only)
npm run coverage                  # the same, held to the coverage floors in vitest.config.ts (CI runs this)
npx vitest run test/zip.test.ts   # one file
npx vitest run -t "round-trips"   # one test by name
npm run typecheck                 # tsc: the extension and tests, then scripts/ (JSDoc, checkJs) and store/
npm run dev                       # watch build into dist-dev/ (dev build, extra dev bridge)
npm run build                     # typecheck + store build into dist/
npm run package                   # build + release/<name>-<version>.zip (refuses a dev build)
npm run live                      # a live export on your own account, never ordering, no ZIP (1Password refs in .env)
npm run export                    # an export with no extension: test results into ./maccabi-export-<today>/ (same .env)
npm run export -- --all           # every section, nothing ordered; --steps a,b for some; --out DIR; --keep
npm run export -- --no-browser    # no Chrome: SAML sign-in over fetch with the password from .env or 1Password, requests from Node
npm run export -- --no-browser --sms   # the same, signed in with an SMS code typed in (the ID number alone is read; --phone N picks the phone)
node scripts/discover-login.mjs   # record the browser sign-in's request shapes (secrets replaced), to keep maccabi-session.mjs true to the site
npm run endpoints                 # the site's own calls that docs/endpoints/endpoints.json lacks, and mapped ones it dropped (same .env; calls no API)
npm run endpoints -- --from DIR   # the same on scripts a --save DIR kept, with no sign-in; --rea adds REA's parser
npm run env                       # write .env from 1Password, by the references in .env.tpl (op inject)
npm run clean                     # remove dist/, dist-dev/, dist-store/, dist-cli/, release/, coverage/
npm run release:zip               # clean, test, build:dev, package
npm run release                   # release:zip, then store-assets, store-video
npm run store-assets              # approved store/assets/ images at store size, upload ZIP, poster and link previews (Chrome; CHROME_PATH)
node scripts/check-store-assets.mjs # verify PNG dimensions, hashes, colour types and ZIP contents
npm run store-assets -- marquee   # just one, by shot name
npm run store-video               # re-render store/assets/promo-video.mp4 (not committed; ffmpeg or macOS)
npm run store-video -- 8 12       # just those seconds of it; --remux, --captions, --audio-only and the rest: the store-media skill
npm run film:before-thursday      # the Before Thursday draft film instead (store-video --before-thursday, same flags but --clip)
npm run icons                     # hand-tuned public/icons/ (the store icon is `npm run store-assets -- icon`)
npm run site-check                # the popup's states under 600px, then the landing page's motion at five screen sizes
npm run site-check -- popup       # just the popup's height (CI runs this)
npm run site-check -- frames .path scroll 10 375x812   # photograph one picture as it scrolls in (or `time 0 13 0.5`)
npm run site-check -- styles save   # keep every computed style of the page, popup and store images; `-- styles` after a CSS change proves nothing moved
```

There is no linter or formatter configured; `typecheck` and `coverage` (the tests, and the floors in
`vitest.config.ts`) are the whole gate you can run here, and CI adds `build` and `site-check -- popup` in its own Chrome. GitHub adds one more: CodeQL default setup
scans pull requests and runs weekly, and it has no workflow file in the repo — it is configured in the
repository's settings. Load `dist-dev/` (or `dist/`) unpacked at `chrome://extensions` to run it; the dev
build is named "… (dev)" and can be driven from the Maccabi page's console (see *Driving a run from the
console* in `CONTRIBUTING.md`).

Rendering the store images, video, poster, link previews or icons (fonts, the CI workflows, the approved
listing bundle): load the `store-media` skill (`.claude/skills/store-media/SKILL.md`) first.

A GitHub release is published by the *Release* workflow
(`.github/workflows/release.yml`, run with the version): it needs the version bump and `docs/releases/<version>.md`
on `main` first. It tags `v<version>`, uploads the packaged ZIP to a draft, then publishes the immutable release.

## Git

Repository admins can push straight to `main`: the `main` ruleset lets the admin role bypass it. Everyone
else, Dependabot and the workflows included, branches from `main`, pushes the branch and opens a pull request,
and the `check` CI job must pass against the latest `main` before merging. No second-person approval is required.
Run `npm run typecheck` and `npm test` (or `npm run coverage`, which CI runs) before every push, and resolve review
conversations before merging. CONTRIBUTING.md's *Pull requests* says the same for contributors; keep the two in step.

## Architecture

Three layers, and the boundary between the first two is the point of the design:

- **`src/core/`** — all collection logic, and no extension or browser API. It reaches the site through
  `Transport`, writes through `Sink`, parses HTML through `HtmlParser` and gets time from `Clock`
  (all in `core/types.ts`). That is why the whole collector runs in Node under Vitest against a fake
  site. Keep it that way: no `chrome.*`, no `fetch`, no `DOMParser`, no `Date.now()` in `src/core/`.
- **`src/extension/`** — MV3 wiring: the service worker run loop, the tab, the offscreen document,
  IndexedDB staging, the popup.
- **`test/`** — Vitest against `fakes.ts`: a fake Maccabi (`fakeMaccabi`), `MemorySink`, `FakeClock`
  (sleeps are instant and advance time), and `happy-dom` for `DOMParser`. `runner.test.ts` drives the run loop
  with `chrome.*` faked; `sinkContract.test.ts` holds `MemorySink`, the shipped IndexedDB `stagingSink` (on
  `fake-indexeddb`) and the terminal export's `folderSink` to the same write rules; `repoRules.test.ts` checks the
  pairs below that must stay in step.

### Two sites, two routes

The site has a REST API under `/sonline/` and legacy services under `/online/`. They authenticate
differently and the difference drives most of the run's shape:

- `/sonline/`: `Authorization: Bearer <sessionStorage.token>` read out of the tab; sent **from the
  extension** (host permission). The token is only issued and renewed on `/sonline/` pages.
- `/online/`: session cookies, and requests must **originate inside the tab** (`chrome.scripting`,
  `world: 'MAIN'`), after some `/online/` page has been loaded in the session.

`DEFAULT_ROUTES` in `background/tab.ts` encodes this; `routedTransport` picks per request path.
Functions passed to `executeScript` run in the page and must be self-contained (no closures, no imports);
`test/inPage.test.ts` runs each from its own source alone.

### The run plan is the source of truth

`PLAN` in `src/extension/shared/state.ts` is the ordered list of run steps, and `next` (an index into
it) is checkpointed to `chrome.storage.local` after every step, so a paused run, a restarted service
worker or a Chrome restart continues from there. When you touch `PLAN`:

- add the collection function to `STEPS` in `src/core/steps.ts` first (its key is the plan step name);
- add its row to `STEP_ROWS` in `state.ts`, in run order, with its `weight` and `label`: `PLAN`, `WEIGHTS` and
  `LABELS` are read off those rows;
- update `STAGES` in `src/extension/popup/model.ts`, the popup's list of sections, which is its view of the
  run: stages are **in `PLAN` order**, one line per thing the member gets (a long step may take a line per part,
  with `parts`), and the first stage holding a step is labelled with its `LABELS` entry. A step that only
  serves another (a page change, a wait) shares that one's line and label and says what it does in
  `DESCRIPTIONS`, which the panel above the list shows while that line is current. The running view is 589px of the 600px cap
  (`npm run site-check -- popup` measures it): merge lines before adding one. `docs/sections.md` maps each line to its
  steps, parts and files: update it with `STAGES` (`repoRules.test.ts` checks the lines, steps and parts);
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
Steps use `c.exists()` / `c.pdfIfMissing()` to skip what they already have. A document that can also live
elsewhere in the export (an inquiry's form, an upload, a linked visit's summary) goes through `c.pdfOnce()` /
`c.saveOnce()` instead: the sink indexes every binary by SHA-256 (`findBySha256`), and a copy is not written but
recorded as an alias (`putAlias` / `aliasOf`), which the record's `files[]` names as `same_as` and a re-run skips
without a request. The two longest steps (`testResults`, `doctorCommunications`) also mark each record collected
whole in `ctx.marks` (`Collector.marked` / `markDone` / `finishMarks`), so a re-run skips them; a record that filed a
problem is never marked, since problems are cleared when a step re-runs. **Every step must be safe to
re-run from the start** — a resume, a reconnect or a rewind through `OPENED_BY` will do exactly that. A change that
renames files already staged bumps `FILE_LAYOUT` in `state.ts`, so a run paused across the update is discarded
instead of staging both names.
`orderMedicalFile` guards itself (`run.order`) because re-running it would order and SMS again. A stored run nobody
comes back to for `STAGING_TTL_MS` (7 days) is discarded with its staging (`abandoned` in `state.ts`, checked by
`loadRun`, woken by the `hrem-expiry` alarm): change the Privacy Policy with it.

### Errors

`SessionEndedError`, `CancelledError` and `RateLimitedError` are *control* errors (`isControl`): they
propagate out of a step and the runner acts on `stepFailure` in `shared/state.ts`, which decides (reconnect
twice, then pause; stop; discard) and is unit-tested apart from `chrome.*`. Anything
else thrown inside a step is recorded as a problem against that step and the run continues — so a single
bad record never ends an export. Problems are filed under the current step and cleared when that step
re-runs. Legacy steps don't get a 401: an ended session answers them with a followed redirect to
`/my.logout.php3` (a 200 web page), which `Collector.legacy` and `fetchBin` turn into `SessionEndedError`
from the response's final URL, and `runner.ts` also treats "Failed to fetch" in them as a dead session.
A section reads the list it walks with `Collector.listIn`, never `(r.data && r.data.key) || []`: a list key the site
renamed is then a `kind: 'shape'` problem (the site may have changed), not a section that looks empty.

### Other pieces

- **Offscreen document** (`extension/offscreen/`) does the two things a service worker cannot: `DOMParser`
  for the two legacy HTML responses, and a `blob:` URL for the finished ZIP. Talk to it only through
  `offscreenClient.ts`.
- **The export's `README.md`** (its fixed text in `shared/export-readme.md`, filled in by `shared/readme.ts`) is written for an AI assistant: the ZIP is made to be
  opened in the Claude desktop app (formerly Claude Cowork), Claude Code, ChatGPT Work or Codex, with the README as the assistant's saved
  instructions and the records as its project files. After one line for the member (the website's section on opening an
  export, for whoever opens the export with no popup at hand), it opens with how to work with the records, then is
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
  brand asset. The header says *Unofficial* in a chip on every screen, with the full disclaimer as its tooltip and
  its accessible description. The font stacks ask for `Roboto` first and fall back to the system face — a local lookup
  only: never ship or fetch a font here. Tokens are at the top of `popup.css`; `public/pages.css` repeats
  the ones the shipped pages need, since `public/` is copied verbatim; `site/ai-assistant.css` adds the landing page's
  picture-led base (made-up records only, and no script) and the radio-button tabs its Ask section uses. There is no dark theme:
  `popup.css` and `pages.css` `color-scheme: light`, which also keeps Chrome's auto-dark-mode off them, and every text colour
  must stay at WCAG AA. Chrome caps a popup at 600px tall: keep every non-disclosure state under it
  (`notice` and open `<details>` may scroll).
- **Store images, the promo video and the mark** (`store/`, `scripts/store-*.mjs`, `scripts/make-icons.mjs`): how
  each is built, and what a frame must never do, is in the `store-media` skill.
- **Dev bridge**: `__DEV_BRIDGE__` (a Vite `define`) and the `mode === 'development'` branch in
  `manifest.config.ts` keep `background/dev.ts` and the content script out of the store build.
- **The product's name** is in `shared/name.ts` in its three forms (the store's, the everyday one, the short one): code
  imports it, and HTML, Markdown and the scripts spell it out. `repoRules.test.ts` holds every spelling in the repo to
  one of them, so a rename starts there and the test lists the rest. The YouTube channel keeps the name it was opened with.
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
- **The rules cover the terminal scripts too** (`scripts/`, `npm run export` and `npm run live`), with one exception:
  the *returns credentials* clause is the extension's only, because the no-browser export cannot work without the
  portal's token bootstrap (`scripts/maccabi-session.mjs`, the one such request, listed in `scripts-endpoints.json`).
  So the pacing holds there as well: every request a script sends, the sign-in chain and redirect hops included,
  goes out `PACE_MS` after the previous one came back, one at a time, through the single queue in
  `MaccabiSession.request` — never a timer of its own beside it. The session's ended-session markers are the
  collector's (`signedOutUrl`, `LOGIN_ORIGIN` from `core/collector.ts`), its origins and legacy page are
  `MACCABI_ORIGIN` and `SUMMARY_PAGE` from `shared/state.ts`: the scripts take all of these from `core` and never
  spell them again (`maccabi-browser.mjs`'s `ORIGIN` is the one copy, which a test holds to it). They are typed
  with JSDoc, checked by `scripts/tsconfig.json`, never with a `.d.mts` beside them. A sign-in attempt (a password, an SMS code) is sent once and never resubmitted; what is refused
  before it is sent (an empty password, a code that is not six digits) leaves the sign-in open.
- **The research tools stay internal.** The no-browser SAML/SMS sign-in (`scripts/maccabi-session.mjs`), the export
  from the terminal (`npm run export`), the live run (`npm run live`), the sign-in recorder
  (`scripts/discover-login.mjs`) and the endpoint scan with REA (`tools/endpoint-scan/`) are for researching the site
  and checking the collector on your own account, and nothing more. They never ship (not in the extension, the store
  package, a release or the website), and nothing a member reads (the README's parts for members, the store listing, the landing
  page, the popup, an export's README) offers or mentions them. Work on them keeps out of the code that ships
  (`src/extension/`, and `src/core/` beyond what the extension needs too); `src/cli/index.ts` only re-exports for them.
- **Every request goes in `docs/endpoints/`**: the collector's (`src/core`, sent from the tab or from Node) in
  `endpoints.json` with the file it produces, and the ones the scripts send themselves (the sign-in chain, the token
  bootstrap, the legacy page prime) in `scripts-endpoints.json` with what each sends and returns, names and shapes and
  never values — the privacy policy and the store review depend on the first being complete, and the second says what
  else this repo asks the site for. `test/endpoints.test.ts` fails if a path in `src/core` or in
  `scripts/maccabi-session.mjs` isn't in its file.
- **Never write the member id into a path or a stored `endpoint` string**; `Collector.rec` keeps `{mid}`
  as a placeholder.
- **Keep the policies in sync**: edit `docs/privacy.md` and `docs/terms.md` only, then run `node scripts/policy-pages.mjs`,
  which writes `public/privacy.html` and `public/terms.html` from them (`repoRules.test.ts` fails while a page differs from
  its output, and also compares their words), and change their effective date. For a material change also bump `TERMS_EFFECTIVE`
  in `shared/state.ts`, which makes the popup ask everyone to accept again. `.github/workflows/pages.yml` publishes `public/` on GitHub Pages, so these pages are also public web pages.
- **The guide to opening an export is on the website, not in the extension**: the landing page's last sections, from
  `#where` ("Open it in Claude or ChatGPT"). The popup's "Open it in an AI", the "Export ready"
  notification's button and every export's README link there (`SITE_OPEN` in `shared/state.ts`), and the popup's
  "what to ask your AI assistant" while the medical file is prepared opens `#ask` (`SITE_ASK`) in a window of its own: a tab would hide the
  Maccabi one and pause the run. So those two ids stay, and so does `site/ai-assistant.html`, a redirect at the
  guide's old address, which exports made before the move name. The sections must agree with the README's short
  *Hand it to an AI assistant* on the facts it keeps (the apps, the first message, the safeguards). These links only
  open a page in the member's browser: the extension still requests nothing but Maccabi Online, and the Privacy Policy
  says which links there are, so add to it before adding another.
- **The landing page lives in `site/`, not `public/`**: `public/` ships inside the extension verbatim, and the landing
  page is for the web only. The Pages workflow copies `site/` over `public/`, so `site/index.html` links the shipped
  `pages.css` and adds `site/ai-assistant.css` and `site/site.css`. It follows the same house rules: no script, no fetched
  font, no Maccabi brand asset, made-up records only, WCAG AA, and no sideways scroll at 375px. Its one request to
  another host is the visit counter, a cookieless GoatCounter image in the footer of `site/index.html` only, which the
  footer and the Privacy Policy both name: add nothing else that calls out, and never put it on a page in `public/`. The headless Chrome in
  `scripts/stage.mjs` resolves no host but this machine, so the checks and renders are never counted as visits. Its run clip is a
  slice of the promo film that the workflow renders and crops (see the workflow's header), so a change to the film's
  timing or layout has to be matched in the `clip` line there. The opened folder beside it is drawn in HTML
  (`.fw-list`), from the film's `FOLDERS` in `store/src/parts.ts` (`repoRules.test.ts` holds the two lists in step), and its open
  `test-results/` (a result's `details/` JSON beside its `files/` PDF of the same name, the film's earlier drill) in step
  with the export. Its copy follows `docs/positioning.md`, and must agree
  with the README's opening and its *Hand it to an AI assistant* on the facts they share.
- **The landing page's motion is CSS, and it ends where the still page is**: the rules (scroll timelines, no
  `overflow: hidden` around them, reduced motion) are in `site/CLAUDE.md`; `npm run site-check` is the gate.
- **Keep `public/third-party-notices.txt` current** when a runtime dependency changes (only `fflate`
  today, plus Vite's module preload polyfill; `repoRules.test.ts` checks each one's name and version). The README's `docs/images/chrome-web-store-badge.png` isn't one of
  them: it is Google's own badge, committed byte for byte as it is served from
  [their branding page](https://developer.chrome.com/docs/webstore/branding), and their terms allow resizing
  it and nothing else. It has to keep linking to the listing. It is the bordered version, whose fill is opaque
  white, because the borderless one is transparent and would be dark text on dark in GitHub's dark theme.
- **Re-run the store renders** when the listing images, the popup or the video's copy go stale (how and what to
  check: the `store-media` skill); a re-rendered video is re-uploaded to YouTube with its poster.
- Builds are deliberately **not minified** so reviewers and users can read what ships.
