# Launch: the first 50 installs

The plan for taking the extension from its first few users to 50 installs, with the posts to send and the log to fill
in. The messaging comes from [positioning.md](positioning.md); when a post and that file disagree, the file wins.

**Goal:** 50 installs on the Chrome Web Store developer dashboard by Saturday 28 November 2026. Beside it: 5 store
reviews, 10 conversations with people who ran an export, and an answer to positioning.md's *To validate with
customers*.

**Budget:** none. Everything here is posting, by hand, under the developer's own name.

## Who it is for

Maccabi has about 2.71 million members: just over a quarter of everyone insured in Israel. Fifty installs is a tiny
share of them, so the fund's size doesn't cap this plan. What it costs is reach: in any Israeli audience, about three
readers in four are with another fund and can't use the extension at all. The calendar and the posts allow for that
(see [Every post](#every-post)).

- **Primary:** the curious, tech-comfortable Maccabi member of positioning.md: uses Claude or ChatGPT, installs
  extensions, reads English.
- **A test, in week 4:** English-speaking olim on Maccabi. The extension and the page are English only, and for them
  "it reads the Hebrew" is the pitch and not a proof point. If they install at a better rate than the primary
  audience, positioning.md's point 6 needs a second look.
- **Not yet:** patient and chronic-condition groups. They come back for trends, but they are less at home with a
  desktop app, and there are no reviews to show them yet.

## Every post

- Names Maccabi in its first line, so people with another fund pass by without clicking and the page's visits stay
  mostly members. It ends by asking them to pass it on: nearly everyone knows someone with Maccabi.
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
| 14–17 Oct | Baselines, tagged store links, this log | | Before any post | Done |
| 18–24 Oct | [A message](#a-message-to-someone-you-know) to 30–40 Maccabi members | WhatsApp, direct messages | About one contact in four is a member, so that is some 150 people, or the groups you're in. Aim: 10 installs, 3 reviews, 5 conversations, and a word with 5 who stopped | |
| 25–31 Oct | [The founder's post](#linkedin), and a comment on day 3 | LinkedIn | Needs nothing before it | |
| 1–7 Nov | [*Loose ends*, in Hebrew](#hebrew-ai-groups) | 2 or 3 AI groups on Facebook, two days apart | Ask each admin first. Needs the first reviews on the listing | |
| 8–14 Nov | [Ask in English](#english-speaking-groups) | Olim groups, r/Israel | The test above | |
| 15–21 Nov | [Show HN](#hacker-news-and-rclaudeai), then r/ClaudeAI | Hacker News, Reddit | Almost no members there: this week is for feedback and stars, not installs. Be there for the comments all day | |
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

Fill a row each Sunday. Visits, listing views, installs and uninstalls are totals since 14 October. *Asked for
another fund* counts the people who answer "I'm with Clalit, Meuhedet or Leumit: is there one for us?", which is the
only measure this launch gives of what the other three quarters would want.

| Date | Posted that week | Visits | Listing views: site / github / untagged | Installs | Uninstalls | Users | Reviews | Stars | Asked for another fund | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 14 Oct | Nothing yet | 0 | 0 / 0 / 0 | 0 | 0 | 3 | 0 | 1 | 0 | Baseline. GitHub: 115 views from 18 people in the 14 days before |
| 18 Oct | | | | | | | | | | |
| 25 Oct | | | | | | | | | | |
| 1 Nov | | | | | | | | | | |
| 8 Nov | | | | | | | | | | |
| 15 Nov | | | | | | | | | | |
| 22 Nov | | | | | | | | | | |
| 29 Nov | | | | | | | | | | |

### What to ask a user

Ten conversations of about 15 minutes, by voice, each answering positioning.md's *To validate with customers*. Five
come from the first week, two or three from the English-speaking week (the test of point 6), and the rest from whoever
answers a post. People you know will be kind, so every question asks what they did, not what they think of it.

Open with this, and if someone shares their screen, they stop before opening the folder:

> I won't ask what is in your records, and you don't need to tell me.

> לא אשאל מה כתוב ברשומות שלכם, ואין צורך לספר לי.

| Part | Ask | In Hebrew |
|---|---|---|
| Before | When did you last look something up in Maccabi Online? What was it? | מתי בפעם האחרונה חיפשתם משהו במכבי אונליין? מה זה היה? |
| | Which AI apps do you use, and where: phone, browser, desktop app? Do you pay for any? | באילו אפליקציות AI אתם משתמשים, ואיפה: בטלפון, בדפדפן או באפליקציית דסקטופ? אתם משלמים על אחת מהן? |
| The run | Walk me through what happened from when you opened the link. | ספרו לי מה קרה מהרגע שפתחתם את הקישור. |
| First question | What was the first thing you typed? And after that? | מה הדבר הראשון שכתבתם לו? ומה אחר כך? |
| | Did you check any answer against the record it named? | בדקתם תשובה כלשהי מול הרשומה שהוא ציין? |
| Reaction | Did you tell anyone about it? What did you say? | סיפרתם על זה למישהו? מה אמרתם? |
| Keeping | Where is the folder now? Have you opened it since? | איפה התיקייה עכשיו? פתחתם אותה מאז? |

In *The run*, follow up on what they leave out: phone or computer, what they expected **Start export** to do, what they
did during the wait, and what they did with the ZIP. In *Reaction*, don't offer the three answers positioning.md lists:
how they retold it to someone else is the pillar, in their own words.

**The people who stopped.** Whether a member already has a paid desktop app can't be learned from those who ran an
export: the ones without it never got that far. So in the first week, the only one where you know who they are, also
ask five members who got the message and didn't install, or didn't export:

> How far did you get? And which AI apps do you have on your computer?

> עד איזה שלב הגעתם? ואילו אפליקציות AI מותקנות לכם במחשב?

**Fourteen days later**, one message to each person you talked to. "Would you run it again?" is a guess about the
future, and this is what they did:

> Have you opened the folder again since we spoke? What for?

> פתחתם את התיקייה שוב מאז שדיברנו? בשביל מה?

**What to write down**, one row a person, and **not in this repo**: these are notes about real people. No names and
nothing from a record. Only the counts come back here, in the log's *Notes*.

- The assistant apps they had before, and whether they paid.
- How far they got (installed, exported, opened the folder, asked), and where they stuck.
- Their first question, as one of the nine Ask tabs or "other".
- How they retold it, word for word, and which it is: "I finally understand it", "I found something", "I finally have
  everything", or none of them.
- Whether they kept the folder.
- Day 14: whether they opened it again, and what for.

**What decides.** Ten people give a direction, not a share, so the thresholds are set before the first call:

- If one reaction accounts for six or more of the ten, that pillar leads the headline. Otherwise *Wholeness* stays.
- If fewer than half of everyone asked, the people who stopped included, already had a desktop app, *yours to keep*
  gets its picture back on the page (see positioning.md, the end of *Use cases: Ask*).
- The Ask tabs are reordered only if the first questions gather on a tab that isn't among the first three.

## Posts

Drafts. Each is in the developer's voice and is theirs to change: fill what is in square brackets, and cut anything
that isn't true of their own export.

### A message to someone you know

"Are you with Maccabi?" is not a question to ask before the pitch: it is the pitch's first words. One message, opening
on the condition, so a member reads on and nobody else owes a reply. Skip the condition for people whose fund you
know. In a group, a poll ("Which health fund are you with?") finds the members in one message, and its other answers
go in the log's *Asked for another fund*.

> אם אתם במכבי, בניתי משהו בשבילכם: תוסף לכרום, חינמי ובקוד פתוח, ששומר את כל ההיסטוריה שלכם ממכבי אונליין בתיקייה
> אחת במחשב. פותחים אותה ב-Claude או ב-ChatGPT ושואלים כל מה שרוצים. התיק הרפואי שלי חזר עד הינקות. יש לכם עשר
> דקות ליד מחשב? אשמח שתנסו ותספרו לי איפה נתקעתם: https://maccabi.ronirachmani.com/
> (מתקינים בכרום במחשב, לא בטלפון. לא רשמי, ולא קשור למכבי.)
> לא במכבי? אשמח שתעבירו למישהו שכן.

> If you're with Maccabi, I built something for you: a free, open-source Chrome extension that saves your whole
> Maccabi Online history to one folder on your computer. You open it in Claude or ChatGPT and ask anything. My medical
> file went back to when I was a baby. Got ten minutes at a computer? Try it and tell me where you got stuck:
> https://maccabi.ronirachmani.com/
> (It installs in Chrome on a computer, not a phone. Unofficial, and nothing to do with Maccabi.)
> Not with Maccabi? Pass it to someone who is.

After they have run an export, [the conversation above](#what-to-ask-a-user), and then:

> If it was useful, an honest review on the store helps the next person trust it:
> https://chromewebstore.google.com/detail/lmjcbhajlnbpldofejcglcdclceampjp/reviews?utm_source=friends

> אם זה עזר לכם, ביקורת כנה בחנות של כרום תעזור למי שיגיע אחריכם להחליט אם לסמוך על התוסף:
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
> found, or where you got stuck. The link is in the first comment. Not with Maccabi? About one Israeli in four is, so
> you know someone to send it to.
>
> Unofficial: not affiliated with Maccabi Healthcare Services.

First comment: `https://maccabi.ronirachmani.com/`

Day 3, as a comment, answering the question that came up most. If it was about safety:

> A few people asked whether this is safe. The extension talks only to Maccabi Online, in the session you're already
> logged in with, and has no server of its own. The code is public and unminified, so anyone can read what it sends:
> https://github.com/RoniRachmani/health-records-export-for-maccabi

If it was about cost:

> A few people asked what this costs. The extension is free, and nothing in it is for sale. To ask questions, you open
> the folder in the desktop app of Claude, which needs a paid plan, or of ChatGPT, whose free plan includes Work with
> limited usage. The export is yours either way: the PDFs in it open without any assistant, to keep or to take to
> another doctor.

If it was whether this is Maccabi's:

> A few people asked whether this comes from Maccabi. It doesn't: it's unofficial, and not affiliated with or endorsed
> by Maccabi Healthcare Services. It reads your records in the session you logged in to yourself, one request at a
> time. The one thing it does beyond reading is order your full medical file, which Maccabi then prepares for you to
> download.

If it was about the other funds:

> A few people asked about Clalit, Meuhedet and Leumit. Today it works with Maccabi Online only: I built it against
> the one site I can log in to. I'm keeping count of who asks, so tell me which fund you're with. And if you know
> someone with Maccabi, this is one to forward.

Promise nothing for another fund in that last one: the count is what decides, and it goes in the log.

### Hebrew AI groups

Attach the page's dashboard picture or `store/assets/screenshot-1-ask.png`. Write to the group's admin first, with the
post, and post only where they agree. If an admin hasn't answered in two days, that group is a no: move to the next.

The note to the admin, with the whole post under it, so they are agreeing to the words and not to a description of
them:

> שלום [שם], אני רוני, מהקבוצה. בניתי תוסף לכרום, חינמי ובקוד פתוח, ששומר את כל הרשומות ממכבי אונליין בתיקייה אחת
> במחשב, כדי לפתוח אותה ב-Claude או ב-ChatGPT ולשאול עליה. אני לא מוכר בו כלום ואין בו פרסומות. אפשר לפרסם עליו
> פוסט בקבוצה? זה הנוסח המלא, ואם משהו בו לא מתאים לכללי הקבוצה אשנה אותו, או אוותר:
>
> [הפוסט]
>
> הקוד פתוח, למי שרוצה לבדוק: https://github.com/RoniRachmani/health-records-export-for-maccabi

The post:

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
> אשמח לשמוע מה שאלתם ומה קיבלתם. לא במכבי? בטח יש לכם מישהו שכן: שלחו לו.

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

A Facebook group's admin gets the same question as the Hebrew groups', with the post under it:

> Hi [name], I'm Roni, a member of this group and of Maccabi. I built a free, open-source Chrome extension that saves
> a member's Maccabi Online records to a folder on their own computer, so they can ask Claude or ChatGPT about them in
> English. Nothing in it is for sale, and it has no ads. May I post about it here? The whole post is below, and if
> something in it doesn't fit the group's rules I'll change it, or not post.

**r/Israel** gets its own version, two days after the groups, so the two can be told apart in the day's visits. Read
the subreddit's rules on self-promotion first, and ask its moderators if they don't settle it. It is a text post with
no picture, it says who built the thing before anyone asks, and its readers are further from Maccabi than a group of
olim: many don't live in Israel.

Title:

> I'm with Maccabi, and I built a free tool to get all my records out of Maccabi Online and ask about them in English

Body:

> Maccabi Online keeps my records in Hebrew, one page at a time, and only so far back. I wanted all of them in one
> place where I could ask questions, so I built a Chrome extension that does it. It's free and open source, and I'm
> the developer, so read this as a self-post.
>
> You log in to Maccabi Online as usual and press one button. A few minutes later (sometimes as long as 20) there's a
> folder on your computer: your full medical file, and the test results, visit summaries, prescriptions, referrals,
> vaccinations and letters the site has. My medical file went back to when I was a baby.
>
> Then you open the folder in the Claude or ChatGPT desktop app and ask in English: "Am I allergic to any medicine?",
> "What changed in my latest blood tests?", "What should I raise with my doctor on Thursday?". It reads the Hebrew
> and answers in English, and the export asks it to name the record, and the page, behind each answer, so you can
> check it.
>
> Before you click:
>
> - It's unofficial, and has nothing to do with Maccabi Healthcare Services.
> - It installs in Chrome on a computer, not a phone.
> - You log in yourself. The records go from Maccabi Online to your computer, and from there only where you take them.
> - Claude's desktop app needs a paid plan. ChatGPT's free plan includes Work, with limited usage.
> - The assistant explains and suggests. You and your doctor decide.
> - It's Maccabi only, which I know rules out most of you. If you're with Clalit, Meuhedet or Leumit and would want
>   one, say so: I'm counting.
>
> The page, with pictures (every record in them is made up): https://maccabi.ronirachmani.com/
> The code: https://github.com/RoniRachmani/health-records-export-for-maccabi
>
> If you try it, I'd like to hear where you got stuck.

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
