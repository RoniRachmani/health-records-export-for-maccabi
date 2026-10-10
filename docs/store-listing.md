# Chrome Web Store listing

What to enter on the Chrome Web Store developer dashboard for each tab. The text below matches version 0.8.6. When
the extension changes, update this file along with it (see [Keeping it true](#keeping-it-true)).

## Before each upload

1. Raise `version` in `package.json`. The store rejects a package whose version isn't higher than the published one.
2. `npm test` and `npm run typecheck`.
3. If the popup changed, run `npm run store-assets` and look at the images in `store/assets/` before uploading them.
   Name shots to render only some of them, e.g. `npm run store-assets -- promo marquee`. The promo video shows
   the popup too: re-render it with `npm run store-video` and re-upload it to YouTube (see [Promo video](#promo-video)).
4. `npm run package`, which builds `dist/` and writes `release/health-records-export-for-maccabi-<version>.zip`.
   Upload that file on the **Package** tab. The script refuses to package a development build.
5. For the GitHub release, write its notes in `docs/releases/<version>.md` (the first line, `# <title>`, names it),
   push them and the bump to `main`, and run the **Release** workflow from the Actions tab with the version. It runs the
   gate, packages the same ZIP, tags `main` as `v<version>` and publishes the release with the ZIP attached.

## Store listing tab

### Product details

**Title** comes from the manifest's `name`: Health Records Export for Maccabi

**Summary** comes from the manifest's `description` in `manifest.config.ts`. It has 128 characters, and the limit is 132:

> Your whole Maccabi history, and a genius friend who's read all of it: save your records, then ask Claude or ChatGPT. Unofficial.

**Description** (plain text. The store shows line breaks but doesn't render Markdown). It follows
[positioning.md](positioning.md): the headline and subline, then the three values in order (the whole history, a friend
who has read it, yours to keep), then how to get there, with privacy and price said once near the top and the details
near the end:

```
Your whole Maccabi history, and a genius friend who's read all of it.

Save everything from Maccabi Online to your computer, then ask anything: what changed, what stands out, what to do next. Open the export in the Claude or ChatGPT desktop app, and the assistant reads every record, written in Hebrew, and answers in plain English.

Maccabi Online shows your records one page at a time, within date limits. This extension puts every record in one place on your computer, where an assistant can read all of it. It's free, and your records stay on your computer.

EVERYTHING, IN ONE PLACE
Your full medical file, ordered for the widest range Maccabi allows, plus every result, visit, prescription, referral, vaccination and letter the site has:

• Test results, lab histories and result PDFs
• Visit summaries from the last 12 months, with their PDFs
• Prescriptions, your full pharmacy purchase history and the purchase report
• Referrals, approvals and information pages
• Vaccinations and the vaccination booklet
• Letters
• Messages with your doctor, and the forms attached to them
• Documents you uploaded
• Hospital stays, with discharge letters when the site has them
• Your member details, entitlements and assigned doctors

A FRIEND WHO'S READ IT ALL
Ask about you, not the internet's average person:
• "What stands out in my records?" The big picture in a minute.
• "What's one thing I should do today to improve my health?" Small, doable, and tied to your own numbers.
• "What might I be due for?" Catch what's due before it's overdue.
• "What changed in my latest blood test?" A new number next to all your old ones.
• "What should I raise with my doctor on Thursday?" Walk in prepared.
• "Anything in my history a new doctor should know?" Your past, remembered.

Or ask it to make something:
• A chart of your cholesterol, blood sugar or blood pressure over the years
• A weekly meal plan or fitness plan, fitted to what's in your file
• A one-page summary for a new doctor

Every answer names the record it came from, so you can check it. It advises; you and your doctor decide. For urgent symptoms, call a doctor or emergency services, not an assistant.

YOURS TO KEEP, AND TO GROW
The export is yours: take it to a private doctor or one abroad, and keep it through a move or a switch of health fund. Add to it as you go, such as a private clinic's letter, a new result or notes from abroad, and tell the assistant what the records can't know, like what you take now. It keeps notes in a folder of its own, so the export becomes a health record you keep growing, not a one-time snapshot.

HOW IT WORKS
1. Log in to Maccabi Online as usual.
2. On that tab, click the extension's icon and press Start export.
3. Keep the tab open and in front. Usually after a few minutes (up to 20 if the medical file is slow to arrive), the ZIP is in your Downloads folder and Chrome lets you know.
4. Unzip it and open the folder in an assistant's desktop app. In Claude, choose Project or folder under the message box. In ChatGPT, switch to Work, then choose the folder under Choose project. Claude Code and Codex work too.
5. Start with "Read README.md first. Then summarize my health history from my full medical file."

The desktop app is what reads the whole folder: a chat takes a few dozen files, and an export has hundreds. Claude's desktop app needs a paid plan for now. ChatGPT Work is in the free plan too, where it has rolled out, with lower usage limits, and a large export may need more.

While the export runs, the tab moves to the site's medical-file page and back. The extension keeps your Maccabi Healthcare Services session from timing out until the export finishes. If the session ends anyway, the export pauses. Log in again and press Resume. Files collected so far are kept.

BEFORE YOU START
Each export orders a fresh copy of your full medical file. Maccabi Healthcare Services texts you about the order, and the new file replaces the previous one on the site. If an export already ordered one earlier the same day, the extension uses that copy. Ordering this file is the only change the extension makes to your account.

WHAT THE ASSISTANT IS ASKED TO DO
The ZIP's README is written for the assistant that reads your records, as its instructions. It asks the assistant to:
• start with the full medical file
• name the file, and the page of a PDF, behind each fact, and give each its date
• say plainly when a record suggests something needs a doctor soon
• explain in plain language, without diagnosing or advising a change of treatment
• not mistake something missing from the export for something that never happened
• keep your name, ID number and contact details out of web searches and other tools

WHAT YOU GET
One folder for each part of the site. Every record is saved as the site's own data (JSON), and a record's PDF sits beside it with the same name: its date, ID and title. The full medical file is at the top of the ZIP, and a README explains what each folder holds.

Not included: imaging studies (DICOM), which the site only opens in its own viewer, and visits older than 12 months, which the site doesn't show. The purchase report PDF covers the last 2 years, though the purchase history itself covers everything. If an item fails to download, the export carries on, and the popup lists it when the export finishes.

PRIVACY
The extension connects only to online.maccabi4u.co.il, uses the session you're already logged in with, and has no servers, analytics or tracking. It deletes its own copy of your files once the ZIP is saved. You choose which AI assistant, if any, reads them. It's open source and not minified, so you can read exactly what runs: https://github.com/RoniRachmani/health-records-export-for-maccabi

The ZIP isn't encrypted, so keep it somewhere safe. An AI service you open it in can read it: check what it keeps and for how long, turn off training on your chats where you can, and keep your records in a project of their own.

Use the extension only with your own account, or with an account whose records you're legally entitled to access. It copies what Maccabi Online provides. It isn't medical advice, and the export isn't an official copy of your records.

Unofficial. Not affiliated with, endorsed by or sponsored by Maccabi Healthcare Services.
```

**Category:** Productivity > Tools

**Language:** English, the language of the extension's interface.

### Graphic assets

| Field | File | Shows |
|---|---|---|
| Store icon (128×128) | `store/assets/icon-128.png` | The toolbar icon: 96×96 artwork with 16 px of transparent padding |
| Screenshot 1 | `store/assets/screenshot-1-ask.png` | The headline, "Your whole Maccabi history, and a genius friend who's read all of it": a generic AI assistant opened on the export, saying what stands out in it and naming the file (`STANDS_OUT`) |
| Screenshot 2 | `store/assets/screenshot-2-whole.png` | "Everything, in one place": the unzipped export, its README, medical file and folders, with a file the member added themselves |
| Screenshot 3 | `store/assets/screenshot-3-advice.png` | "Advice about you, not an average person": the assistant's one thing to do today, tied to the member's own numbers (`ONE_THING`), with things it can build offered under it |
| Screenshot 4 | `store/assets/screenshot-4-start.png` | The popup, ready to start: "Log in and press Start export", with the one line on price and privacy |
| Screenshot 5 | `store/assets/screenshot-5-open.png` | The finished export: "Then open it in Claude or ChatGPT", with where each desktop app opens a folder and the first message to send |
| Small promo tile (440×280) | `store/assets/promo-small-440x280.png` | The icon's artwork on a blue background, with no text |
| Marquee promo tile (1400×560) | `store/assets/promo-marquee-1400x560.png` | Screenshot 1 in a wide frame: the name, the headline and the subline beside the assistant saying what stands out (`STANDS_OUT`). Optional: the store uses it only when it features the extension |
| Global promo video | https://youtu.be/CmLpMc90It0 | Optional. See [Promo video](#promo-video) below |

The screenshots are 1280×800 PNG files with no transparency. They follow [positioning.md](positioning.md): what the
member gets comes first, in its order of value (the whole history, a friend who has read it, theirs to keep), and how
they get there follows, so upload them in this order. Privacy and price are conditions, said once and lightly, on the
shot that starts an export. Screenshots 4 and 5 show the real popup in made-up states over a placeholder page, never
a real account. Screenshots 1 and 3 draw an AI assistant instead, plain enough to be no real product (`chatWindow` in
`store/src/parts.ts`), answering about positioning.md's made-up demo member, and screenshot 2 the export's folder
(`exportRows`). The text beside each comes from `SHOTS` in `store/src/stage.ts`. Screenshot 5's steps repeat
positioning.md's *Getting started*, so check them against the apps when that section changes.

### Promo video

The store's video field takes a **YouTube link**, not a file. The one to paste is
**https://youtu.be/CmLpMc90It0**, on the [Health Records Export for Maccabi](https://www.youtube.com/@Health-Records-Export) channel, with the title
and description [below](#on-youtube). `npm run store-video` renders the video to `store/assets/promo-video.mp4`
(3840×2160, 60 fps, 61 seconds, with narration). YouTube can't swap the file under a link, so a re-render is a
new upload with a new link: paste it on the dashboard and put it in the README, in place of the one above.

It is not committed — it is rebuilt from `store/src/video.ts`, which draws it a frame at a time in headless
Chrome. Like the screenshots, it shows the real popup fed made-up states (`store/src/mock-chrome.ts`), driven
through a whole export by run states built from the real `PLAN` and `WEIGHTS`, so the bar, the step names and the
section list move as they do in an export. Nothing in it comes from a real account: the record cards, and the
file names that stream past while the export runs, are made up, in the collector's own `<date>_<id>_<title>` form.

What it shows, in order, tells [positioning.md](positioning.md)'s story about its demo member: what it is for, first: a
generic assistant opened on the export, saying what stands out in it and naming the file it came from (`chatWindow`
with `STANDS_OUT`) · record cards from all over the site, "one page at a time", pulled into the extension's folder ·
the name and the headline · the clicks that start an export, on a placeholder page, then the camera closing in on the
popup · the export running, sped up, beside the files it writes and the progress badge on the toolbar icon · the
finished ZIP, which opens into its folders ("your whole history, in one place"), then a file of the member's own
dropped into it ("yours to keep, and to grow") · "Ask anything": the use cases as pill tabs over a pink panel, three of
them opened in turn · the assistant again, with advice tied to the member's own numbers and its source (`ONE_THING`) ·
the closing card, with the one line on privacy ("Stays on your computer") beside "Free on the Chrome Web Store", and
the repository's address. The disclaimer is on the title and closing cards, and the popup's own *Unofficial* chip (the
whole disclaimer is its tooltip) is on screen whenever the popup is.

The README shows the video as a poster that links to it: `store/assets/video-poster.png`, one frame of the same film
with a play badge over it, drawn by `npm run store-assets -- poster`. Re-render it whenever the video changes.

The soundtrack is made the same way, from the same timeline (`scripts/soundtrack.mjs`). The music and effects are
synthesized by that script, from oscillators and noise, so no music licence is involved. The music is twenty bars
from the start to the closing card (`BARS`): two under the opening answer (`INTRO`, which is `OPEN` in
`store/src/video.ts`), and two under the assistant's part at the end. Lengthen or shorten a part and the tempo follows,
unless the bar count changes with it. The narration is
`NARRATION` in `store/src/video.ts`, spoken by ElevenLabs in "Emma – Professional Commercial Voice", a Voice Library
voice, which needs ElevenLabs' Creator plan or above to speak again. To re-record it, make one take of the text
`npm run store-video -- --script` prints (ElevenLabs' web app, or its connector for Claude; model `eleven_v4`),
then `npm run store-video -- --import <take.mp3>`: the take is cut into lines at the `[long pause]` the script leaves
between them. v4 reads a line more slowly on its own than inside the whole script, so re-record a single line with the
line before it and keep only the second half. For another model, set `ELEVENLABS_MODEL` for all three commands (for
`eleven_multilingual_v2` the pauses become SSML breaks); clips are cached under the model that spoke them. With `ELEVENLABS_API_KEY` in
`.env` the lines are asked for one by one instead. Either way they are cached in `.cache/narration/`. The render
stops before the first frame if a line would run into the next one. ElevenLabs' free plan is for non-commercial
use only and asks to be credited; a paid plan is what allows commercial use of what it speaks.

#### On YouTube

Upload it as **Unlisted** or Public (the store cannot show a private video), and turn off ads and end screens so
nothing is suggested over the last frame.

**Title** (the version in brackets is the release the film shows; change it with a new upload):

```
Ask Claude or ChatGPT about your Maccabi Online medical records – free Chrome extension [v0.8.4]
```

**Description** (plain text with no links; the chapter times are the film's parts, `runFrom`, `saved` and `uses` in `T` in
`store/src/video.ts`, so retiming the film means changing them here and on YouTube; YouTube shows chapters only
when each is at least 10 seconds long. It is the store description cut down, in the same order and words, so change
them together):

```
Your whole Maccabi history, and a genius friend who's read all of it.

Save everything from Maccabi Online to your computer, then ask anything: what changed, what stands out, what to do next. This free Chrome extension saves every record the site has, and every PDF, as one ZIP, and you open the folder in the Claude or ChatGPT desktop app. The assistant reads every record, written in Hebrew, and answers in plain English.

Maccabi Online shows your records one page at a time, within date limits. This puts every record in one place on your computer, where an assistant can read all of it.

▶ Find it on the Chrome Web Store: Health Records Export for Maccabi

0:00 Your whole Maccabi history, and a genius friend who's read all of it
0:19 The export, start to finish (sped up)
0:30 Everything, in one place, and yours to keep
0:43 Ask anything

EVERYTHING, IN ONE PLACE
• Your full medical file, ordered for the widest range Maccabi allows
• Test results, lab histories and result PDFs
• Visit summaries from the last 12 months, with their PDFs
• Prescriptions, your full pharmacy purchase history and the purchase report
• Referrals, approvals and information pages
• Vaccinations and the vaccination booklet
• Letters, messages with your doctor, and documents you uploaded
• Hospital stays, with discharge letters when the site has them
• Your member details, entitlements and assigned doctors

THINGS TO ASK
• "What stands out in my records?"
• "What's one thing I should do today to improve my health?"
• "What might I be due for?"
• "What changed in my latest blood test?"
• "What should I raise with my doctor on Thursday?"
• "Anything in my history a new doctor should know?"

Every answer names the record it came from, so you can check it. It advises; you and your doctor decide.

YOURS TO KEEP, AND TO GROW
Take it to a private doctor or one abroad, keep it through a move or a switch of health fund, and add to it as you go: a private clinic's letter, a new result, notes from abroad.

HOW IT WORKS
1. Log in to Maccabi Online as usual.
2. On that tab, click the extension's icon and press Start export.
3. Keep the tab open and in front. Usually after a few minutes (up to 20 if the medical file is slow to arrive), the ZIP is in your Downloads folder.
4. Unzip it and open the folder in an assistant's desktop app. In Claude, choose Project or folder under the message box. In ChatGPT, switch to Work, then choose the folder under Choose project.
5. Start with "Read README.md first. Then summarize my health history from my full medical file."

The desktop app is what reads the whole folder: a chat takes a few dozen files, and an export has hundreds. Claude's desktop app needs a paid plan for now. ChatGPT Work is in the free plan too, where it has rolled out, with lower usage limits, and a large export may need more.

Each export orders a fresh copy of your full medical file, so Maccabi Healthcare Services will text you about the order. That is the only change the extension makes to your account.

PRIVACY
Your records stay on your computer, and you choose which AI assistant, if any, reads them. The extension connects only to online.maccabi4u.co.il, has no servers, analytics or tracking, and is open source.

תוסף לא רשמי לכרום ששומר במחשב שלכם עותק של הרשומות הרפואיות ממכבי אונליין – בדיקות, ביקורים, מרשמים, מכתבים והתיק הרפואי המלא – בקובץ ZIP אחד. ממשק התוסף באנגלית.

The narration is an AI voice (ElevenLabs). The music and sound effects were synthesized for this video. The records shown are made up.

Unofficial. Not affiliated with, endorsed by or sponsored by Maccabi Healthcare Services.
```

### Additional fields

**Official URL:** `ronirachmani.com`, once chosen on the dashboard. The domain is verified in Google Search Console
(a Domain property, verified through the DNS provider on 5 October 2026), and the site's sitemap,
`https://maccabi.ronirachmani.com/sitemap.xml`, is submitted there. The dashboard offers the domain only to the Google
account that verified it, so it has to be the publisher's account.

**Homepage URL:** https://maccabi.ronirachmani.com/

The landing page, published from `site/` by `.github/workflows/pages.yml`: it shows what the export is for and how
to get one, and links to the source. The old `ronirachmani.github.io` addresses redirect to this domain.

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
Runs short functions in the Maccabi Online tab the member is logged in on, and only there. The functions do three things:
1. Read the site's session token so the extension can make requests as the logged-in member. When the token is stale, they clear it so that the site issues a new one.
2. Send the few requests that the site accepts only from its own pages: the legacy medical-file services and the medical file order.
3. While an export runs, dispatch a mousedown event on the page every 4 minutes. Maccabi Healthcare Services logs members out after 6 minutes without a click or keypress, and an export runs for 5 to 20 minutes without user input. The member is told about this before the first export, and it stops as soon as the export ends.
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
Tells the member when the export is ready, or when it needs them to log in again, bring the Maccabi Online tab back to the front or try again.
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
| Authentication information | The site's session token and the member ID. The popup reads them from the Maccabi Online tab when it opens, and they're kept in `chrome.storage.session` while an export runs. |
| Personal communications | The member's inquiries to doctors, from the Communication with doctor section |
| Website content | The pages and files the extension reads from Maccabi Online |

Leave financial and payment information, location, web history and user activity unchecked.

### Certifications

Check all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy

**URL:** https://maccabi.ronirachmani.com/privacy.html

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
| A section is added, renamed or dropped | Description list, `FOLDERS` in `store/src/parts.ts`, README |
| A permission is added or removed | Permission justifications here, the manifest, `docs/privacy.md`, `public/privacy.html`, README |
| A new kind of data or request | Data usage here, the privacy policy, `docs/endpoints.json` |
| The manifest's `description` | Summary here (132 characters at most) |
| What the export's README asks of the assistant (`shared/readme.ts`) | The description's "What the assistant is asked to do" and "Yours to keep, and to grow", the README's *Hand it to an AI assistant*, and the answers in `STANDS_OUT` and `ONE_THING` (`store/src/parts.ts`), which screenshots 1 and 3 and the video draw |
| The questions to start with, or the Ask and Build use cases in [positioning.md](positioning.md) | The description's "A friend who's read it all", YouTube's "Things to ask", the README's list, and `FOLLOW_UPS` and `BUILDS` in `store/src/parts.ts` |
| Health in ChatGPT, or another assistant's medical-record connection, reaches Maccabi or opens to Israel | *Alternatives the customer has* and the positioning statement in [positioning.md](positioning.md). Customer-facing copy doesn't mention those tools, so nothing else changes |
