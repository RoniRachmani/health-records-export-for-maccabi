# Health Records Export for Maccabi

A Chrome extension that saves a copy of your [Maccabi Online](https://online.maccabi4u.co.il) medical records
to your computer as one ZIP file: every PDF the site offers, plus the site's own data as JSON.

> [!NOTE]
> Unofficial. Not affiliated with, endorsed by or sponsored by Maccabi Healthcare Services.

<p align="center">
  <img src="store/screenshot-1-start.png" alt="The extension's popup on Maccabi Online, ready to start an export" width="720">
</p>

- **Thorough.** Test results, visit summaries, prescriptions and purchases, referrals, vaccinations, letters, doctor
  inquiries and saved documents, plus a freshly ordered copy of your full medical file. Some things
  [aren't included](#not-included).
- **Private.** Talks only to `online.maccabi4u.co.il`. No servers, no analytics, no remote code. Never sees your password.
- **Raw.** One JSON file per record, exactly as the site sent it, named so you can read it: `<date>_<id>_<title>`,
  with a `README.md` in the ZIP explaining the lot.
- **Resumable.** If your session ends partway through, log in again and press **Resume**. Files collected so far are kept.

[Install](#install) · [Export your records](#export-your-records) · [What's in the ZIP](#whats-in-the-zip) ·
[Privacy and safety](#privacy-and-safety) · [Development](#development)

## Install

You need Chrome 116 or newer.

1. Download `health-records-export-for-maccabi-<version>.zip` from the
   [latest release](https://github.com/RoniRachmani/health-records-export-for-maccabi/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder, the one with `manifest.json` in it. Keep the folder: Chrome
   loads the extension from it.

The build isn't minified, so you can read exactly the code that runs.

### Build from source

You need Node.js 22 or newer.

```sh
git clone https://github.com/RoniRachmani/health-records-export-for-maccabi.git
cd health-records-export-for-maccabi
npm install
npm run build
```

Then load the `dist/` folder the same way.

## Export your records

1. Log in to Maccabi Online as usual.
2. On that tab, click the extension's icon and press **Start export**. The first time, read the notice and press
   **Agree and continue**. Nothing is read from the tab until you do.
3. Leave the tab open and in front. It starts on the old site's medical-file page, to order your file and collect the
   parts that live there, then returns to the new site for the rest. The toolbar badge shows progress.
4. After 5 to 20 minutes, `maccabi-export-YYYY-MM-DD.zip` is in your Downloads folder and Chrome notifies you.

### Before you start

- **Maccabi will text you, right at the start.** Each export orders a fresh copy of your full medical file, first
  thing, so Maccabi can build it while everything else is collected. It sends the site's own order request, but asks
  for your whole history, which is wider than the range the site's form offers. Maccabi sends an SMS, and the new file
  replaces the previous one on the site. A copy ordered earlier the same day over the same range is used as it is.
  This is the only change the extension makes to your account, and it happens even if the export later fails.
- **Keep the Maccabi tab in front.** Chrome pauses hidden tabs, which can end your session. If you switch away, the
  export waits until you come back.
- **Your session is kept awake.** Maccabi logs you out after six minutes without a click or a keypress on the page, and
  an export asks nothing of you for far longer than that, so while it runs the extension signals activity in that tab
  every few minutes. It stops as soon as the export does.

### If something goes wrong

| The popup says | What to do |
|---|---|
| **Export paused** | Your session ended. Log in to Maccabi Online again, click the icon on that tab and press **Resume**. (The extension first tries to reconnect by itself.) Also shown after Chrome restarts mid-export. |
| **Waiting for the Maccabi tab** | Bring the tab back to the front. The export continues on its own. |
| **Export stopped** | Press **Try again** on the Maccabi tab. It continues from the step that failed. |
| **The ZIP was not saved** | Press **Save again**. |

Resume refuses to continue if a different member is logged in. **Stop** ends the export and deletes the files collected
so far.

A single item that fails doesn't stop the export. It's listed in the popup when the export finishes, and stays
there until the next export starts.

## What's in the ZIP

One folder, `maccabi-export-YYYY-MM-DD/`:

| Folder | Contents |
|---|---|
| `profile/` | Member details, entitlements, insurance seniority, your doctors' provider details |
| `my-doctor/` | Assigned doctors and eligibilities |
| `test-results/` | Test list, each result, a history per lab measurement, latest lab results, result PDFs |
| `visit-summaries/` | Visits of the last 12 months and their summary PDFs |
| `medications-and-prescriptions/` | Prescriptions and their PDFs, full purchase history, purchase report PDF |
| `referrals/` | Referrals and their PDFs |
| `approvals/` | Approvals and their PDFs |
| `info-pages/` | Information pages from your visits, and their PDFs |
| `vaccinations/` | Vaccinations by group, flu vaccine eligibility, vaccination booklet PDF |
| `letters/` | Letters and their PDFs |
| `communication-with-doctor/` | Inquiries to doctors and attached forms |
| `uploads/` | Documents you uploaded and their files |
| `allergies-sensitivity/`, `appointments/` (future only), `requests-approvals/` | Only when the site has something in them |
| `<date>_medical-file.pdf` | Your full medical file, freshly ordered: one document covering your whole history, and the place to start |
| `README.md` | The export's own data dictionary: what each folder holds, how a record is shaped, which fields carry no meaning, and what the export does **not** contain |

Every section keeps its list in `list.json`, one JSON file per record in `details/`, and documents in `files/`.

Files are named `<date>_<id>_<title>`, so a record's JSON and its PDF share a name:

```
visit-summaries/list.json
visit-summaries/details/2026-02-01_A1_קרדיולוגיה.json
visit-summaries/files/2026-02-01_A1_קרדיולוגיה.pdf
```

The date and id come from the record; the title is a display string the site returned, used as it sent it and left
out when a record has none.

> Hebrew names are flagged UTF-8 in the ZIP, so Finder, Windows Explorer and 7-Zip read them correctly. macOS's
> bundled `unzip` command is Info-ZIP 6.00, which predates that flag and garbles them - use `ditto -x -k <zip> <dir>`
> there instead.

`README.md` is written for whoever reads the export next, an AI assistant included. It points at your full medical
file PDF as the one document to start from, then says what the export doesn't contain - no DICOM images, no visit
data over 12 months - so a reader doesn't take an omission for an absence in your history. It then goes folder by
folder through the fields, including the ones that mislead: a lab `result` of 0 that is really a text answer,
placeholder dates, and fields that change on every request.

Each JSON file is the site's response as sent, wrapped with where it came from. Your member ID is never written into
file paths or `endpoint` values:

```json
{
  "endpoint": "GET MainAppAPI/v1/members/0/{mid}",
  "fetched_at": "2026-09-17T08:12:03.512Z",
  "status": 200,
  "data": { "...": "the response, unchanged" }
}
```

Two exceptions: `medications-and-prescriptions/purchased-history.html` is the site's purchase table as sent
(windows-1255; the site has no JSON version of it), and the two report files leave out the base64 PDF, which is saved
in `files/` instead - those say so in their own `omitted` field.

[docs/endpoints.json](docs/endpoints.json) maps every request to the file it produces.

### Not included

- **Imaging studies (DICOM).** The site only opens them in its viewer. Export them by hand from there.
- **Visits older than 12 months.** The site doesn't show them.
- **Older purchase reports.** The purchase report PDF covers the last 2 years. The purchase history covers everything.

## Privacy and safety

- The extension communicates only with `online.maccabi4u.co.il`. It has no servers, analytics or tracking, and no
  remote code.
- It never sees, stores or enters your password or one-time codes. It uses the session you're already logged in with.
  The session token is kept in Chrome's in-memory session storage and never written to disk.
- Collected files are staged in the extension's IndexedDB and deleted as soon as the ZIP is saved, or when you stop
  the export.
- Apart from the medical file order, it only reads. Requests go one at a time, 300 ms apart -- a few hundred over an
  export, more for a long history -- and all of them are listed in [docs/endpoints.json](docs/endpoints.json). It never
  calls anything that changes or deletes data, marks items as read, returns session credentials, or touches payment
  details.
- If Maccabi answers 429, the extension waits exactly as long as the response asks and stops the export rather than
  keep knocking. Files collected so far are kept, so you can try again later.

> [!WARNING]
> The ZIP isn't encrypted. Anyone who can open it can read your health information. Keep it somewhere safe, and take
> care when you share it.

Read the full [Privacy Policy](docs/privacy.md) and [Terms of Use](docs/terms.md).

### Permissions

| Permission | Used to |
|---|---|
| `online.maccabi4u.co.il` | Read your records from the site you're logged in to. No other sites. |
| `scripting` | Read the login session from the Maccabi tab, and send the requests the site accepts only from its own pages |
| `downloads` | Save the ZIP |
| `storage`, `unlimitedStorage` | Keep export progress, and collected files until the ZIP is saved (PDFs can be large) |
| `offscreen` | Build the ZIP, and parse two HTML tables the site returns |
| `alarms` | Continue a long export if Chrome suspends the extension's background worker |
| `notifications` | Tell you when the export is ready or needs you |

## Development

You need Node.js 22 or newer and Chrome.

```sh
npm install
npm test               # unit tests (synthetic data only)
npm run typecheck
npm run dev            # development build in dist-dev/, rebuilt on change
npm run build          # store build in dist/
```

Load `dist-dev/` at `chrome://extensions` the same way as `dist/`. It shows up as
"Health Records Export for Maccabi (dev)".

### How it works

```mermaid
flowchart LR
  popup[Popup] -- messages --> sw[Service worker]
  sw -- "/sonline/ REST API and PDFs" --> site[(Maccabi Online)]
  sw -- chrome.scripting --> tab[Maccabi tab]
  tab -- "/online/ legacy pages, medical file order" --> site
  sw -- staged files --> idb[(IndexedDB)]
  sw -- "parse HTML, build ZIP" --> off[Offscreen document]
  off -- reads staged files --> idb
  sw -- chrome.downloads --> zip[ZIP in Downloads]
```

The service worker walks a fixed plan (`PLAN` in `src/extension/shared/state.ts`): one crossing to the old site to
order the medical file and collect purchases and uploads, back to `/sonline/` for the REST API sections, and the
medical file collected last, by which time Maccabi has had the whole run to build it. Each finished step is
checkpointed in `chrome.storage.local`, so a paused run, or a restarted service worker, continues from there.

The tab visits a single legacy page, `/online/medicalfile/summary/`. The legacy services answer only after some
`/online/` page has been loaded in the session, and the medical file order has to be sent from that one, so the three
steps that need the old site share it. The run returns to `/sonline/` before waiting for the medical file: the site
renews the session token only there, and the wait is the longest part of the run.

REST API requests (`/sonline/`) go from the service worker, with the session token read from the tab. Legacy requests
(`/online/`) and the medical file order go from inside the Maccabi tab, where the site requires them to originate.

| Path | Contents |
|---|---|
| `src/core/` | The collection logic, one file per part of the site in `sections/`. Uses no extension APIs: it reaches the site through a `Transport`, writes through a `Sink` and parses HTML through an `HtmlParser` (see `types.ts`). |
| `src/extension/background/` | The service worker: the run loop with pause and resume (`runner.ts`), the Maccabi tab (`tab.ts`), badge and notifications (`ui.ts`) |
| `src/extension/offscreen/` | HTML parsing and ZIP building, which the service worker can't do |
| `src/extension/shared/` | Run state and plan, IndexedDB staging |
| `src/extension/popup/` | The popup |
| `test/` | Vitest tests against a fake Maccabi Online (`fakes.ts`) |
| `docs/` | Endpoint map, privacy policy, terms, store listing |
| `public/` | Icons, and the privacy policy, terms and third-party notices that ship in the extension |
| `store/`, `scripts/` | Chrome Web Store images and the pages they're rendered from; build scripts |

### Driving a run from the console

The development build adds a bridge content script, so you can run and inspect an export from the Maccabi page's
DevTools console:

```js
const dev = (msg) => new Promise((ok) => { const id = Math.random(); addEventListener('message', function f(e) { if (e.data?.__hremDev === 'res' && e.data.id === id) { removeEventListener('message', f); ok(e.data.res); } }); postMessage({ __hremDev: 'req', id, msg }, '*'); });

await dev({ type: 'dev:state' });
await dev({ type: 'dev:stopBefore', step: 'orderMedicalFile' });   // test a full run without ordering
```

| Command | Does |
|---|---|
| `dev:state` | Run state, staged files per folder, token status |
| `dev:start`, `dev:resume`, `dev:cancel`, `dev:dismiss`, `dev:retrySave` | What the popup's buttons do |
| `dev:problems` | Items that failed so far |
| `dev:titleFields` | Which response fields hold a display string, and in which language. Field names only. |
| `dev:stopBefore` `{step}` | Pause before a plan step. Without `step`, clears it. |
| `dev:breakSession` | Invalidate the stored token, to test reconnecting |
| `dev:routes` `{routes}` | Choose whether `/sonline/` and `/online/` requests go from the extension or the tab |
| `dev:spike` `{url, method, route, auth}` | Send one request and report its status and shape |
| `dev:reload` | Reload the extension |

Replies carry statuses, sizes and counts, never record contents. None of this is in the store build.

### Releasing

```sh
npm run package        # release/health-records-export-for-maccabi-<version>.zip for the Chrome Web Store and GitHub release
npm run store-assets   # store/ screenshots and promo tile (needs Chrome, Chromium or Edge; set CHROME_PATH if not found)
npm run icons          # public/icons/ and store/icon-128.png
```

`package` builds `dist/` first, and refuses a development build. The store images show the real popup with made-up
states. [docs/store-listing.md](docs/store-listing.md) has everything to fill in on the store dashboard.

### Ground rules

- **Never commit real data.** No responses, exports, PDFs or anything else taken from a real account. Test fixtures are
  synthetic.
- **List every request in [docs/endpoints.json](docs/endpoints.json).** The privacy policy and the store review rely on
  it being complete.
- **Keep the policies in sync.** `docs/privacy.md` goes with `public/privacy.html`, and `docs/terms.md` with
  `public/terms.html`. Change the effective date when you change either. For a material change, also set
  `TERMS_EFFECTIVE` in `src/extension/shared/state.ts` to the new date, so the popup asks users to accept again.
- **Keep [public/third-party-notices.txt](public/third-party-notices.txt) current.** It carries the licenses of
  third-party code bundled into the package (fflate, and Vite's module preload polyfill). Update it when a runtime
  dependency is added or upgraded.
- **Regenerate the store images** with `npm run store-assets` when the popup changes.

## Issues

Report bugs in [GitHub Issues](https://github.com/RoniRachmani/health-records-export-for-maccabi/issues). Issues are
public: never include health information, your ID number or files from an export.

## License

[MIT](LICENSE).

The extension copies what Maccabi Online provides and doesn't interpret it. It isn't medical advice or an official
copy of your records. See the [Terms of Use](docs/terms.md).
