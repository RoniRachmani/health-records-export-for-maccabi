# Contributing

How the extension is built, run, tested and released. The [README](README.md) is for people who use it; `CLAUDE.md`
is the short version of this page for an AI coding assistant. [docs/](docs/README.md) says what each of the other
documents is for.

[Setup](#setup) · [How a run works](#how-a-run-works) · [The look](#the-look) ·
[Driving a run from the console](#driving-a-run-from-the-console) ·
[A live run from the terminal](#a-live-run-from-the-terminal) ·
[An export from the terminal](#an-export-from-the-terminal-without-the-extension) ·
[Finding what the export could add](#finding-what-the-export-could-add) · [Releasing](#releasing) ·
[Ground rules](#ground-rules)

## Pull requests

Branch from `main` and open a pull request for changes. The `check` CI job must pass against the latest
`main` before merging. No second-person approval is required. Resolve review conversations before merging.
Never include real medical records, account details, tokens, exports or HAR files in a pull request.

## Setup

You need Node.js 22 or newer and Chrome.

```sh
npm install
npm test               # unit tests (synthetic data only)
npm run coverage       # the same, with a coverage report (text, and coverage/index.html), held to its floors as CI is
npm run typecheck      # the extension and tests, the scripts (JSDoc) and store/
npm run dev            # development build in dist-dev/, rebuilt on change
npm run build          # store build in dist/
```

Load `dist-dev/` (or `dist/`) unpacked at `chrome://extensions`. The development build shows up as
"Maccabi Health Records Takeout - Ready for AI (dev)". There is no linter or formatter. The gate is `typecheck` and
`coverage` (the tests, held to the floors in `vitest.config.ts`): CI runs both and `build`, then
`npm run site-check -- popup`, which measures every popup state against Chrome's 600px. Run `typecheck` and `test` (or
`coverage`) before every push.

`test/runner.test.ts` drives the run loop with `chrome.*` faked: a whole run, reconnecting, a rewind that does not
order again, rate limits, Cancel, a worker restart at a checkpoint or while the medical file is being ordered, Save
again, a run found `saving` after a restart (`settleSave`), and a hidden tab's pause (and Cancel during it). Some of
it is not covered there: the heartbeat's `recover` of a running run, and the real Chrome parts the test fakes (the
tab's navigation and `executeScript`, the offscreen ZIP, the download). A change to any of these, or to `runner.ts`,
needs a run of the development build as well (`npm run live`, and a pause and Resume from the console), and a test here when
one can be written.

## How a run works

The README's [How it works](README.md#how-it-works) has the diagram of the parts and the table of where each lives.

The service worker walks a fixed plan (`PLAN` in `src/extension/shared/state.ts`): one crossing to the old site to
order the medical file and collect purchases, hospital stays and uploads (with the member's details and prescriptions,
which the REST API answers from any page), back to `/sonline/` for the other REST API sections, and the medical file collected last, by which time Maccabi Healthcare Services has had the whole run to build it. Each finished step is
checkpointed in `chrome.storage.local`, so a paused run, or a restarted service worker, continues from there. The
medical file is ordered at most once per run: once the order has gone out, a resume or a reconnect that comes back
through that step skips it, even when Maccabi Healthcare Services' answer was lost or was a refusal (`Success 3`, where the site's own button says to try again later): on 2026-10-15 a refused order was followed by its SMS 21 minutes later, so Maccabi may still carry one out, and asking again could text the member twice. So the order is not left for the step's checkpoint: the run is saved as the request goes out, and again with the answer, and a service worker killed in between comes back knowing it ordered. When no new file was ordered, the run keeps the file Maccabi already lists and files a problem that names it, so an earlier file is never taken for today's. After a refusal it tells the member to export again once the SMS comes, that day: that export takes the ready file without ordering.

A step that continues is run again from its start, so every step is safe to repeat: JSON is rewritten only when
its content changed, and a document already staged is not asked for again. Staging also keeps a SHA-256 index of the
documents it holds: `Collector.pdfOnce` saves a form, an upload or a linked visit's summary only when no staged file
has its bytes, and otherwise records it as a copy of that file, so a repeat makes no request for it either. `test/sinkContract.test.ts` runs these write rules against the staging itself, on `fake-indexeddb`, beside the
tests' in-memory sink and the terminal export's folder, so the three cannot drift apart. Each staged
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
tall, so keep the states that are not disclosures under it; `npm run site-check -- popup` checks.

The store images use the same palette and typography; their layout and design rules are in
[the artwork guide](store/README.md).

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
`docs/sections.md` tabulates), and discards the run, so nothing is downloaded.

| `npm run live -- …` | Does |
|---|---|
| `--export` | Starts nothing: turns both test switches off, waits for you to press Start in the popup, then follows that export. It is a real one: it orders the medical file, so Maccabi sends an SMS, and downloads the ZIP. Prints its timings, what the order did (placed, or skipped because today's file was already ready), the time from the order to the file being ready, and the ZIP's size. |
| `--export --reorder` | The same, ordering even when today's file is already ready, to time a real order again the same day (`dev:reorder`, turned off again at the end). |
| `--keep` | Leaves the browser and the paused run in place, to look at them. |
| `--root-files` | Also writes the ZIP's root files before discarding the run (`dev:rootFiles`), and prints the README's version line, what it says failed, and `export-errors.json` beside the popup's problem count. |
| `--names` | Prints every staged file's path (`dev:names`), to check how files are named. |
| `--screenshots` | Photographs the popup before the start and at every step, into `.cache/live-screenshots/` (gitignored, since the problems it lists come from your records). It opens the toolbar popup itself, so leave the browser window in front while it runs. |

The username and password come from 1Password through its CLI (`brew install 1password-cli`, then
*Settings > Developer > Integrate with 1Password CLI* in the app), and only when the page asks for them. Put
their secret references in `.env` (gitignored), so the file says where the credentials are and never holds them:

```sh
MACCABI_USERNAME=op://<vault>/<item>/username
MACCABI_PASSWORD=op://<vault>/<item>/password
```

(`op item get <item> --format json` lists each field's `reference`; IDs in place of names survive a rename).
The maintainer's references, and the ElevenLabs key's, are kept in `.env.tpl`, and `npm run env` writes `.env`
from it with the values themselves (`op inject`), since `store-video` reads `.env` as it is and resolves no
reference. Keep every key the scripts read in 1Password and its reference there, so `.env` can always be rebuilt.
Without them, the item named by `MACCABI_OP_ITEM` (default `Maccabi`) is used. The script walks Maccabi's three sign-in pages itself:
the ID number, then *sign in with password* (never the SMS or voice-call code), then the password. They are filled once and never re-submitted, since a
script retrying a wrong password is how an account gets locked. The browser profile lives outside the repo
(`~/.hrem-live-profile`, or `LIVE_PROFILE`) and is kept between runs, so a session that is still alive is
reused: every new sign-in ends your other sessions. Branded Chrome ignores `--load-extension`; there, load
`dist-dev/` by hand once in that profile, and the script says so when it finds no extension answering.

## An export from the terminal, without the extension

The live run above, this export (with or without a browser) and the endpoint scan below are internal research tools:
see [Ground rules](#ground-rules).

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

### Without a browser at all

```sh
npm run export -- --no-browser          # sign in with the password and send every request from Node: no one has to be there
npm run export -- --no-browser --all    # the same, every section
npm run export -- --no-browser --sms    # sign in with an SMS code instead: Maccabi texts it, the script asks for it; --phone 2 picks between different numbers
```

`--no-browser` needs no Chrome and no extension: the sign-in and the requests run in Node, so an export can run on a
server, in a container, or from `cron` — the way to keep a copy of your records that refreshes itself. The sign-in is
Maccabi's own SAML handoff replayed over `fetch` with a cookie jar (`scripts/maccabi-session.mjs`): the chain that
[Oren Yomtov's maccabi-health](https://github.com/orenyomtov/maccabi-health) (MIT) first worked out and documented
in its [AUTH.md](https://github.com/orenyomtov/maccabi-health/blob/main/docs/AUTH.md), and where that project showed
that Maccabi's bot protection leaves the authenticated API alone, which is what makes this possible at all; its
[SESSION-LIFETIME.md](https://github.com/orenyomtov/maccabi-health/blob/main/docs/research/SESSION-LIFETIME.md) is
where the hour below comes from. By default the script takes the site's "sign in with password" road, recorded from
the page itself with `scripts/discover-login.mjs`, with the ID number and password exactly as the browser run reads
them (`.env` or the 1Password item): no SMS, nothing to type. `--sms` takes the SMS road maccabi-health replays
instead: only the ID number is read (`MACCABI_USERNAME`, else the item's username; a password is ignored), and the
code is asked for in the terminal, once, and never stored. [docs/sms.md](docs/sms.md) shows the texts Maccabi sends,
the code and the medical file's.

Two things Maccabi decides. Every session ends 3600 seconds after it began, whatever happens, and nothing extends it;
an export fits easily inside the hour, and needs no keep-alive of its own, since the run's requests are never further
apart than the gateway's idle window. And one wrong password, or one wrong code, ends that sign-in — the script never
resubmits either, because repeated attempts are what lock an account; it starts a fresh sign-in next time (a code that
is not six digits, or an empty password, is refused before anything is sent and leaves the sign-in open). Like the
browser run, this one ends the member's other Maccabi sessions when it signs in, and orders nothing. The legacy
`/online/` steps (`--all`) load the summary page under the navigation session the portal's bootstrap hands out, as
the tab would. The ground rules below cover this road as they do the extension, with the one exception they name:
every request it sends, the sign-in chain included, goes out one at a time, `PACE_MS` after the previous, through the
single queue in `MaccabiSession.request`; an ended session is recognised by the collector's own markers
(`signedOutUrl`), and the origins and the legacy page are `core`'s; and every request the script sends itself is listed
in [docs/endpoints/scripts-endpoints.json](docs/endpoints/scripts-endpoints.json). `test/session.test.ts` runs the
sign-in on both roads and the test-results step through the Node transport against a fake of the login origin and
the fake site, and holds the script to each of these.

## Finding what the export could add

`npm run endpoints` lists what Maccabi Online's own front-end code can call that `docs/endpoints/endpoints.json` does
not map, and which mapped requests the code has dropped. It reads static script files only and calls no API.
[tools/endpoint-scan/README.md](tools/endpoint-scan/README.md) says how it reads the code and what each option does.

## Releasing

GitHub releases are published from a draft after their ZIP has uploaded, so future releases can be immutable.
Published release tags and assets cannot be replaced; create a new version for corrections. Existing releases
are not retroactively made immutable.

```sh
npm run release        # all of it from clean: tests, dist-dev/, the release ZIP, the store images and the video
npm run release:zip    # the same without the store images and the video
npm run clean          # remove dist/, dist-dev/, dist-store/, dist-cli/, release/ and coverage/
npm run package        # release/health-records-export-for-maccabi-<version>.zip for the Chrome Web Store and GitHub release
npm run store-assets   # approved store/assets/ images at store size, upload bundle, video poster and web link previews (Chrome; CHROME_PATH)
node scripts/check-store-assets.mjs # validate eight listing PNGs, dimensions, manifest and ZIP
npm run store-video    # store/assets/promo-video.mp4, the promo video (same browser; ffmpeg if you have it)
npm run icons          # hand-tuned public/icons/; the store icon is `npm run store-assets -- icon`
```

`package` builds `dist/` first, and refuses a development build. Everything about the store images, the video
poster and the link previews (rendering them on a Mac without Roboto, the outputs, the upload bundle, the *Store
images* workflow, checking them) is in [the artwork guide](store/README.md); [docs/store-listing.md](docs/store-listing.md)
has everything to fill in on the store dashboard.

The promo video, its soundtrack and the *Before Thursday* draft film are in
[the artwork guide's *The promo video*](store/README.md#the-promo-video).

## Ground rules

- **Never commit real data.** No responses, exports, PDFs or anything else taken from a real account. Test fixtures are
  synthetic.
- **The research tools stay internal.** The no-browser SAML/SMS sign-in, the export from the terminal
  (`npm run export`), the live run (`npm run live`), the sign-in recorder (`scripts/discover-login.mjs`) and the
  endpoint scan with REA (`npm run endpoints`) are for researching the site and checking the collector on your own
  account. They never ship in the extension, the store package, a release or the website, and nothing a member reads
  (the README's parts for members, the store listing, the landing page, the popup, an export's README) offers or mentions them. A
  change for them stays out of the code that ships: `src/extension/`, and `src/core/` beyond what the extension needs
  too.
- **List every request in [docs/endpoints/](docs/endpoints/).** The collector's, whether a tab or Node sends them, in
  [endpoints.json](docs/endpoints/endpoints.json), which the privacy policy and the store review rely on being complete;
  the ones the terminal scripts send themselves (the sign-in chain, the token bootstrap, the legacy page prime) in
  [scripts-endpoints.json](docs/endpoints/scripts-endpoints.json), with what each sends and returns as names and shapes,
  never values. `test/endpoints.test.ts` checks both.
- **The rules cover the scripts too.** What holds for the extension holds for `npm run export` and `npm run live`,
  with one exception: the extension never calls anything that returns credentials, and the no-browser export must, once
  per sign-in, for the API token (the portal's own bootstrap, in `scripts-endpoints.json`). Nothing else is excepted:
  nothing ordered, nothing marked read, every request paced and one at a time, no credential or record printed.
- **Keep the policies in sync.** Edit `docs/privacy.md` and `docs/terms.md`, never their pages: `node scripts/policy-pages.mjs`
  writes `public/privacy.html` and `public/terms.html` from them, and `test/repoRules.test.ts` fails while a page differs from
  what it writes. Change the effective date when you change either. For a material change, also set
  `TERMS_EFFECTIVE` in `src/extension/shared/state.ts` to the new date, so the popup asks users to accept again.
  The landing page's guide to opening an export (`site/index.html`, from `#where`), which the popup's "Open it in an
  AI" opens, must agree with the README's *Hand it to an AI assistant* on the facts that section keeps: the apps, the first
  message and the safeguards. The Privacy Policy lists the links the extension opens: add to it before adding another.
- **Keep [public/third-party-notices.txt](public/third-party-notices.txt) current.** It carries the licenses of
  third-party code bundled into the package (fflate, and Vite's module preload polyfill). Update it when a runtime
  dependency is added or upgraded; `test/repoRules.test.ts` checks the names and versions.
- **Regenerate the store images** with `npm run store-assets` when their copy, illustrations or popup change.
  Inspect the eight canonical images and run `node scripts/check-store-assets.mjs` to validate the upload bundle.