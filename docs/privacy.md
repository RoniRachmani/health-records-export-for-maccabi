# Privacy Policy

Health Records Export for Maccabi

Effective 23 September 2026

<!-- Keep in sync with public/privacy.html, which ships in the extension at chrome-extension://<id>/privacy.html. -->

This policy explains how Health Records Export for Maccabi ("the extension") handles your information. The
extension is developed by Roni Rachmani ("the developer"). It is unofficial and is not affiliated with, endorsed
by or sponsored by Maccabi Healthcare Services.

See also the [Terms of Use](terms.md).

## Information the extension handles

The extension works with the following information, on your computer only. The first time you open its popup, it
shows a notice and reads nothing until you accept it. After that, when you open its popup on a Maccabi Online tab, it
checks that tab's login session and reads your first name. It reads the rest when you start an export:

- Your medical records as Maccabi Online shows them: test results, visit summaries, prescriptions and
  purchases, referrals and approvals, vaccinations, letters, your full medical file, inquiries to doctors, documents
  you saved, and the PDF files attached to them.
- Your first name, which the popup shows so you can check which member is logged in.
- Your personal details as they appear in your Maccabi Online profile, and the doctors assigned to you.
- Your Maccabi Online session token, member ID number and the gender recorded in your login session, which let the
  extension make requests as the logged-in member (the site asks for the gender to return test result details). The
  extension never sees, stores or enters your password or one-time codes.
- Export progress: which steps are done, how many files and how much data are collected, the ZIP file's name, a list
  of items that could not be exported, your birth date (needed to request vaccination details), and a code computed
  from your member ID, which stops a paused export from being resumed by a different member.
- One setting: which version of the Terms of Use and this policy you accepted, by effective date, in the notice shown
  the first time you open the popup.

## How it is used

Only to show which member is logged in, and to create the export you asked for: to read your records from Maccabi
Online, save them as a ZIP file, show progress, and tell you when the export is ready or needs you. The information is
not used for any other purpose.

## Where it is kept, and for how long

- Collected records and files, which include your personal details such as your name and ID number, are kept in the
  extension's storage in your browser (IndexedDB), on your computer's disk. They are deleted as soon as the ZIP is
  saved, or when you cancel or discard the export. A paused or stopped export keeps them so it can continue.
- The first name the popup shows, with the member ID number it belongs to, is kept in Chrome's in-memory session
  storage and is not written to disk. It is deleted when Chrome closes.
- The session token, with the member ID number and gender that come with it, is kept in Chrome's in-memory session
  storage and is not written to disk. It is deleted when the ZIP is saved, when you cancel or discard the export, or
  when Chrome closes.
- Export progress, including the list of problems, your birth date and the code computed from your member ID, is
  kept in the extension's local storage, on your computer's disk. It is deleted when you press Done, or cancel or
  discard the export.
- The notice setting is kept in the extension's local storage. It is deleted when you remove the extension.
- The ZIP file is saved to your Downloads folder and stays there until you delete it. Chrome also lists it in its
  download history.

Removing the extension from Chrome deletes everything it stores. It does not delete ZIP files you have saved.

## What is sent, and to whom

- The extension communicates only with `online.maccabi4u.co.il`, the site you log in to, and only to read
  your name and records and order your medical file. The requests carry your login session, so Maccabi Healthcare Services links them to
  your account, and handles them under its own privacy policy.
- Nothing is sent to the developer. The developer runs no server that could receive it.
- Your information is not sold, not shared with third parties, and not used for advertising, analytics,
  creditworthiness or lending.
- The extension contains no remote code. Everything it runs is in the package you installed.

The use of information received from Maccabi Online adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements.

## Actions on your Maccabi Healthcare Services account

Apart from reading, the extension takes one action: each export orders a fresh copy of your full medical file. It sends
the same request the site's own order button sends, but asks for your whole history, which is a wider date range than
the site's form offers. Maccabi Healthcare Services sends you an SMS about it, and the new file replaces the previous one in the site's
list. When a copy ordered earlier the same day over the same range is already waiting, no new order is placed. The
extension does not change or delete anything else, mark items as read, or access payment details.

## Permissions

- Access to `online.maccabi4u.co.il`: to read your records from the site you are logged in to.
- `scripting`: to read the login session from the Maccabi Healthcare Services tab (and clear the old token there so the site issues a
  fresh one), send the requests the site accepts only from its own pages, and, while an export is running, signal
  activity in that tab every few minutes so Maccabi Healthcare Services's six-minute idle logout does not end the export partway.
- `downloads`: to save the ZIP file.
- `storage` and `unlimitedStorage`: to keep export progress and collected files until the ZIP is saved (PDF files can be large).
- `offscreen`: to build the ZIP file, and read two HTML tables from the site.
- `alarms`: to continue an export if Chrome suspends the extension's background worker.
- `notifications`: to tell you when the export is ready or needs you, for example to log in again.

## Keeping your export safe

The ZIP file is not encrypted. Anyone who can open it can read your health information. Keep it somewhere safe, and
take care when you share it or upload it to other services.

## Contact

For questions about this policy, open an issue at
<https://github.com/RoniRachmani/health-records-export-for-maccabi/issues>. Issues are public: never include health
information or your ID number in one.

## Changes to this policy

Changes are published on this page, which comes with each version of the extension, and in the project's repository,
with a new effective date at the top. When a change is material, the extension shows its notice again and asks you to
accept the updated policy before you start another export.
