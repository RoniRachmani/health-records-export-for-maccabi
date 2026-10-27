# docs/

What each file here is for, and who reads it. The project's own guides are the [README](../README.md), for members,
and [CONTRIBUTING.md](../CONTRIBUTING.md), for contributors.

## The extension

| File | What it holds | Read it when |
|---|---|---|
| [sections.md](sections.md) | Each line of the popup's section list: its run steps, their parts and the files they write, then how long each takes and how the medical-file wait works | You change `PLAN`, `STAGES`, `WEIGHTS` or a collector. `repoRules.test.ts` checks the table |
| [sms.md](sms.md) | The texts Maccabi sends (the sign-in code, the medical file being ready), what sets each off and what never does | You touch the order or a sign-in |
| [endpoints/](endpoints/) | Every request this repo sends: `endpoints.json` (the collector's, with the file each produces) and `scripts-endpoints.json` (the terminal scripts' own). `scan-baseline.json`, `other-endpoints.json` and `MedDream-endpoints.json` serve the endpoint scan ([its README](../tools/endpoint-scan/README.md)) | You add or change a request. `endpoints.test.ts` fails on one that is missing |
| [releases/](releases/) | Each GitHub release's notes, `<version>.md`, which the *Release* workflow publishes | You release a version |

## For members, and the store

| File | What it holds | Read it when |
|---|---|---|
| [privacy.md](privacy.md), [terms.md](terms.md) | The Privacy Policy and the Terms of Use. `node scripts/policy-pages.mjs` writes `public/privacy.html` and `public/terms.html` from them | Anything changes what the extension reads, keeps or sends |
| [store-listing.md](store-listing.md) | What goes in each tab of the Chrome Web Store dashboard and on YouTube, and what to update when the extension changes | You upload a package, images or a video |

## Marketing

| File | What it holds | Read it when |
|---|---|---|
| [positioning.md](positioning.md) | Who it is for, what it promises and how to say it, the use cases and the demo member. The landing page, the store listing and the film follow it | You write anything a member reads |
| [healthhq-use-cases.md](healthhq-use-cases.md) | Each use case's picture, made-up data, rules and copy, for the chart-gallery artifact | You draw a use case |
| [launch.md](launch.md) | The plan to 50 installs: the calendar, what to measure, the weekly log and the posts | You post, or fill in the log |

[images/](images/) holds the README's screenshot and Google's store badge; CLAUDE.md says what each may and may not
show.
