# Launch: the first 50 installs

The plan for taking the extension from its first few users to 50 installs, with the posts to send and the log to fill
in. The messaging comes from [positioning.md](positioning.md); when a post and that file disagree, the file wins.

**Goal:** 50 installs on the Chrome Web Store developer dashboard by Saturday 28 November 2026. Beside it: 5 store
reviews, 10 conversations with people who ran an export, and an answer to positioning.md's *To validate with
customers*.

**Budget:** none. Everything here is posting, by hand, under the developer's own name.

## Who it is for

- **Primary:** the curious, tech-comfortable Maccabi member of positioning.md: uses Claude or ChatGPT, installs
  extensions, reads English.
- **A test, in week 4:** English-speaking olim on Maccabi. The extension and the page are English only, and for them
  "it reads the Hebrew" is the pitch and not a proof point. If they install at a better rate than the primary
  audience, positioning.md's point 6 needs a second look.
- **Not yet:** patient and chronic-condition groups. They come back for trends, but they are less at home with a
  desktop app, and there are no reviews to show them yet.

## Every post

- Links to the landing page, `https://maccabi.ronirachmani.com/`, not to the store: the page does the persuading, and
  its visits are counted.
- Says "on a computer, in Chrome". Most clicks from a social post are on a phone, where it cannot install; the page's
  "Email yourself the link" is for them.
- Says *Unofficial*, and never tags Maccabi or uses its logo or name as a brand.
- Shows the made-up member only: the page's pictures, the store's screenshots, the film. Never a real record, a real
  dashboard or a real screen of the site.
- Says only what the landing page says: you log in yourself, the assistant reads a folder, it advises and you and your
  doctor decide. It names no other product.
- Is posted on a workday morning, Sunday to Wednesday, when people are at a computer.

## Calendar

One channel in each window, because that is the only way to tell them apart (see [Measuring](#measuring)).

| Week | What | Where | Notes | Status |
|---|---|---|---|---|
| 14–17 Oct | Baselines, tagged store links, this log | | Before any post | Links tagged. The baseline row still needs the dashboard's and GoatCounter's numbers |
| 18–24 Oct | [A message](#a-message-to-someone-you-know) to 30–40 people | WhatsApp, direct messages | Aim: 10 installs, 3 reviews, 5 conversations | |
| 25–31 Oct | [The founder's post](#linkedin), and a comment on day 3 | LinkedIn | Needs nothing before it | |
| 1–7 Nov | [*Loose ends*, in Hebrew](#hebrew-ai-groups) | 2 or 3 AI groups on Facebook, two days apart | Ask each admin first. Needs the first reviews on the listing | |
| 8–14 Nov | [Ask in English](#english-speaking-groups) | Olim groups, r/Israel | The test above | |
| 15–21 Nov | [Show HN](#hacker-news-and-rclaudeai), then r/ClaudeAI | Hacker News, Reddit | Be there for the comments all day | |
| 22–28 Nov | What the first users asked | LinkedIn, and the best channel again | Open: decide from the log | |

Left out on purpose: paid ads (nothing targets Maccabi members), Product Hunt, and the press, until the extension has
reviews and a few months of working.

## Measuring

Nothing new is installed for this. Two things cannot be measured, and the plan works around both:

- **Where a visitor came from.** The landing page counts its visits with GoatCounter's image, which has no script: it
  records that the page was opened and nothing else, with no referrer and no campaign. So channels are posted one at a
  time, and the day's rise in visits belongs to the channel posted that day.
- **Whether an install became an export.** The extension counts nothing, and that stays. The store's user count is
  installations, not use. The only way to know is to ask, which is why the first week is people who will answer.

What each place says:

| Where | What it shows |
|---|---|
| GoatCounter (`maccabi-export.goatcounter.com`) | Visits to the landing page, by day |
| Chrome Web Store dashboard, *Installs & uninstalls* | Installs and uninstalls, by day and by region |
| Chrome Web Store dashboard, *Impressions* | Views of the listing, split by the `utm_source`, `utm_medium` and `utm_campaign` on the link that led there |
| Google Search Console | The searches that find the page |
| YouTube Studio | The film's views and how long people watch |
| GitHub, *Insights → Traffic* | The repo's views and referrers, for the last 14 days only: copy them here weekly |

The store links are tagged, so the dashboard separates the people the page sent from the people who found the listing
in the store:

| Link | Tags |
|---|---|
| The page's badge in the hero | `utm_source=site&utm_medium=landing&utm_campaign=hero` |
| The page's badge under *Get the extension* | `utm_source=site&utm_medium=landing&utm_campaign=get` |
| The page's footer | `utm_source=site&utm_medium=landing&utm_campaign=footer` |
| The README's badge and install link | `utm_source=github&utm_medium=readme` |
| The review link sent to someone who ran an export | `utm_source=friends` |

Not used: the dashboard's Google Analytics opt-in, and any counting inside the extension.

**Targets**, to be replaced with the log's own ratios after week 2. They assume one visit in five reaches the listing
and one listing view in four installs, which is a guess:

| Measure | Target by 28 Nov |
|---|---|
| Installs | 50 |
| Landing page visits | 800 to 1,200 |
| Listing views from the page | 150 to 250 |
| Uninstalls | Under a quarter of installs |
| Reviews | 5 |
| Conversations with users | 10 |

### Log

Fill a row each Sunday. Visits, listing views, installs and uninstalls are totals since 14 October.

| Date | Posted that week | Visits | Listing views: site / github / untagged | Installs | Uninstalls | Users | Reviews | Stars | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 14 Oct | Nothing yet | | | | | 3 | 0 | 1 | Baseline. GitHub: 115 views from 18 people in the 14 days before |
| 18 Oct | | | | | | | | | |
| 25 Oct | | | | | | | | | |
| 1 Nov | | | | | | | | | |
| 8 Nov | | | | | | | | | |
| 15 Nov | | | | | | | | | |
| 22 Nov | | | | | | | | | |
| 29 Nov | | | | | | | | | |

### What to ask a user

1. What was the first thing you asked it?
2. Where did you get stuck: installing, the export, or opening the folder?
3. Which app did you open it in, and were you already paying for it?
4. Would you run it again? What for?

## Posts

Drafts. Each is in the developer's voice and is theirs to change: fill what is in square brackets, and cut anything
that isn't true of their own export.

### A message to someone you know

> היי, בניתי תוסף לכרום, חינמי ובקוד פתוח, ששומר את כל ההיסטוריה שלכם ממכבי אונליין בתיקייה אחת במחשב. פותחים אותה
> ב-Claude או ב-ChatGPT ושואלים כל מה שרוצים. התיק הרפואי שלי חזר עד הינקות. אם אתם במכבי ויש לכם עשר דקות ליד
> מחשב, אשמח שתנסו ותספרו לי איפה נתקעתם: https://maccabi.ronirachmani.com/
> (מתקינים בכרום במחשב, לא בטלפון. לא רשמי, ולא קשור למכבי.)

> I built a free, open-source Chrome extension that saves your whole Maccabi Online history to one folder on your
> computer. You open it in Claude or ChatGPT and ask anything. My medical file went back to when I was a baby. If
> you're with Maccabi and have ten minutes at a computer, would you try it and tell me where you got stuck?
> https://maccabi.ronirachmani.com/
> (It installs in Chrome on a computer, not a phone. Unofficial, and nothing to do with Maccabi.)

After they have run an export, the questions above, and then:

> If it was useful, an honest review on the store helps the next person trust it:
> https://chromewebstore.google.com/detail/lmjcbhajlnbpldofejcglcdclceampjp/reviews?utm_source=friends

Ask for an honest review, from people who ran an export, and offer nothing for it: the store removes reviews that
were asked for in exchange for something.

### LinkedIn

Attach the film as a video on the post itself (the file `npm run store-video` renders), not as a YouTube link. Put
the page's link in the first comment.

> I asked an AI assistant to read my whole Maccabi medical file. Its first line wasn't a summary. It was a count of
> things I hadn't followed up on.
>
> Maccabi Online shows your records one page at a time, and only so far back. I wanted all of it in one place, where an
> assistant could read the years together.
>
> So I built a Chrome extension that does it. You log in as usual and press one button. A few minutes later there's a
> folder on your computer: your full medical file, and every result, visit summary, prescription, referral,
> vaccination and letter the site has. My medical file went back to when I was a baby.
>
> Open the folder in the Claude or ChatGPT desktop app, and ask what you'd ask a friend who's read everything:
>
> • What stands out in my records?
> • Anything my doctors asked me to do that I haven't?
> • What should I raise with my doctor on Thursday?
>
> The export asks the assistant to name the file, and the page, behind every answer, so you can check it. It advises.
> You and your doctor decide.
>
> It's free and open source. You log in yourself, and the assistant only reads the folder. Your records go from
> Maccabi Online to your computer, and from there only where you take them.
>
> If you're a Maccabi member, try it on a computer (it's a Chrome extension, so not on a phone) and tell me what it
> found, or where you got stuck. The link is in the first comment.
>
> Unofficial: not affiliated with Maccabi Healthcare Services.

First comment: `https://maccabi.ronirachmani.com/`

Day 3, as a comment, answering the question that came up most. If it was about safety:

> A few people asked whether this is safe. The extension talks only to Maccabi Online, in the session you're already
> logged in with, and has no server of its own. The code is public and unminified, so anyone can read what it sends:
> https://github.com/RoniRachmani/health-records-export-for-maccabi

### Hebrew AI groups

Attach the page's dashboard picture or `store/assets/screenshot-1-ask.png`. Write to the group's admin first, with the
post, and post only where they agree.

> **שאלתי את Claude: יש משהו שהרופאים ביקשו ממני ולא עשיתי?**
>
> במכבי אונליין רואים את הרשומות עמוד אחרי עמוד: כל הפניה, כל תוצאה וכל מרשם במסך משלהם. רציתי שעוזר AI יקרא את
> הכול ביחד.
>
> אז בניתי תוסף לכרום, חינמי ובקוד פתוח. מתחברים למכבי אונליין כרגיל, לוחצים על כפתור אחד, ואחרי כמה דקות (לפעמים עד 20) יש במחשב
> תיקייה אחת עם התיק הרפואי המלא, ועם כל הבדיקות, סיכומי הביקור, המרשמים, ההפניות, החיסונים והמכתבים שיש באתר.
> פותחים אותה באפליקציית הדסקטופ של Claude או של ChatGPT, ושואלים.
>
> השאלה הכי שימושית שמצאתי: "יש משהו שהרופאים ביקשו ממני ולא עשיתי?" העוזר מצליב כל הפניה והמלצה עם הבדיקות,
> הביקורים והרכישות שבאו אחריה, ומחזיר טבלה: בוצע, באיחור, פג תוקף. ליד כל שורה כתוב מאיזה קובץ היא לקוחה, כך
> שאפשר לבדוק.
>
> כמה דברים שכדאי לדעת:
> • מתחברים למכבי בעצמכם. העוזר קורא רק את התיקייה שבמחשב.
> • הרשומות עוברות ממכבי אונליין למחשב שלכם, ומשם רק לאן שתיקחו אותן.
> • מתקינים בכרום במחשב, לא בטלפון. צריך את אפליקציית הדסקטופ של Claude, בתוכנית בתשלום, או של ChatGPT.
> • התוסף והעמוד באנגלית. העוזר קורא את העברית שברשומות.
> • לא רשמי: התוסף אינו קשור למכבי שירותי בריאות. העוזר מסביר ומציע, ואתם והרופא מחליטים.
>
> הרשומות שבתמונה מומצאות.
>
> https://maccabi.ronirachmani.com/
>
> אשמח לשמוע מה שאלתם ומה קיבלתם.

### English-speaking groups

Attach the page's allergy answer: the Hebrew page behind, the English answer in front.

> **Your Maccabi records are in Hebrew. You can ask about them in English.**
>
> I'm a Maccabi member, and I built a free, open-source Chrome extension that saves everything from Maccabi Online to
> one folder on your computer: your full medical file, test results, visit summaries, prescriptions, referrals,
> vaccinations and letters.
>
> Open that folder in the Claude or ChatGPT desktop app and ask in English:
>
> • Am I allergic to any medicine?
> • What changed in my latest blood tests?
> • What should I raise with my doctor on Thursday?
>
> It reads the Hebrew and answers in plain English, and the export asks it to name the record, and the page, behind
> each answer, so you can check it or show it to your doctor.
>
> Good to know: you log in to Maccabi yourself, and your records go to your computer and nowhere else unless you take
> them there. It installs in Chrome on a computer, not a phone. Claude's desktop app needs a paid plan. It's
> unofficial, not affiliated with Maccabi Healthcare Services, and the assistant explains and suggests: you and your
> doctor decide.
>
> https://maccabi.ronirachmani.com/

### Hacker News and r/ClaudeAI

Title:

> Show HN: Export Maccabi (Israeli HMO) medical records for Claude or ChatGPT

Link: the repo. First comment:

> I'm a member of Maccabi, one of Israel's four health funds. Its site shows my records one page at a time and within
> date limits, and I wanted an assistant to read all of them together. This is a Chrome extension that walks the site
> in my own logged-in session and writes one ZIP: each record as the site's own JSON, with its PDF beside it under the
> same name.
>
> A few things that might interest people who will never use it:
>
> - The export's README is written for the assistant, not for me. It says where to start, what the export lacks and
>   which values mislead, and asks for the file and page behind every fact. A CLAUDE.md imports it and an AGENTS.md
>   points to it, because the tools load those names and not a README.
> - All the collection logic is in a core with no browser API, so the whole run is tested in Node against a fake site.
> - A run is resumable at the level of a write: the next step is checkpointed after every step, and re-running a step
>   rewrites nothing that hasn't changed. A restarted service worker, or a restarted Chrome, picks up where it stopped.
> - It is read-only except for one call, which orders the full medical file. Requests go one at a time, 300 ms apart,
>   and every endpoint it touches is listed in the repo, with a test that fails if one is missing.
> - No server, no analytics, not minified.
>
> It only works for Maccabi members, so most of you can't try it. I'd like to hear what you'd change in how the export
> is laid out for an assistant.

For r/ClaudeAI, the same comment as the post's body, with the page's dashboard picture.
