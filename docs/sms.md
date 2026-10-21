# Maccabi's text messages

Maccabi Healthcare Services texts the member at two points this repo can reach: the sign-in's one-time code, and the
medical file being ready after an order. Nothing else this repo sends makes Maccabi text anyone. This is what each
text looks like and what sets it off, as seen on a member's phone (Google Messages) between January and October 2026.
The codes and links below are placeholders: never commit a real one.

| Text | Sender | Set off by | Who sends that request |
|---|---|---|---|
| Sign-in code | `Maccabi-OTP` | `GET /infosec/otp/generateV2?target=sms&phone=<index>` | the site's login page; `npm run export -- --no-browser --sms` |
| Medical file ready | `Maccabi` | `POST /online/Ajax/Summary/WsSummaryPage.asmx/MedicalFileOrderAjax` | the site's order button; every extension export that orders |

Both senders are names, not phone numbers, so neither can be answered, and each has a thread of its own: the codes
never land among the appointment, pharmacy and medical-file texts that `Maccabi` sends.

## The sign-in code

The login page on `mac.maccabi4u.co.il` asks for the ID number, then offers a code by SMS, a code by voice call, or
*sign in with password*. Only the SMS road sends a text. The request chain is in
[endpoints/scripts-endpoints.json](endpoints/scripts-endpoints.json); in short:

- `/infosec/otp/detailsV2` lists the member's phones, with the number masked by the site (`052-*****28`). A phone
  takes an SMS when it is `mobile` and not `kosher` (a kosher phone can't receive texts); the same number can be listed
  twice, which is not a choice (`choosePhone` in `scripts/maccabi-session.mjs`). Nothing is sent yet.
- `/infosec/otp/generateV2?target=sms&phone=<index>` sends one six-digit code to that phone. Each sign-in sends one;
  a second sign-in sends another, which is why the thread holds bursts of two to four codes minutes apart.
- `/infosec/otp/validate?otp=<code>` takes one attempt. A wrong code (`303`) or an expired one (`302`) ends that
  sign-in, and the next one sends a new text. Trying another code against the same text is what locks an account, so
  the script never does; a reply that isn't six digits is refused before it is sent and does not spend the code.

The text is one Hebrew sentence, *"<code> is your verification code for Maccabi's digital services"*, followed by one
of two machine-readable trailers:

```text
123456 הוא קוד האימות שלך לשירותי הדיגיטל של מכבי (ISq1c6mq31R)
```

```text
123456 הוא קוד האימות שלך לשירותי הדיגיטל של מכבי
@mac.maccabi4u.co.il #123456
```

- `(ISq1c6mq31R)` is an 11-character app hash in the format of Android's SMS Retriever API: it lets Maccabi's Android
  app read the code off the phone by itself. The hash is the app's, the same for every member.
- `@mac.maccabi4u.co.il #<code>` is the [origin-bound one-time code](https://wicg.github.io/sms-one-time-codes/)
  format that WebOTP reads: a browser on that phone can offer the code to the login page on `mac.maccabi4u.co.il`,
  and to no other site.

Every text from January to 11 September 2026 had the app hash. The WebOTP line first came on 14 September, the hash
again on 16 and 20 September, and every text since 26 September has had the WebOTP line. That fits the format
following which client asked for the code (the app or the website) rather than a date, but nothing here has tested
that. The `--sms` sign-in reads the code typed in the terminal and drops spaces, so type the six digits: the whole
second line pasted in is not six digits, and is asked for again without spending the code.

## The medical file is ready

Ordering the medical file (`placeOrder` in `src/core/sections/letters.ts`, the one request this repo sends that
changes anything) makes Maccabi build the file and text the member once it is done, a minute or two after the order.
The order answers `Success 1` (ordered, SMS sent) or `2` (ordered, no SMS); `3` is a refusal, and is no proof that
nothing was ordered: on 2026-10-15 one was followed by its text 21 minutes later. So a run never orders twice
(`orderSettled`), and a ready file from the same day over the same range is taken without ordering, so the member is
not texted again for it. The timings behind this are in [sections.md](sections.md), under line 16.

The text comes from `Maccabi` and reads the same every time, with the member's first name and a short `macb.li` link
to Maccabi Online:

```text
<first name> שלום,
הסתיים הטיפול בבקשתך לקבלת התיק הרפואי.
ניתן להיכנס לאתר מכבי online לצפייה https://M.macb.li/…
ברכת בריאות שלמה,
מכבי שירותי בריאות
```

That is: "Hello <first name>, your request for the medical file has been handled. You can view it on the Maccabi
Online website [link]. Wishing you full health, Maccabi Healthcare Services." It names neither the order's date nor
its range, so two texts can't be told apart by what they say, only by when they came.

## What never texts

The extension never signs in, so it never sets off a code; a live test without `--export` never orders
(`dev:skipOrder`); `npm run export` never orders, with or without a browser, and signs in with the password unless
`--sms` is given. The member is told about the order's text in the README, the Terms and the Privacy Policy.
