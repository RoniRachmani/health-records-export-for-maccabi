# Chrome Web Store listing

What to enter on the Chrome Web Store developer dashboard for each tab. The text below matches version 0.4.0. When
the extension changes, update this file along with it (see [Keeping it true](#keeping-it-true)).

## Before each upload

1. Raise `version` in `package.json`. The store rejects a package whose version isn't higher than the published one.
2. `npm test` and `npm run typecheck`.
3. If the popup changed, run `npm run store-assets` and look at the images in `store/assets/` before uploading them.
   Name shots to render only some of them, e.g. `npm run store-assets -- promo marquee`. The promo video shows
   the popup too: re-render it with `npm run store-video` and re-upload it to YouTube (see [Promo video](#promo-video)).
4. `npm run package`, which builds `dist/` and writes `release/health-records-export-for-maccabi-<version>.zip`.
   Upload that file on the **Package** tab. The script refuses to package a development build.

## Store listing tab

### Product details

**Title** comes from the manifest's `name`: Health Records Export for Maccabi

**Summary** comes from the manifest's `description` in `manifest.config.ts`. It has 119 characters, and the limit is 132:

> Save your Maccabi Online medical records (tests, visits, prescriptions, letters) and their PDFs as one ZIP. Unofficial.

**Description** (plain text. The store shows line breaks but doesn't render Markdown):

```
Save a copy of your Maccabi Online medical records on your computer, as one ZIP file: every PDF the site offers, plus the site's own data as JSON. Free and open source, with no servers of its own.

Health Records Export for Maccabi collects the records that Maccabi Online shows you and saves them to your Downloads folder:

• Test results, lab histories and result PDFs
• Visit summaries from the last 12 months, with their PDFs
• Prescriptions, your full pharmacy purchase history and the purchase report
• Referrals, approvals and information pages
• Vaccinations and the vaccination booklet
• Letters
• Messages with your doctor, and the forms attached to them
• Documents you uploaded
• Your member details, entitlements and assigned doctors
• Your full medical file, freshly ordered to cover your whole history

HOW IT WORKS
1. Log in to Maccabi Online as usual.
2. On that tab, click the extension's icon and press Start export.
3. Keep the tab open and in front. After 5 to 20 minutes, the ZIP is in your Downloads folder and Chrome lets you know.

While the export runs, the tab moves to the site's medical-file page and back. The extension keeps your Maccabi session from timing out until the export finishes. If the session ends anyway, the export pauses. Log in again and press Resume. Files collected so far are kept.

BEFORE YOU START
Each export orders a fresh copy of your full medical file. It covers your whole history, which is wider than the range the site's own form offers. Maccabi texts you about the order, and the new file replaces the previous one on the site. If an export already ordered one earlier the same day, the extension uses that copy. Ordering this file is the only change the extension makes to your account.

WHAT YOU GET
The ZIP has one folder for each part of the site. Every record is saved as the site's own data (JSON), exactly as the site sent it. If a record has a PDF, the PDF has the same name: the record's date, ID and title. The full medical file is at the top level of the ZIP, and it's the best place to start. A README in the ZIP explains what each folder holds and what the export leaves out.

MADE TO HAND TO AN AI ASSISTANT
AI assistants that connect to medical records reach U.S. providers, not Maccabi. This export is how your records get to one. Unzip the ZIP and open the folder in Claude Cowork, Claude Code, ChatGPT Work or Codex. The README becomes the assistant's saved instructions, and the records become its project files. The README tells the assistant to start with the full medical file, not to mistake something missing from the export for something that never happened, to say which file each fact comes from, to say plainly when something needs a doctor soon, and to read correctly the values that mislead. Claude Code and Codex find the README without being told to. The extension itself sends your records nowhere, but whichever AI service you give them to can read them.

Not included: imaging studies (DICOM), which the site only opens in its own viewer, and visits older than 12 months, which the site doesn't show. The purchase report PDF covers the last 2 years, though the purchase history itself covers everything. If an item fails to download, the export carries on, and the popup lists the failed items when the export finishes.

PRIVATE BY DESIGN
• Connects only to online.maccabi4u.co.il. No servers, analytics, tracking or remote code.
• Reads nothing from the tab until you've read the notice and agreed.
• Uses the session you're already logged in with. It never sees your password or one-time codes.
• Deletes its own copy of your files as soon as the ZIP is saved.
• Open source, and what ships isn't minified, so you can read exactly what runs: https://github.com/RoniRachmani/health-records-export-for-maccabi

The ZIP isn't encrypted, and it contains your health information. Keep it somewhere safe.

Use the extension only with your own account, or with an account whose records you're legally entitled to access. It copies what Maccabi Online provides. It isn't medical advice, and the export isn't an official copy of your records.

Unofficial. Not affiliated with, endorsed by or sponsored by Maccabi Healthcare Services.
```

**Category:** Productivity > Tools

**Language:** English, the language of the extension's interface.

### Graphic assets

| Field | File | Shows |
|---|---|---|
| Store icon (128×128) | `store/assets/icon-128.png` | The toolbar icon: 96×96 artwork with 16 px of transparent padding |
| Screenshot 1 | `store/assets/screenshot-1-start.png` | The popup, ready to start: "Your Maccabi records in one ZIP" |
| Screenshot 2 | `store/assets/screenshot-2-progress.png` | An export in progress, with the badge on the toolbar icon |
| Screenshot 3 | `store/assets/screenshot-3-done.png` | The finished export: "One file in your Downloads folder" |
| Screenshot 4 | `store/assets/screenshot-4-contents.png` | The folders inside the ZIP |
| Screenshot 5 | `store/assets/screenshot-5-privacy.png` | "Private by design", with the popup's list of what's included |
| Small promo tile (440×280) | `store/assets/promo-small-440x280.png` | The icon's artwork on a blue background, with no text |
| Marquee promo tile (1400×560) | `store/assets/promo-marquee-1400x560.png` | The same artwork beside the name and one line of text. Optional: the store uses it only when it features the extension |
| Global promo video | https://youtu.be/IyP4kBFQHJQ | Optional. See [Promo video](#promo-video) below |

The screenshots are 1280×800 PNG files with no transparency. They show the real popup in made-up states over a
placeholder page, never a real account. The text around the popup comes from `SHOTS` in `store/src/stage.ts`.

### Promo video

The store's video field takes a **YouTube link**, not a file. The one to paste is
**https://youtu.be/IyP4kBFQHJQ**, on the [Hey Roni](https://www.youtube.com/@Hey-Roni-Dev) channel, with the title
and description [below](#on-youtube). `npm run store-video` renders the video to `store/assets/promo-video.mp4`
(3840×2160, 60 fps, 48 seconds, with narration). YouTube can't swap the file under a link, so a re-render is a
new upload with a new link: paste it on the dashboard and put it in the README, in place of the one above.

It is not committed — it is rebuilt from `store/src/video.ts`, which draws it a frame at a time in headless
Chrome. Like the screenshots, it shows the real popup fed made-up states (`store/src/mock-chrome.ts`), driven
through a whole export by run states built from the real `PLAN` and `WEIGHTS`, so the bar, the step names and the
section list move as they do in an export. Nothing in it comes from a real account: the record cards, and the
file names that stream past while the export runs, are made up, in the collector's own `<date>_<id>_<title>` form.

What it shows, in order: record cards from all over the site pulled into the extension's folder · the name and
what the extension does · the clicks that start an export, on a placeholder page, then the camera closing in on the
popup · the export running, sped up, beside the files it writes and the progress badge on the toolbar icon · the
finished ZIP, which opens into its folders, and `test-results/` opened to show a record's JSON and PDF sharing a
name · "Private by design", with records travelling from the site to a computer and nothing in between · the
closing card with the repository's address. The disclaimer is on the title and closing cards, and the popup's own
"Unofficial · Not affiliated with Maccabi" is on screen whenever the popup is.

The README shows the video as a poster that links to it: `store/assets/video-poster.png`, one frame of the same film
with a play badge over it, drawn by `npm run store-assets -- poster`. Re-render it whenever the video changes.

The soundtrack is made the same way, from the same timeline (`scripts/soundtrack.mjs`). The music and effects are
synthesized by that script, from oscillators and noise, so no music licence is involved. The narration is
`NARRATION` in `store/src/video.ts`, spoken by ElevenLabs in "Vino – Warm Leadership Narrator", a Voice Library
voice, which needs ElevenLabs' Creator plan or above to speak again. To re-record it, make one take of the text
`npm run store-video -- --script` prints (ElevenLabs' web app, or its connector for Claude; model
`eleven_multilingual_v2`), then `npm run store-video -- --import <take.mp3>`: the take is cut into lines at the
second's pause the script leaves between them. With `ELEVENLABS_API_KEY` in
`.env` the lines are asked for one by one instead. Either way they are cached in `.cache/narration/`. The render
stops before the first frame if a line would run into the next one. ElevenLabs' free plan is for non-commercial
use only and asks to be credited; a paid plan is what allows commercial use of what it speaks.

#### On YouTube

Upload it as **Unlisted** or Public (the store cannot show a private video), and turn off ads and end screens so
nothing is suggested over the last frame.

**Title:**

```
Export your Maccabi Online medical records to one ZIP – free Chrome extension
```

**Description** (plain text; the chapter times are the film's parts, `runFrom`, `saved` and `privacy` in `T` in
`store/src/video.ts`, so retiming the film means changing them here and on YouTube; YouTube shows chapters only
when each is at least 10 seconds long. The lists repeat the store description's, so change them together):

```
Save a copy of your Maccabi Online medical records on your computer, as one ZIP file: every PDF the site offers, plus the site's own data as JSON. Free and open source.

▶ Install from the Chrome Web Store: https://chromewebstore.google.com/detail/lmjcbhajlnbpldofejcglcdclceampjp

0:00 Years of records, one ZIP
0:12 The export, start to finish (sped up)
0:23 What's in the ZIP
0:37 Private by design

WHAT IT SAVES
• Test results, lab histories and result PDFs
• Visit summaries from the last 12 months
• Prescriptions, pharmacy purchases and the purchase report
• Referrals, approvals and information pages
• Vaccinations and the vaccination booklet
• Letters, messages with your doctor, and documents you uploaded
• Your full medical file, freshly ordered to cover your whole history

HOW IT WORKS
1. Log in to Maccabi Online as usual.
2. Click the extension's icon and press Start export.
3. Keep the tab open. After 5 to 20 minutes, the ZIP is in your Downloads folder.

Each export orders a fresh copy of your full medical file, so Maccabi will text you about the order. That is the only change the extension makes to your account.

PRIVATE BY DESIGN
• Connects only to online.maccabi4u.co.il. No servers, analytics or tracking.
• Uses the session you're already logged in with. It never sees your password.
• Open source, and what ships isn't minified: https://github.com/RoniRachmani/health-records-export-for-maccabi
• Privacy policy: https://github.com/RoniRachmani/health-records-export-for-maccabi/blob/main/docs/privacy.md

תוסף לא רשמי לכרום ששומר במחשב שלכם עותק של הרשומות הרפואיות ממכבי אונליין – בדיקות, ביקורים, מרשמים, מכתבים והתיק הרפואי המלא – בקובץ ZIP אחד. ממשק התוסף באנגלית.

The narration is an AI voice (ElevenLabs). The music and sound effects were synthesized for this video. The records shown are made up.

Unofficial. Not affiliated with, endorsed by or sponsored by Maccabi Healthcare Services.
```

### Additional fields

**Official URL:** None. This field needs a domain verified in Google Search Console.

**Homepage URL:** https://github.com/RoniRachmani/health-records-export-for-maccabi

**Support URL:** https://github.com/RoniRachmani/health-records-export-for-maccabi/issues

**Mature content:** No

## Privacy practices tab

### Single purpose

```
Saves the signed-in member's own medical records from Maccabi Online (online.maccabi4u.co.il) to a ZIP file on their computer.
```

### Permission justifications

**Host permission** (`https://online.maccabi4u.co.il/*`):

```
Reads the signed-in member's records and their PDFs from Maccabi Online, using the session the member is already logged in with. Each export also orders the member's full medical file, which the member is told about before starting. The extension accesses no other site. activeTab isn't enough: its access ends when the tab navigates, and an export moves the tab between the site's pages and runs for 5 to 20 minutes.
```

**scripting:**

```
Runs short functions in the Maccabi tab the member is logged in on, and only there. The functions do three things:
1. Read the site's session token so the extension can make requests as the logged-in member. When the token is stale, they clear it so that the site issues a new one.
2. Send the few requests that the site accepts only from its own pages: the legacy medical-file services and the medical file order.
3. While an export runs, dispatch a mousedown event on the page every 4 minutes. Maccabi logs members out after 6 minutes without a click or keypress, and an export runs for 5 to 20 minutes without user input. The member is told about this before the first export, and it stops as soon as the export ends.
```

**downloads:**

```
Saves the finished ZIP to the Downloads folder. When the member presses "Show in folder", it shows the ZIP there.
```

**storage:**

```
Keeps the export's progress so that the popup can show it and a paused export can resume. Keeps the session token in memory-only session storage while an export runs. Also records which version of the Terms of Use and Privacy Policy the member accepted.
```

**unlimitedStorage:**

```
Holds the collected records and PDFs in the extension's IndexedDB until the ZIP is built. A long medical history can exceed the default quota. The files are deleted as soon as the ZIP is saved.
```

**offscreen:**

```
Builds the ZIP as a blob URL for chrome.downloads, and parses two HTML tables that the site returns. The service worker can do neither, because it has no DOMParser and can't create blob URLs.
```

**alarms:**

```
Sets a 30-second heartbeat while an export runs, so that the export continues if Chrome stops the service worker. The alarm is cleared when the export ends.
```

**notifications:**

```
Tells the member when the export is ready, or when it needs them to log in again, bring the Maccabi tab back to the front or try again.
```

### Remote code

**No, I am not using remote code.** Everything runs from the package, which is built without minification so
reviewers can read it.

### Data usage

The store's user data FAQ says data must be declared even when it's only processed and stored on the user's own
device. Check these five:

| Type | What the extension handles |
|---|---|
| Personally identifiable information | Name, ID number, birth date and the other member details in the profile, which the export saves. The popup also shows the member's first name. |
| Health information | The medical records themselves |
| Authentication information | The site's session token and the member ID. The popup reads them from the Maccabi tab when it opens, and they're kept in `chrome.storage.session` while an export runs. |
| Personal communications | The member's inquiries to doctors, from the Communication with doctor section |
| Website content | The pages and files the extension reads from Maccabi Online |

Leave financial and payment information, location, web history and user activity unchecked.

### Certifications

Check all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy

**URL:** https://github.com/RoniRachmani/health-records-export-for-maccabi/blob/main/docs/privacy.md

The same policy ships in the extension as `privacy.html`.

## Distribution tab

**Payments:** Free of charge.

**Visibility:** Public.

**Regions:** All regions, because members also use Maccabi Online from abroad.

## Test instructions tab

**Username** and **Password:** Leave both empty. See the instructions below for why.

**Additional instructions:**

```
Works only for Maccabi Healthcare Services (Israel) members logged in to https://online.maccabi4u.co.il. Login needs an Israeli ID number and an SMS code, so we can't provide a test account.

Without a login, the popup shows "How the export works" and reads nothing until you press "Agree and continue". Then it shows "Log in to Maccabi Online".

Source: https://github.com/RoniRachmani/health-records-export-for-maccabi (docs/endpoints.json lists every request). The package isn't minified.
```

The store allows 500 characters here. This text has 491.

## Keeping it true

This page repeats facts that are defined elsewhere in the repo. When one of these changes, update the matching part
of this page:

| Change | Also update |
|---|---|
| Popup layout or wording | Run `npm run store-assets` and `npm run store-video`. Check the description and the test instructions. |
| A section is added, renamed or dropped | Description list, `FOLDERS` in `store/src/stage.ts`, README |
| A permission is added or removed | Permission justifications here, the manifest, `docs/privacy.md`, `public/privacy.html`, README |
| A new kind of data or request | Data usage here, the privacy policy, `docs/endpoints.json` |
| The manifest's `description` | Summary here (132 characters at most) |
