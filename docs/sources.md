# Sources

The outside pages, documents and people this project learned from, and what each one taught it. It was gathered
on 18 November 2026 from what the repo cites and from everything opened, fetched or searched while the project was
built (in Claude Code, Codex and the browser).

**How to read an entry.** *Cited in …* means a file in this repo depends on that source: a policy, a test or a
credit. Don't drop one of those without changing the file that cites it. Every other entry was read, not cited. A
source in Hebrew keeps its own Hebrew title, untranslated. *Checked* gives the date a time-sensitive fact was last
read. Products, plans and availability change, so recheck a fact older than a few months before repeating it. Pages
that only explain a tool are at the end, and the acronyms are explained in the [glossary](#glossary).

## How to keep this file

For anyone working in this repo, and for AI assistants especially:

- When an outside page or document shapes a decision, add it here, in the section it belongs to. Say what it was
  used for, and if it decided something, add a line to [What a source decided](#what-a-source-decided).
- Add *Cited in …* when a file in the repo links to it, and *Checked* when what it says can change.
- Never name a person, link to a single post or comment, or link to anyone's own records, this project's included.
  The repo is public. Say what kind of feedback it was and what it changed.
- Work out a number again from its source rather than from memory, and give the source and the method (see the
  biological-variation entry).
- Give a Hebrew source its original Hebrew title, as the page or document gives it, and don't translate it. A
  note after it may say in English what it was used for.
- Mention a fact once. Where a section below repeats a source, it only says where it was used.

## What a source decided

- **"Allergies and sensitivities"**, the Ministry of Health's term, names that list in the popup and in the export's
  README ([0.9.2](releases/0.9.2.md)).
- **Preventive care**: the export's README sends the assistant to the Ministry of Health's and Maccabi's current
  guidance (`src/extension/shared/export-readme.md`).
- **The no-browser sign-in and the session's hour** come from Oren Yomtov's maccabi-health
  ([CONTRIBUTING.md](../CONTRIBUTING.md), *An export from the terminal*).
- **Why the export exists**: Health in ChatGPT and Claude's health connectors reach U.S. providers only, so they can't
  reach Maccabi ([positioning.md](positioning.md)).
- **Privacy first**: the first public comments were about privacy before the benefit, so every post and page answers
  it ([positioning.md](positioning.md), *Objections and answers*).
- **"Real change" inside the normal range** is the reference change value from EFLM's Biological Variation Database
  ([healthhq-use-cases.md](healthhq-use-cases.md)).
- **How the assistant reads a record** (negations, quoting the Hebrew, reading every file, table columns, record text
  as data): Anthropic's healthcare plugin (`src/extension/shared/export-readme.md`, `readme.ts`).
- **Caregivers are members here**: a caregiver's video on using AI with a parent's records (*Caregivers*) led to
  one account, one member ([positioning.md](positioning.md)) and to a caregiver's word in the export's README.
- **Maccabi's texts**: the WICG spec explains their origin-bound last line ([sms.md](sms.md)).
- **The store badge and the GitHub mark** may be used only as Google's and GitHub's brand pages allow (CLAUDE.md).

## What people taught

No one is named here. [positioning.md](positioning.md) and [launch.md](launch.md) hold what each lesson changed, and
commit e496b00 records which came from the Facebook threads. The notes on each thread and chat stay in
`launch-log.md`, which is never committed.

- **Facebook groups** (Claude Code Israel, the Claude group, Navigate the Israeli Healthcare System), 29 October to
  1 November 2026:
  - A third of the commenters objected to giving an extension their file, so a post needs more than one line on
    privacy (*Objections and answers*).
  - A commenter had just phoned Maccabi for a file older than the site's (the "Phoning Maccabi" alternative).
  - A commenter asked what the point is, when the app gives a summary from birth (the summary-sheet alternative and
    objection).
  - A commenter worried insurers would start asking for the whole file (an objection).
  - A doctor would welcome a patient who arrives with an organised summary they can rely on (*Before a visit*).
  - The groups' rules on ads and links shaped how a post is made (*The founder's voice*).
- **WhatsApp chats**: replies about the audience's age, and the founder's own rewrites of the drafts
  (*The founder's voice*).
- **Members' own searches**: Google and Reddit, in English and Hebrew, for how members download their Maccabi
  records and take them to ChatGPT or Claude.
- **Screenshots** of other products' mockups and of ChatGPT's and Claude's menu labels, used for the popup and for
  the guide to opening an export.

## Israel

What a full export answers to, and the codes the health funds will export in once the Medical Information
Portability Law takes effect. Checked 1 November 2026.

### The Ministry of Health

- [חוק ניוד מידע רפואי, התשפ"ד- 2024 ותכנית הסרטיפיקציה לניוד מידע](https://www.gov.il/he/pages/data-portability-certification-program),
  read chapter by chapter: what a fund's export has to hold. Its
  [earlier address](https://www.gov.il/he/pages/cfb-data-portability-certification-program) (תכנית הסרטיפיקציה לניוד מידע בריאות) is
  gone.
- [נוהל להגשת בקשה לקבלת היתר לניוד מידע רפואי עבור מקבל מידע לפי סעיף 4(א) לחוק ניוד מידע רפואי (PDF)](https://www.gov.il/BlobFolder/guide/data-portability-certification-program/he/units_digital-health_data-portability-certification-program_PDFUA-draft.pdf),
  a draft put out for public comment until 31 May 2026. It covers a provider or public body asking for a permit, not
  a person asking for their own file.
- [מערך הטרמינולוגיה הלאומי](https://www.gov.il/he/pages/medical-terminology-set): the national codes the funds will use, and its
  documents (PDFs):
  - [קידוד אבחנות במסגרת תכנית הסרטיפיקציה לחוק ניוד מידע](https://www.gov.il/BlobFolder/guide/medical-terminology-set/he/units_digital-health_data-portability-law-coding-diagnoses-certification-program-framework.pdf)
    (15 December 2024)
  - [תקציר עיקרי ההסכם מול חברת CA עבור מערכת הבריאות](https://www.gov.il/BlobFolder/guide/medical-terminology-set/he/units_digital-health_ca-agreement-main-points-summary.pdf)
    (October 2024)
  - [הפצת תכני טרמינולוגיה למערכת הבריאות](https://www.gov.il/BlobFolder/guide/medical-terminology-set/he/units_digital-health_terminology-content-distribution.pdf)
    (October 2024)
- [המיזם להטמעת SNOMED CT](https://www.gov.il/he/departments/units/terminology/govil-landing-page), the terminology unit's page, and
  [אגף בריאות דיגיטלית](https://www.gov.il/he/departments/units/digital-health-unit).
- [מדריך מקצועי להתממת מידע רפואי](https://www.gov.il/he/pages/medinfoguide-moh), and
  [the guide itself, 2026 (PDF)](https://www.gov.il/BlobFolder/generalpage/medinfoguide/he/media_media_MedInfoGuide2026.pdf).
- [עקרונות לניהול ולהטמעה של בינה מלאכותית (AI Governance) בארגוני בריאות](https://www.gov.il/he/pages/ai-governance-implementers),
  with its PDFs:
  - [עקרונות לקידום AI Governance בארגוני בריאות](https://www.gov.il/BlobFolder/reports/ai-governance-implementers/he/units_digital-health_AI-Governance-AI-Implementers-Forum-10-2026.pdf)
    (October 2026, version 1)
  - [עקרונות לקידום AI Governance בארגוני בריאות – מצגת מנהלים](https://www.gov.il/BlobFolder/reports/ai-governance-implementers/he/units_digital-health_ai-governance-implementers-prn.pdf)
    (October 2026)
- More from the Ministry: [שירותי בריאות](https://www.gov.il/he/pages/health-services-digital-health-guide),
  [סקירה קצרה אודות הרגולציה הקיימת והמתפתחת בתחומי הדאטה ואמצעים רפואיים דיגיטליים](https://www.gov.il/he/pages/ai-tech),
  [מדריך להערכה כלכלית של שירותי בריאות דיגיטלית](https://www.gov.il/he/pages/guide-economic-evaluation-digital-health-services).

### The Medical Information Portability Law

- The law's text: [חוק ניוד מידע רפואי, תשפ"ד-2024](https://www.nevo.co.il/law_html/law00/229096.htm) on Nevo, which
  includes the July 2025 amendment,
  [חוק ניוד מידע רפואי](https://he.wikisource.org/wiki/חוק_ניוד_מידע_רפואי) on Wikisource, and as published:
  [רשומות, ספר החוקים 3258: חוק ניוד מידע רפואי, התשפ"ד-2024 (PDF)](https://fs.knesset.gov.il/25/law/25_lsr_4715833.pdf)
  (24 July 2024).
- The law in the news:
  - [חוק ניוד מידע רפואי עבר היום בוועדת הבריאות לקראת קריאה שניה ושלישית בכנסת](https://www.gov.il/he/pages/12072024-03), the
    Ministry's announcement
  - [הכנסת אישרה את חוק הניוד: כל מטופל יוכל לקבל את המידע הרפואי מקופת החולים](https://www.maariv.co.il/news/health/Article-1119182),
    Maariv
  - [עדכון בנושא תיקון לחוק ניוד מידע רפואי](https://arnontl.com/he/news/עדכון-בנושא-תיקון-לחוק-ניוד-מידע-רפואי/), Arnon,
    Tadmor-Levy
  - [Outburn on the interoperability law](https://outburn.health/fhir-interoperability-law-in-israel/)

### Israeli FHIR

- [The IL HDP implementation guide 0.4.2](https://get-ig.org/il.hdp.fhir.r4/0.4.2) and
  [the FHIR packages for Israel](https://packages.fhir.org/jurisdictions/IL).
- IL Core's pages in packages2.fhir.org's index, all a 404 by 18 November 2026: the index no longer knows the
  versions read, though [the package](https://packages2.fhir.org/packages/il.core.fhir.r4) still has them (and
  0.22.0, from 17 September 2026). [information buckets](https://packages2.fhir.org/xig/resource/il.core.fhir.r4%7C0.21.0/CodeSystem/CodeSystem-il-hdp-information-buckets.json),
  and its codes for [conditions](https://packages2.fhir.org/xig/il.core.fhir.r4%7C0.16.2/ValueSet/il-core-condition-code),
  [lab tests](https://packages2.fhir.org/xig/il.core.fhir.r4%7C0.17.5/ValueSet/il-core-observation-lab-code) and
  [languages](https://packages2.fhir.org/xig/resource/il.core.fhir.r4%7C0.21.0/ValueSet/ValueSet-vs-il-core-languages.json).
- The FHIR IL community's [Israel Core team](https://www.fhir-il-community.org/fhir-israel-core) and
  [certification overview (PDF)](https://fhir-il-community.org/_files/ugd/3ca9ed_81516f77c9f542cabcbcb737cb865baf.pdf).

### Israel's health system

- [The Commonwealth Fund's profile of Israel's health system](https://www.commonwealthfund.org/international-health-policy-center/countries/israel)
  (data as of January 2026): the four funds under the 1995 law, and the portability law expected in July 2027. It
  says nothing on members downloading their own records.
- [קבלת מידע מהרשומה הרפואית (הליך)](https://www.kolzchut.org.il/he/%D7%A7%D7%91%D7%9C%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%9E%D7%94%D7%A8%D7%A9%D7%95%D7%9E%D7%94_%D7%94%D7%A8%D7%A4%D7%95%D7%90%D7%99%D7%AA), Kol Zchut
- [Chambers on data protection and privacy in Israel, 2026](https://chambers.com/practice-guides/guides/data-protection-privacy-2026/israel/law-and-practice)
- [חברות בקופת חולים 2025 (PDF)](https://www.btl.gov.il/Publications/survey/Documents/pirsumhaverut2025.pdf), the
  National Insurance Institute (March 2026), for each fund's share of members

## Maccabi

The site the extension exports from, its rules, and what Maccabi says about its own AI. Read September to
November 2026.

- [תנאי השימוש באתר מכבי שירותי בריאות](https://www.maccabi4u.co.il/23085/policies_and_procedures/terms_of_use/) and
  [אבטחת מידע ותנאי שימוש - שירותים מקוונים](https://www.maccabi4u.co.il/31276/digital-services/data_security_terms/online_services/).
  Cited in [terms.md](terms.md). Also [תנאי שימוש](https://terms.maccabi4u.co.il/terms/terms.html), for the online
  services and the app.
- [תשאלו את Aia - נציגת ה-AI של מכבי](https://www.maccabi4u.co.il/31276/digital-services/aia/): what Maccabi's AI representative can and
  can't do yet ([positioning.md](positioning.md)).
- [אפליקציית מכבי - הדור הבא](https://www.maccabi4u.co.il/31276/digital-services/maccabi-app/) (and
  [in English](https://www.maccabi4u.co.il/en/46562/main_english/maccabi-app/)), and the app's reviews on
  [Google Play](https://play.google.com/store/apps/details?id=com.ideomobile.maccabi&hl=en&gl=IL) and the
  [App Store](https://apps.apple.com/il/app/id379119093?see-all=reviews). On Google Play (3.3 stars, 20.5K reviews,
  read 19 November 2026), few of the newest reviews are about records: one in thirty says lab results leave out tests,
  a few older ones can't find results since the redesign, and none asks for a download. Appointments and crashes lead.
- Maccabi's other pages:
  - [שירותים דיגיטליים](https://www.maccabi4u.co.il/31276/digital-services/)
  - [צפייה והדפסה של התיק הרפואי באתר מכבי Online – תנאי הזכאות](https://www.maccabi4u.co.il/eligibilites/21602/)
  - [הפקת דו"ח רפואי מרכז בשפה האנגלית](https://www.maccabi4u.co.il/31276/digital-services/info/english_report/)
  - [איתור רופאים/ות](https://serguide.maccabi4u.co.il/heb/doctors/)
  - in English: the [home page](https://www.maccabi4u.co.il/en/46562/main_english/) and
    [About Maccabi](https://www.maccabi4u.co.il/en/46562/main_english/our-healthcare-system/about/)
- Press on Maccabi's AI:
  - [מכבי שירותי בריאות השיקה מערכת AI לחוויית מטופל](https://www.pc.co.il/news/%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA-%D7%93%D7%99%D7%92%D7%99%D7%98%D7%9C%D7%99%D7%AA/441244/)
    (25 November 2025: a WhatsApp companion for new members, built on Microsoft's Copilot Studio, with no access to
    the member's records) and [כך משתלבת הבינה המלאכותית היוצרת במכבי שירותי בריאות](https://www.pc.co.il/featured/422986/), People &
    Computers
  - [אפליקציית מכבי החדשה: עוזרת AI אישית והתראות חכמות](https://www.ice.co.il/digital-140/news/article/1106404), ice
  - ["מערכת 'קוקפיט AI' של מכבי - שדרוג בעולם הבריאות הדיגיטלית"](https://www.haaretz.co.il/labels/health/doctors2026/2026-01-28/ty-article-labels/0000019c-0427-daca-a1fd-f4eff95f0000),
    Haaretz (sponsored, in partnership with Maccabi)
- [ACRI: make Maccabi Online available in Arabic](https://www.english.acri.org.il/post/make-maccabi-online-health-services-available-in-arabic).

### How the site works

- Maccabi Online itself, read for how it works. Every request is in [endpoints/](endpoints/).
- [WICG: origin-bound one-time codes delivered via SMS](https://wicg.github.io/sms-one-time-codes/), which explains
  the last line of Maccabi's sign-in text. Cited in [sms.md](sms.md).
- [REA (Reverse Engineer Anything)](https://github.com/morluto/rea), the endpoint scan's second parser. Cited in
  [the scan's README](../tools/endpoint-scan/README.md).

## OpenAI

What OpenAI's health features do and where they work, and how ChatGPT Work and Codex open a folder, which the
export's README is written for.

### Health in ChatGPT

Checked 23 September 2026, and who can use it again 12–13 October and 18 November.

- OpenAI's announcements: [Introducing ChatGPT Health](https://openai.com/index/introducing-chatgpt-health/)
  (7 January 2026) and [Launching Health in ChatGPT](https://openai.com/index/health-in-chatgpt/), the U.S. rollout
  (23 July 2026).
- The product: [chatgpt.com/health](https://chatgpt.com/health/), and
  [the Health plugin](https://chatgpt.com/plugins/plugin_connector_1p_e569f8b8dfd08191903c9bd2cd7da9ac) among
  [ChatGPT's plugins](https://chatgpt.com/plugins).
- OpenAI's help center: [the Health in ChatGPT article](https://help.openai.com/en/articles/20001036-health-in-chatgpt),
  [ChatGPT for Healthcare](https://help.openai.com/en/articles/20001046-chatgpt-for-healthcare),
  [healthcare public data in ChatGPT and Codex](https://help.openai.com/en/articles/20001489-using-healthcare-public-data-in-chatgpt-and-codex).
- Press on the January announcement, when it was early access outside the EEA, Switzerland and the UK, with records
  in the U.S. only: [CNBC](https://www.cnbc.com/2026/01/07/openai-chatgpt-health-medical-records.html),
  [STAT](https://www.statnews.com/2026/01/08/openai-invites-you-to-upload-medical-records-to-chatgpt/) (paywalled after
  the opening), Fierce Healthcare on [the announcement](https://www.fiercehealthcare.com/ai-and-machine-learning/openai-launches-chatgpt-health-connect-data-health-apps-medical-records)
  and [eesel.ai](https://www.eesel.ai/blog/chatgpt-health) (modified in October, but still the January text).
- Press on the U.S. launch of 23 July, for U.S. users aged 18 and over on web and iOS, and not in Codex:
  [TechCrunch](https://techcrunch.com/2026/07/23/openai-makes-chatgpt-health-available-to-all-u-s-users/),
  Fierce Healthcare on [the wide release](https://www.fiercehealthcare.com/ai-and-machine-learning/openai-makes-health-chatgpt-widely-available-moving-deeper-consumer-health),
  [gHacks](https://www.ghacks.net/2026/07/25/openai-launches-health-in-chatgpt-for-us-users-connecting-apple-health-and-medical-records/),
  [How2Shout](https://www.how2shout.com/news/chatgpt-health-apple-health-medical-records.html),
  [CBS News on the risks](https://www.cbsnews.com/news/chatgpt-health-medical-records-advice-expert-risks/).
- Press on who still can't use it: [Analytics Insight](https://www.analyticsinsight.net/news/chatgpt-health-rolls-out-to-us-users-why-india-and-other-regions-still-have-to-wait),
  [Notebookcheck](https://www.notebookcheck.net/ChatGPT-now-reads-health-data-just-not-in-Germany.1350736.0.html),
  [Digit](https://www.digit.in/news/general/chatgpt-health-is-now-out-of-waitlist-but-many-users-still-cannot-use-it-here-is-why.html).

### ChatGPT Work and Codex

Checked 3 October 2026. OpenAI changes these pages often (the help article on Work and Codex changed again on
17 November), so recheck before relying on a plan, a limit or a model name.

- The product: [chatgpt.com/work](https://chatgpt.com/work/), and OpenAI's
  [business page on plugins for ChatGPT and Codex](https://openai.com/business/plugins/), which sells to workspaces.
- OpenAI's help center: [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex),
  [uploading files and audio](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt),
  [data controls](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt) and
  [keeping history while turning training off](https://help.openai.com/en/articles/8983130-what-if-i-want-to-keep-my-history-on-but-disable-model-training)
  (it now opens *Data controls*), for the training opt-out in [positioning.md](positioning.md).
- ChatGPT's learning docs, on how Work opens a folder:
  - [getting started with Work](https://learn.chatgpt.com/docs/get-started-with-work), [the quickstart](https://learn.chatgpt.com/docs/quickstart.md),
    [the app](https://learn.chatgpt.com/docs/app), [the web](https://learn.chatgpt.com/docs/web),
    [using ChatGPT](https://learn.chatgpt.com/docs/use-chatgpt), [the Linux app](https://learn.chatgpt.com/docs/linux/linux-app)
  - [projects](https://learn.chatgpt.com/docs/projects), [memories](https://learn.chatgpt.com/docs/customization/memories),
    [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
    [permission modes](https://learn.chatgpt.com/docs/permission-modes), [building skills](https://learn.chatgpt.com/docs/build-skills)
  - Work's [local](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security) and
    [cloud](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security) security,
    [pricing](https://learn.chatgpt.com/docs/pricing), [usage and cost](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-usage-and-cost)
- [Codex's AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md) (it now opens the AGENTS.md page above), and
  [openai/codex#45494](https://github.com/openai/codex/issues/45494).
- Guides by others: [bigprompthub on Work's local folders](https://www.bigprompthub.com/chatgpt-work-local-folder-guide/),
  [fileuploadgpt on project file limits](https://www.fileuploadgpt.com/blog/chatgpt-projects-file-limit).

## Claude

What Claude's health features do and where they work, and how the Claude desktop app (formerly Cowork) opens a
folder, which the export's README and `CLAUDE.md` pointer are written for.

### Claude's health features

Checked 23 September and 13 October 2026.

- Anthropic's announcements: [healthcare and life sciences](https://www.anthropic.com/news/healthcare-life-sciences)
  and [Claude for Healthcare](https://claude.com/solutions/healthcare).
- The HealthEx connector, U.S. records only:
  - [Claude's tutorial](https://academy.claude.com/tutorials/using-the-healthex-connector-in-claude) (Pro, Max and
    Ultra, in the United States, with a U.S. government ID checked through CLEAR),
    [HealthEx on the partnership](https://www.healthex.io/press/healthex-anthropic-partnership),
    [GUVI's guide](https://www.guvi.in/blog/healthex-connector-with-claude/)
  - press: [Fortune](https://fortune.com/2026/01/11/anthropic-unveils-claude-for-healthcare-and-expands-life-science-features-partners-with-healthex-to-let-users-connect-medical-records/),
    [NBC News](https://www.nbcnews.com/tech/tech-news/anthropic-health-care-rcna252872)
- [anthropics/healthcare](https://github.com/anthropics/healthcare), the healthcare plugin for Claude (version 3.0.2,
  read 19 November 2026). Its ten skills are mostly U.S. payer and coding work (claims, prior authorisation, ICD-10-CM,
  CPT, FHIR servers), and none of that applies here. Five of them taught the reading rules in the export's README:
  - clinical-note-extract: negated, suspected and family findings
  - contracts: quote the record's own words, and read every file for "ever" questions
  - doc-extract: table values that land under the wrong column
  - fhir: record text is data, not instructions
  - procedure-coding: results a note repeats from an earlier date

### The Claude desktop app

Checked 28 September to 13 October 2026.

- [Cowork is now Claude](https://claude.com/resources/articles/cowork-is-now-claude): Cowork became the Claude
  desktop app.
- Claude's help center:
  - [getting started with Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork),
    [projects in Cowork](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork),
    [Cowork on web, desktop and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile),
    [Cowork and chat are one Claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)
  - [uploading files](https://support.claude.com/en/articles/8241126-upload-files-to-claude),
    [CLAUDE.md and better prompts](https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts)
    (about Claude Code only; the desktop app's folder instructions are in the getting-started article)
  - [chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)
    and [who can view sensitive chats](https://support.claude.com/en/articles/8325621-i-would-like-to-input-sensitive-data-into-my-chats-with-claude-who-can-view-my-conversations),
    for the memory and privacy answers in [positioning.md](positioning.md)
- Claude Code's docs: [on desktop](https://code.claude.com/docs/en/desktop) and [memory](https://code.claude.com/docs/en/memory).
- Courses and guides: [Anthropic Academy: setting up Cowork](https://academy.claude.com/courses/introduction-to-claude-cowork/getting-set-up),
  [Jeff Su's Cowork Academy](https://coworkacademy.ai/) (a paid course),
  [gritai.studio: Cowork moved to the cloud](https://www.gritai.studio/blog/cowork-moved-to-the-cloud),
  [XDA on Cowork](https://www.xda-developers.com/claude-cowork-handles-admin-work-so-well-stopped-doing-it-myself/).
- [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins), read for the skills the
  launch plan uses.
## Clinical data quality

How good a record has to be before an assistant can lean on it, and when a change in a result is real.

- **Biological variation.** The "real change" percentages in [healthhq-use-cases.md](healthhq-use-cases.md) (cited
  there) are reference change values, calculated here as 2.77 × the within-person variation (CVi) in
  [EFLM's Biological Variation Database](https://biologicalvariation.eu/meta_calculations), with the lab's own
  variation left out. That is the classic, symmetrical formula; EFLM's own calculator uses an asymmetrical one that
  counts the lab's variation too, so its figures differ a little. Checked 18 November 2026, against meta-analyses
  updated 10 August 2026:

  | Test | CVi | Real change |
  |---|---|---|
  | Potassium | 4.0% | 11% |
  | Blood sugar | 4.9% | 14% |
  | Good cholesterol | 5.7% | 16% |
  | Platelets (EFLM: Thrombocytes) | 7.2% | 20% |
  | ALT | 12.4% | 34% |

  They were first taken, uncited, from [Westgard's 2014 database](https://www.westgard.com/clia-and-quality-regulation-requirements/quality-requirements/biodatabase1.html)
  (Ricós et al.), which EFLM replaced in 2019 and whose figures were higher.
- HL7 PIQI: [the implementation guide](https://build.fhir.org/ig/HL7/piqi/en/) ([its artifacts](https://build.fhir.org/ig/HL7/piqi/en/artifacts.html)),
  [the September 2025 ballot](https://hl7.org/xprod/ig/uv/piqi/2025Sep/index.html) and
  [its background](https://hl7.org/xprod/ig/uv/piqi/2025Sep/background.html).
- Clinical Architecture, whose people wrote PIQI before HL7 took it up: [the company](https://clinicalarchitecture.com/),
  [PIQXL Gateway](https://clinicalarchitecture.com/piqxl-gateway/) (its PIQI product) and
  [Symedical](https://clinicalarchitecture.com/symedical) (its terminology product).
- [MedCity News on clinical data quality and AI](https://medcitynews.com/2025/10/the-future-of-ai-in-healthcare-depends-on-clinical-data-quality-assessment/)
  (sponsored, 7 October 2025).

## Similar projects

Others who export, read or keep health records. Each entry says what the project does (from its own description),
its state, and how deeply it was read: *studied* means its code or documents were read and compared with this
project; *from a search* means it turned up in the web search of 24 September 2026 and was not studied, so don't
cite it as a reference. States were checked on 18 November 2026.

### maccabi-health

- [orenyomtov/maccabi-health](https://github.com/orenyomtov/maccabi-health): your Maccabi records through a command line, an MCP
  connector or an SDK (MIT, active). *Studied* and tested, and checked again on 14 October 2026 at version 0.1.6.
  Cited in [CONTRIBUTING.md](../CONTRIBUTING.md) and [positioning.md](positioning.md). Read:
  - [AUTH.md](https://github.com/orenyomtov/maccabi-health/blob/main/docs/AUTH.md) and
    [SESSION-LIFETIME.md](https://github.com/orenyomtov/maccabi-health/blob/main/docs/research/SESSION-LIFETIME.md), the sign-in
    chain and the session's hour this project's no-browser sign-in follows (both cited in CONTRIBUTING.md)
  - its [issues](https://github.com/orenyomtov/maccabi-health/issues) and its
    [imaging-viewer reader](https://github.com/orenyomtov/maccabi-health/blob/main/packages/core/src/readers/imaging-viewer.ts)
  - its listing [on Glama](https://glama.ai/mcp/servers/orenyomtov/maccabi-health)

The closest alternative, and it serves a different person: someone at home in a terminal who wants today's records
on demand, where this project is one button and a folder to keep ([positioning.md](positioning.md)).

### Israel

- [Urigo/liberate-labs](https://github.com/Urigo/liberate-labs): blood test results out of Maccabi and Blueprint into SQLite, a
  trends dashboard and Apple Health, with Claude skills (MIT, active). *Studied*, asked "what can we learn from". It
  now tells Maccabi members to use this extension rather than scrape the site, and reads its exports
  (`--maccabi-export`).
- [netanelavr/clalit-mcp](https://github.com/netanelavr/clalit-mcp): a command line and MCP connector for your own Clalit labs,
  prescriptions and lab orders, read-only (MIT, active). *Studied*. Its `export` writes a folder whose layout, its
  README says, is modeled on this project's.
- [AssafR/ClalitData](https://github.com/AssafR/ClalitData): merges the CSVs of Clalit results a member exported from the site
  (last updated 2022). *From a search*.
- Two agent skills that check a medicine's stock at pharmacies before you go:
  [alexpolonsky/agent-skill-maccabi-pharm-search](https://github.com/alexpolonsky/agent-skill-maccabi-pharm-search) for Maccabi
  (MIT) and [tomron/agent-skill-clalit-pharm-search](https://github.com/tomron/agent-skill-clalit-pharm-search) for Clalit (both
  2026). *From a search*.

Maccabi's and Clalit's members are building their own ways out, each for a part of the record (results,
prescriptions, pharmacy stock), not the whole of it.

### U.S. exporters

- [Greenband1/biomarker_chrome_extension](https://github.com/Greenband1/biomarker_chrome_extension/): a Chrome extension that
  exports current and past Function Health blood test results (2026). *Studied* (its README and files). The
  nearest in form to this extension: an extension, a portal, an export.
- [jmandel/mychart-takeout](https://github.com/jmandel/mychart-takeout): all of your own data from an Epic MyChart portal, run in
  your browser with the data kept local, as a bookmarklet, a command line or a Chrome extension, with a
  `PATIENT_SUMMARY.md` at the root (active). *Studied*, asked "what can we
  learn from".
- Connecting an assistant to MyChart, all *from a search*:
  - [Fan-Pier-Labs/openrecord](https://github.com/Fan-Pier-Labs/openrecord): lets Claude read and manage MyChart records, and write
    (refills, messages), as a Claude Desktop extension, an iOS app and a command line (active), and its fork
    [rnbarnwell/epicMychartConnector](https://github.com/rnbarnwell/epicMychartConnector)
  - [tonyGePT/mychart-bridge](https://github.com/tonyGePT/mychart-bridge): a self-hosted MCP bridge on openrecord's engine
  - [beenlouis/mychart-mcp](https://github.com/beenlouis/mychart-mcp): a read-only MCP connector for MyChart's patient FHIR API
  - [kriskraw80/mychart-mcp-server](https://github.com/kriskraw80/mychart-mcp-server): an MCP server that lists and downloads your
    own test results (MIT)
  - [jmandel/health-skillz](https://github.com/jmandel/health-skillz): a Claude skill that connects to records through SMART on
    FHIR, by mychart-takeout's author
  - [HealthcareBuddy/my-chart-helper](https://github.com/HealthcareBuddy/my-chart-helper): a Chrome side panel for MyPennMedicine
    that downloads visit documents and opens them in ChatGPT (last updated 2024)
- [hugooc/OpenKP](https://github.com/hugooc/OpenKP): an MCP bridge between Claude and Kaiser Permanente's patient portal, with
  read and write tools (2026).
  *From a search*.

Most connect an assistant to the portal live. The two studied ones, like this project, export once and keep the
data on the member's computer.

### Other countries

All *from a search*.

- [JCrossman/ab-health-mcp](https://github.com/JCrossman/ab-health-mcp): an MCP server for Alberta's My Health Records, used from
  Claude Desktop (MIT, active).
- [c3po-initiative/dhroxy](https://github.com/c3po-initiative/dhroxy): a proxy that serves Denmark's Sundhed.dk as FHIR (Apache-2.0,
  active).
- [hisham-stack/1177-export](https://github.com/hisham-stack/1177-export): your own records and messages from Sweden's 1177.se,
  as Markdown and JSON, signed in by hand with BankID (MIT, active).
- [openEHDS/OpenePA](https://github.com/openEHDS/OpenePA): an open-source version of Germany's electronic health record, the ePA
  (last updated April 2024).
- [kundakarlabp/NIMS-Chrome](https://github.com/kundakarlabp/NIMS-Chrome): a Chrome extension for a hospital's results system
  (NIMS), for clinicians rather than patients; the country is not stated.
- [sw181688-sys/personal-health-record-exporter](https://github.com/sw181688-sys/personal-health-record-exporter): personal health
  information from a "MyHealth" site, through a hospital's patient API; the country is not stated (MIT).

### Keeping and charting records

Where records go after an export: an app that stores or shows them on your own computer. All *from a search*.

- [fastenhealth/fasten-onprem](https://github.com/fastenhealth/fasten-onprem): a self-hosted medical record manager for a person
  or a family (archived February 2026, GPL-3.0).
- [jgerton/health-dashboard](https://github.com/jgerton/health-dashboard): a records viewer that keeps everything in your browser
  (2026).
- [nobhad/health-ledger](https://github.com/nobhad/health-ledger): your records on your own computer, local-first (2026).
- Device data, which comes from a device rather than a health fund:
  [domien-f/carelink-bridge](https://github.com/domien-f/carelink-bridge) (MIT) and
  [ondrej1024/carelink-python-client](https://github.com/ondrej1024/carelink-python-client) (AGPL-3.0), for Medtronic CareLink's
  pump and glucose-sensor data (both 2026).
- Nearby: [the-momentum/open-wearables](https://github.com/the-momentum/open-wearables), a self-hosted platform that puts wearable
  data behind one API (MIT, active), and
  [Apple's health features with Apple Intelligence](https://www.apple.com/newsroom/2026/09/apple-advances-health-and-fitness-capabilities-using-apple-intelligence/).
- More: [awesome-healthcare-mcp-servers](https://github.com/rdmgator12/awesome-healthcare-mcp-servers), a curated list of
  healthcare MCP servers (CC0).

### Caregivers

- [My Mom Has Cancer Again. Here's How I'm Using AI to Fight It](https://www.youtube.com/watch?v=Ddc5NFNnCfE), a
  caregiver's video on keeping a parent's records, a one-page family brief and appointment questions with an AI
  assistant (its transcript read 19 November 2026; the skill it links was not found on GitHub). Asked "what can we
  learn from".

### Outside health

Exports and products in other fields, *studied* for what they do well.

- How LinkedIn, Facebook and Instagram build the data exports they send a member, read from those files.
- [Financy · חברו את ה-AI שלכם לכסף שלכם](https://financy.open-finance.ai/). Asked "what can we learn
  from".
- [better-rail/app](https://github.com/better-rail/app): an alternative app for Israel Railways (AGPL-3.0, active). Asked "what can
  we learn from".

## Rules the project is held to

The rules the extension, its listing and its pages are held to.

### The Chrome Web Store

- The store's [program policies](https://developer.chrome.com/docs/webstore/program-policies): privacy, limited use,
  data handling, permissions, disclosure, listing requirements, impersonation and intellectual property, minimum
  functionality, deceptive installation tactics, MV3 requirements, quality guidelines, and the
  [user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) (cited in the
  [Privacy Policy](privacy.md)).
- The store's guides: [best listing](https://developer.chrome.com/docs/webstore/best-listing),
  [best practices](https://developer.chrome.com/docs/webstore/best-practices),
  [images](https://developer.chrome.com/docs/webstore/images),
  [branding](https://developer.chrome.com/docs/webstore/branding) (cited in CLAUDE.md, for the badge),
  the dashboard's [listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) and
  [privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) tabs,
  [publish](https://developer.chrome.com/docs/webstore/publish), [metrics](https://developer.chrome.com/docs/webstore/metrics)
  and [the analytics revamp](https://developer.chrome.com/blog/cws-analytics-revamp),
  [user data](https://developer.chrome.com/docs/webstore/user_data) (now the user data FAQ),
  [troubleshooting](https://developer.chrome.com/docs/webstore/troubleshooting), [the API](https://developer.chrome.com/docs/webstore/using-api).

### Brands

- GitHub's mark: [logo guidelines](https://brand.github.com/foundations/logo) (cited in CLAUDE.md),
  [the logos](https://github.com/logos) (now the logo guidelines), [logo policy](https://docs.github.com/en/site-policy/other-site-policies/github-logo-policy),
  [Primer's octovisuals](https://primer.style/foundations/icons/octovisuals) (the page is gone: it now opens Primer's home page).
- The fonts are under [Making the film and the store images](#making-the-film-and-the-store-images).

### Accessibility and conduct

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): AA contrast and the 24px target size (2.5.8), which the popup, the
  landing page and the design audits are held to.
- [Contributor Covenant](https://www.contributor-covenant.org/) 2.1. Cited in the
  [Code of Conduct](../.github/CODE_OF_CONDUCT.md).

## Tools

Read for how to use a tool, not for anything the project says.

### Building the extension

- The libraries that ship: [fflate](https://github.com/101arrowz/fflate) and [Vite](https://github.com/vitejs/vite).
  Cited in [third-party-notices.txt](../public/third-party-notices.txt).
- Chrome extensions: [the MV3 overview](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-overview) (it now
  opens the migration guide),
  [migrating](https://developer.chrome.com/docs/extensions/develop/migrate), [security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure),
  [permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings),
  [tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs), [sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel),
  [identity](https://developer.chrome.com/docs/extensions/reference/api/identity), [OAuth](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth),
  [WebSockets](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets),
  [bfcache and extension messaging](https://developer.chrome.com/blog/bfcache-extension-messaging-changes),
  [DevTools' back/forward cache](https://developer.chrome.com/docs/devtools/application/back-forward-cache).
- The web: [web.dev on bfcache](https://web.dev/articles/bfcache), MDN on
  [pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event) and
  [unload](https://developer.mozilla.org/en-US/docs/Web/API/Window/unload_event),
  [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview),
  [Puppeteer and extensions](https://pptr.dev/guides/chrome-extensions).

### Running the repo

- GitHub:
  - [repository best practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories),
    [securing a repository](https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository),
    [secret validity checks](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/customize-leak-detection/enable-validity-checks)
  - [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
    ([how to use them](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/use-immutable-releases), now a 404)
  - Actions: [the GITHUB_TOKEN](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token),
    [Dependabot's read-only workflows](https://github.blog/changelog/2021-02-18-github-actions-workflows-triggered-by-dependabot-prs-will-run-with-read-only-permissions/)
  - the REST API's [Actions permissions](https://docs.github.com/en/rest/actions/permissions) and
    [repositories](https://docs.github.com/en/rest/repos/repos)
- [1Password CLI](https://www.1password.dev/cli/get-started),
  [GoatCounter's pixel](https://www.goatcounter.com/help/pixel) (the landing page's counter, named in the
  [Privacy Policy](privacy.md)) and its [privacy policy](https://www.goatcounter.com/help/privacy) (no cookies, and the
  IP address and User-Agent are never stored), [Vercel's production checklist](https://vercel.com/docs/production-checklist),
  read for the landing page.

### Making the film and the store images

- [Introducing Personal Finance in Claude](https://www.youtube.com/watch?v=UTubvRLX2j4), the film whose format the
  promo film follows.
- [ElevenLabs](https://elevenlabs.io/docs/overview/models), for the film's voice and sound:
  - speech, dialogue, music and [composition plans](https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans),
    sound effects, [forced alignment](https://elevenlabs.io/docs/overview/capabilities/forced-alignment),
    [Eleven v4](https://elevenlabs.io/v4)
  - pricing, [publishing what it makes](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform),
    and press on its music and v4 models
- Fonts: Heebo ([Google Fonts](https://fonts.google.com/specimen/Heebo/about),
  [OdedEzer/heebo](https://github.com/OdedEzer/heebo)) and Roboto ([google/fonts](https://github.com/google/fonts/tree/main/ofl/roboto)).

## Glossary

- **CVi**: within-person biological variation, how much a test's result moves in a healthy person from one test to
  the next.
- **CWS**: the Chrome Web Store.
- **EFLM**: the European Federation of Clinical Chemistry and Laboratory Medicine, which keeps the Biological
  Variation Database.
- **FHIR**: HL7's standard for exchanging health records. **IL Core** is its Israeli base profile.
  **IL HDP** is the Israeli health data portability guide built on IL Core.
- **Glama**: an AI workspace that keeps a directory of MCP servers.
- **HL7**: the standards body behind FHIR and PIQI.
- **LOINC** and **SNOMED CT**: international code systems, for lab tests and for clinical terms.
- **MCP**: the Model Context Protocol, which lets an AI assistant call a tool, such as a connector to an account.
- **MV3**: Manifest V3, the current format for Chrome extensions.
- **PIQI**: Patient Information Quality Improvement, HL7's framework for scoring how usable a record is.
- **RCV**: reference change value, the smallest difference between two results that is more than normal variation.
  2.77 × CVi when the lab's own variation is left out.
