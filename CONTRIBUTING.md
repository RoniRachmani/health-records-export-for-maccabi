# Contributing

How the extension is built, run, tested and released. The [README](README.md) is for people who use it; `CLAUDE.md`
is the short version of this page for an AI coding assistant.

[Setup](#setup) · [How a run works](#how-a-run-works) · [The look](#the-look) ·
[Driving a run from the console](#driving-a-run-from-the-console) ·
[A live run from the terminal](#a-live-run-from-the-terminal) ·
[An export from the terminal](#an-export-from-the-terminal-without-the-extension) ·
[The endpoint scan](tools/endpoint-scan/README.md) · [Releasing](#releasing) · [Ground rules](#ground-rules)

## Setup

You need Node.js 22 or newer and Chrome.

```sh
npm install
npm test               # unit tests (synthetic data only)
npm run typecheck
npm run dev            # development build in dist-dev/, rebuilt on change
npm run build          # store build in dist/
```

Load `dist-dev/` (or `dist/`) unpacked at `chrome://extensions`. The development build shows up as
"Health Records Export for Maccabi (dev)". There is no linter or formatter: `typecheck` and `test` are the gate, and
CI runs both.

## How a run works

The README's [How it works](README.md#how-it-works) has the diagram of the parts and the table of where each lives.

The service worker walks a fixed plan (`PLAN` in `src/extension/shared/state.ts`): one crossing to the old site to
order the medical file and collect purchases, hospital stays and uploads (with the member's details and prescriptions,
which the REST API answers from any page), back to `/sonline/` for the other REST API sections, and the medical file collected last, by which time Maccabi Healthcare Services has had the whole run to build it. Each finished step is
checkpointed in `chrome.storage.local`, so a paused run, or a restarted service worker, continues from there. The
medical file is ordered at most once per run: once the order has gone out, a resume or a reconnect that comes back
through that step skips it, even when Maccabi Healthcare Services' answer was lost, and only a plain refusal is tried again.

A step that continues is run again from its start, so every step is safe to repeat: JSON is rewritten only when
its content changed, and a document already staged is not asked for again. Staging also keeps a SHA-256 index of the
documents it holds: `Collector.pdfOnce` saves a form, an upload or a linked visit's summary only when no staged file
has its bytes, and otherwise records it as a copy of that file, so a repeat makes no request for it either. Each staged
file also keeps the step, and the part of it, that first wrote it: the popup counts the files each finished section
collected from those, so a resumed run's sections still show what they hold. A run
paused before an update that renames files (`FILE_LAYOUT`) can't be continued, only discarded, or it would stage the
same records twice under two names.

A request that fails inside a step is filed as a problem under that step (and cleared when the step runs again), with
the member id written as `{mid}`. Every section writes its folder whenever the site answers, and files a problem when
it doesn't, so when the ZIP is written the problems become `export-errors.json`, each put against the folder it is
about (`STEP_FOLDERS` in `src/extension/shared/readme.ts`), and the export's `README.md` says of each missing folder
whether it failed or had nothing on record. A test walks every record a fake run writes and checks that each file it
names (`file`, `same_as`, `visit`, `linked_from`) is in the export, with and without failures, and across a resume.

The tab visits a single legacy page, `/online/medicalfile/summary/`. The legacy services answer only after some
`/online/` page has been loaded in the session, and the medical file order has to be sent from that one, so the four
steps that need the old site share it. The run returns to `/sonline/` before waiting for the medical file: the site
renews the session token only there, and the wait is the longest part of the run.

REST API requests (`/sonline/`) go from the service worker, with the session token read from the tab. Legacy requests
(`/online/`) and the medical file order go from inside the Maccabi Online tab, where the site requires them to originate.
Like the service worker's own requests, a download from the tab gives up only after 60 s with nothing arriving, so a large
upload on a slow line still finishes; a file over 32 MB, more than the tab can hand back, is filed as a problem instead.

## The look

The popup and the pages that ship with it share one design system: navy headings over white, one bright blue
for actions and progress, magenta for links, pale-blue cards at a 20px radius, pill buttons, and a soft
navy-tinted shadow. The register is meant to feel at home next to Maccabi Online rather than foreign to it, while
staying plainly the extension's own — there is no Maccabi Healthcare Services logo or wordmark anywhere, and the header says
*Unofficial* on every screen, in a chip beside the name whose tooltip, and what a screen reader reads, is the whole
disclaimer: "Not affiliated with Maccabi Healthcare Services".

The stylesheets ask for Roboto first and fall back to the system face. That is a local lookup only: the extension
ships no fonts and downloads none.

The tokens live at the top of `src/extension/popup/popup.css`, with `public/pages.css` repeating the ones the privacy
and terms pages need (`public/` is copied verbatim, so it cannot import them). `.github/workflows/pages.yml` publishes `public/` on GitHub
Pages whenever it changes on `main`, so the policies can be read before installing. The same
workflow puts the landing page, `site/`, at the site's root: it is for the web only, so it is kept out of `public/`.
It adds `site/ai-assistant.css` and `site/site.css` for its wider, picture-led layout: its pictures are HTML and inline
SVG with made-up records, and it runs no script (the tabs of its Ask section are radio buttons). Its footer loads one image from
GoatCounter, a cookieless visit counter and the page's only request to another host; the footer and the Privacy Policy
say so. Its last sections are
the guide to opening an export in an AI assistant, which the popup and every export's README link to; the guide's old
address, `ai-assistant.html`, is a redirect there. `popup.css` and `pages.css` both pin `color-scheme: light` —
there is no dark theme, and pinning it keeps Chrome's auto-dark-mode from repainting controls and scrollbars
against a light page. Every text colour meets WCAG AA on the surface it sits on. Chrome caps a popup at 600px
tall, so keep the states that are not disclosures under it; `npm run store-assets` re-renders the store images.

## Driving a run from the console

The development build adds a bridge content script, so you can run and inspect an export from the Maccabi Healthcare Services page's
DevTools console:

```js
const dev = (msg) => new Promise((ok) => { const id = Math.random(); addEventListener('message', function f(e) { if (e.data?.__hremDev === 'res' && e.data.id === id) { removeEventListener('message', f); ok(e.data.res); } }); postMessage({ __hremDev: 'req', id, msg }, '*'); });

await dev({ type: 'dev:state' });
await dev({ type: 'dev:skipOrder', on: true });                  // test a full run without ordering
```

| Command | Does |
|---|---|
| `dev:state` | Run state, staged files per folder, token status |
| `dev:start`, `dev:resume`, `dev:cancel`, `dev:dismiss`, `dev:retrySave` | What the popup's buttons do |
| `dev:problems` | Items that failed so far |
| `dev:rootFiles` | Write the ZIP's root files as `save` does, without the ZIP, and reply with the README's version line, its failed-to-collect section and `export-errors.json` |
| `dev:titleFields` | Which response fields hold a display string, and in which language. Field names only. |
| `dev:names` | Every staged file's path, sorted, to check how files are named |
| `dev:stopBefore` `{step}` | Pause before a plan step. Without `step`, clears it. |
| `dev:skipOrder` `{on}` | `orderMedicalFile` does nothing while on, and `waitMedicalFile` keeps the file Maccabi already has. Stays set until turned off. |
| `dev:reorder` `{on}` | `orderMedicalFile` orders even when a file from today over the same range is already ready (normally it uses that one), so a real order can be timed again the same day. Stays set until turned off. |
| `dev:breakSession` | Invalidate the stored token, to test reconnecting |
| `dev:rawDump` `{on}` | Stage every response of the next run under `_raw/` in the ZIP, byte for byte, beside the export. Set it before `dev:start`. |
| `dev:routes` `{routes}` | Choose whether `/sonline/` and `/online/` requests go from the extension or the tab |
| `dev:spike` `{url, method, route, auth}` | Send one request and report its status and shape |
| `dev:reload` | Reload the extension |

Replies carry statuses, sizes and counts, never record contents; file paths (`dev:names`, and the problems' places)
carry records' titles. None of this is in the store build.

## A live run from the terminal

`npm run live` builds the development build and runs an export against your own account: it opens a browser
(Chrome, Chromium or Edge; `CHROME_PATH` picks one) with `dist-dev/` loaded, signs in if the session has ended,
and drives the run through the commands above, printing the step, file count and problems as it goes. It always
turns on `dev:skipOrder` first, and will not start unless the extension confirms it, so a test never orders the
medical file or makes Maccabi send an SMS; the script itself never orders, with or without `--export` below. It stops before `save`, prints the
files collected per folder and the time and requests of each step and part (the run's `timings`, which
`docs/sections.md` tabulates), and discards the run, so nothing is downloaded. `npm run live -- --export` starts
nothing: it turns both test switches off and waits for you to press Start in the popup, then follows that export,
which is a real one (it orders the medical file, so Maccabi sends an SMS, and downloads the ZIP), and prints its
timings with what the order did (placed, or skipped because today's file was already ready), the time from the
order to the file being ready, and the ZIP's size. With `--reorder` beside it, that
export orders even when today's file is already ready, to time a real order again the same day (`dev:reorder`, turned
off again at the end). `npm run live -- --keep` leaves the
browser and the paused run in place, to look at them. `npm run live -- --root-files` also writes the ZIP's root
files before discarding the run (`dev:rootFiles`), and prints the README's version line, what it says failed, and
`export-errors.json` beside the popup's problem count. `npm run live -- --names` prints every staged file's path
(`dev:names`), to check how files are named. `npm run live -- --screenshots` photographs the popup
before the start and at every step, into `.cache/live-screenshots/` (gitignored, since the problems it lists come
from your records): it opens the toolbar popup itself, photographs it and closes it, so leave the browser window
in front while it runs.

The username and password come from 1Password through its CLI (`brew install 1password-cli`, then
*Settings > Developer > Integrate with 1Password CLI* in the app), and only when the page asks for them. Put
their secret references in `.env` (gitignored), so the file says where the credentials are and never holds them:

```sh
MACCABI_USERNAME=op://<vault>/<item>/username
MACCABI_PASSWORD=op://<vault>/<item>/password
```

(`op item get <item> --format json` lists each field's `reference`; IDs in place of names survive a rename).
Without them, the item named by `MACCABI_OP_ITEM` (default `Maccabi`) is used. The script walks Maccabi's three sign-in pages itself:
the ID number, then *sign in with password* (never the SMS or voice-call code), then the password. They are filled once and never re-submitted, since a
script retrying a wrong password is how an account gets locked. The browser profile lives outside the repo
(`~/.hrem-live-profile`, or `LIVE_PROFILE`) and is kept between runs, so a session that is still alive is
reused: every new sign-in ends your other sessions. Branded Chrome ignores `--load-extension`; there, load
`dist-dev/` by hand once in that profile, and the script says so when it finds no extension answering.

## An export from the terminal, without the extension

`npm run export` makes an export with no extension installed: it opens the same browser and signs in the same way as
`npm run live` (the profile, `.env` and 1Password references above), then runs the collector in Node — `src/core/`
bundled for it into `dist-cli/` — with the requests sent from inside the Maccabi Online page, as the extension sends
them from the tab (by the same functions: the script evaluates the source of `fetchInPage` and the others in `tab.ts`),
and writes the folder the ZIP would hold into `./maccabi-export-<today>/`, root files included: the `README.md`,
`CLAUDE.md`, `AGENTS.md` and `export-errors.json` of a popup export. A run of only some sections says so in its
`README.md`: the sections it left out were not collected, which is not the site having nothing on record for them.

```sh
npm run export                          # test results and lab histories: about a minute, and nothing on the account changes
npm run export -- --all                 # every section the extension collects
npm run export -- --steps visits,referrals   # just those (the names in STEPS, src/core/steps.ts), in the run's order
npm run export -- --out ~/health        # the folder goes under that directory; --keep leaves the browser open
```

It never orders the medical file — the one request that changes anything, and what makes Maccabi send an SMS — so
`--all` takes the medical file already on the site, if there is one. A step that reads from another brings it along
(`STEP_NEEDS`: the vaccination details need the birth date in the member record). A rerun into the same folder
rewrites only the JSON that changed and asks for no document it already has, which is what Resume does for a popup
run; the documents it found to be copies of another are remembered in `.export-state.json`, the one file in the
folder that is the script's and not the export's. A run that is stopped (an ended session, a 429, a page that will not
open) keeps what it collected and still writes the root files, with the stop filed against the step it happened in.
Like the popup, it ends the member's other Maccabi sessions when it has to sign in, and a wrong password is never
resubmitted. It is a tool for working on the collector, and for an export without the popup; the popup remains the
way to export for everyone else. `scripts/headless-lib.mjs` holds the two seams it puts under the collector, the page
as `Transport` and a folder as `Sink`, and `test/headless.test.ts` runs the test-results step through them against
the fake site.

## Finding what the export could add

`npm run endpoints` lists what Maccabi Online's own front-end code can call that `docs/endpoints/endpoints.json` does
not map, and which mapped requests the code has dropped. It reads static script files only and calls no API.
[tools/endpoint-scan/README.md](tools/endpoint-scan/README.md) says how it reads the code and what each option does.

## Releasing

```sh
npm run release        # all of it from clean: tests, dist-dev/, the release ZIP, the store images and the video
npm run release:zip    # the same without the store images and the video
npm run clean          # remove dist/, dist-dev/, dist-store/, dist-cli/ and release/
npm run package        # release/health-records-export-for-maccabi-<version>.zip for the Chrome Web Store and GitHub release
npm run store-assets   # store/assets/ screenshots, promo tiles, the video's poster and the web page's link preview (needs Chrome, Chromium or Edge; set CHROME_PATH if not found)
npm run store-video    # store/assets/promo-video.mp4, the promo video (same browser; ffmpeg if you have it)
npm run icons          # public/icons/ and store/assets/icon-128.png
```

`package` builds `dist/` first, and refuses a development build. The store images and the video show the real
popup with made-up states, and they need Roboto on the machine that draws them. Without it, run the *Store images*
workflow from the Actions tab (or `gh workflow run store-assets.yml`, with `-f shots="start open"` for only some): it
renders them on Linux with Roboto and commits the ones that changed. [docs/store-listing.md](docs/store-listing.md)
has everything to fill in on the store dashboard.

The video is drawn frame by frame in the same headless browser (`store/src/video.ts`), so nothing depends on the
speed of the machine rendering it: the export it plays is the real popup, driven through a whole run by states
built from the real plan and its weights. It comes out in 4K at 60 fps — the 1920×1080 stage drawn at twice its
size — and each frame is piped straight into the encoder: `ffmpeg` when that is on `PATH`, and otherwise, on
macOS, `scripts/encode-mp4.swift`, compiled on the spot. A full render takes about 20 minutes; give two times in
seconds to render one part of it while working on it, e.g. `npm run store-video -- 8 12`.

Its soundtrack is scored from the same timeline by `scripts/soundtrack.mjs`: music and effects synthesized there,
from oscillators and noise, and narration spoken by ElevenLabs (`scripts/narration.mjs`). The voice comes from one
take of the whole script, made in ElevenLabs with the text `--script` prints and brought in with
`--import <take>`, which cuts it into lines at the pauses; or, with `ELEVENLABS_API_KEY` in the environment or a
gitignored `.env`, line by line over the API. `ELEVENLABS_MODEL` picks the model (Eleven v4, `eleven_v4`, unless
set; set it for `--script` and `--import` too). Spoken lines are cached in `.cache/narration/` by voice, model and
words, so only a changed line costs anything. `--audio-only` writes the soundtrack alone, to listen to; `--remux` puts a changed soundtrack
on the last render's picture in seconds, without drawing it again; `--no-narration` leaves the voice out, and
`--silent` the sound. The MP4 is not committed — the store's video
field takes a YouTube link, so upload it there and paste the link on the dashboard. The README's poster is one frame of the same
film, drawn by the same page: `npm run store-assets -- poster`.

## Ground rules

- **Never commit real data.** No responses, exports, PDFs or anything else taken from a real account. Test fixtures are
  synthetic.
- **List every request in [docs/endpoints/endpoints.json](docs/endpoints/endpoints.json).** The privacy policy and the store review rely on
  it being complete.
- **Keep the policies in sync.** `docs/privacy.md` goes with `public/privacy.html`, and `docs/terms.md` with
  `public/terms.html`. Change the effective date when you change either. For a material change, also set
  `TERMS_EFFECTIVE` in `src/extension/shared/state.ts` to the new date, so the popup asks users to accept again.
  The landing page's guide to opening an export (`site/index.html`, from `#where`), which the popup's "How to ask an
  AI" opens, must agree with the README's *Hand it to an AI assistant* on the facts that section keeps: the apps, the first
  message and the safeguards. The Privacy Policy lists the links the extension opens: add to it before adding another.
- **Keep [public/third-party-notices.txt](public/third-party-notices.txt) current.** It carries the licenses of
  third-party code bundled into the package (fflate, and Vite's module preload polyfill). Update it when a runtime
  dependency is added or upgraded.
- **Regenerate the store images** with `npm run store-assets` when the popup changes.
