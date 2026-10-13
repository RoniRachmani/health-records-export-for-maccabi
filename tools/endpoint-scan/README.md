# The endpoint scan

`npm run endpoints` lists what Maccabi Online's own front-end code can call that [endpoints.json](../../docs/endpoints/endpoints.json) does not map.
It signs in the way `npm run live` does (the profile, `.env` and 1Password references in
[CONTRIBUTING.md](../../CONTRIBUTING.md#a-live-run-from-the-terminal)), then reads only static files: the
scripts the `/sonline/` app loads and the chunks they name, and the scripts of the legacy summary page with the
addresses it links to. Each section of the app is a build of its own (`/sonline/MedicalFile/remoteEntry.js` and its
chunks under `/sonline/medicalFile/static/js/async/`), so most of what it finds comes from those. It calls no API: an
unknown call may change something on the account, so a call it prints is a candidate to look at in the site by hand,
not something to try.

It reads the calls themselves, not the strings near them. The site formats a path into a variable
(`"v1/members/{0}/{1}/visits"`) and hands it to its client after the service's base, `rest.get(base, path)`, so the
scan takes each fetch, client call, ajax and XHR open, follows the address to the value just above it, and joins it to
its base. Each candidate comes with its HTTP method, the file, line and column of the call, and how it was found:
`[call]` for a call the scan followed, `[named]` for a string that reads as an address with no call seen (most are
documents the site opens in a tab). A call that is not a `GET` is marked, since it may change something. Where the
site picks an address by a condition (`isV2 ? "v2/…" : "v1/…"`), the call is given once for each side. A call is found
whatever its path looks like: `DirectorshipAPI`'s `eligibilities` has no version and no `members/` in it. A legacy
service (`.asmx`, `.ashx`) whose call could not be read is marked too, as method not read: most of those are `POST`s.

The legacy site's scripts are written by hand, and the scan reads their habits too: a service's address kept at the
top with the method's name added at each call (`ajaxUrl + "GetAllPurchasedPrescription"`), the Angular pages' own
client (`webApi.Call(controller, action, …)`), and the files a `/// <reference path="…">` comment names, one of which
holds `/online/handlers/ajax.ashx`, the default address of a wrapper no page loads. A call the site has commented out
is not read.

It reads the map the other way as well: of the requests `endpoints.json` writes out, how many the code still makes
as calls, how many it only names (the documents the site opens in a tab), and which are not in it at all. One that
drops out of the code is the first sign that the site moved something the export asks for.
`docs/endpoints/scan-baseline.json` lists the seven a default run never finds, and the scan marks any other absent one
`NEW`. `--all` gives the same account of `other-endpoints.json` and `MedDream-endpoints.json`, whose requests to other
sites (the imaging viewer, the public directory) are counted apart: this scan reads the portal's code alone.

Six of the seven are the services and popups of the uploads, hospital-stays and purchased-drugs pages. The scan opens
only the legacy summary page, as the extension does (any legacy page registers the session, so the export asks those
services from there). `--legacy-pages` opens those three pages for their script files, which the extension never does:
it is what a member's click on the menu does, and each page then loads its own data, so it is not the default. It
finds five of the six, and those pages' other calls, their writes among them (`WsPHRManager.asmx/DeleteFile`,
`SaveFile`); the sixth, `GetFileDetails`, is only in a block the site has commented out. The seventh is the
recommendations page, which the code names without `/online/`.

```sh
npm run endpoints                        # the services, API calls and legacy pages endpoints.json does not have
npm run endpoints -- --all               # the mapped ones too, marked, and the app's page routes and service bases
npm run endpoints -- --save ~/scripts    # also the scripts it read, laid out as on the site (a new folder, outside the repository)
npm run endpoints -- --from ~/scripts    # analyze a saved folder again: no browser, no sign-in, a second
npm run endpoints -- --out ~/scan.json   # also everything found, as JSON; --keep leaves the browser open
npm run endpoints -- --rea               # also REA's parser on the files: about four minutes more; --jobs N
npm run endpoints -- --legacy-pages      # also the scripts of three legacy pages the extension never opens
```

A healthy scan reads about a hundred files and fails on a handful, in about a minute and a half, nearly all of it the
sign-in and the pause between files; the reading itself takes a second. When many files "would not load", the site
has changed how it names its chunks: the summary prints a few of the failed addresses, and `--save` keeps the scripts
to read the naming from (site code, not records; still, keep it out of the repository).

`--rea` puts a parser beside the scan's own reader: [REA](https://github.com/morluto/rea) (Reverse Engineer Anything)
parses each script without running it, and a call it parsed with a literal address is marked `[ast]`. It records a
call only when its address is a literal at the call (its own limits say string-built endpoints stay unknown), and this
site builds nearly all of them, so it adds few calls, if any. What it adds is the page routes built in code, with
their wildcards (such as `/medicalFile/**`), a parser's word on how far each file could be read, and the source maps
declared. It runs on this machine, on the script files alone, and is not a dependency of the repository: the first run
fetches `rea-agents` from npm at the version the script names (`REA_BIN` points at an installed one). It takes about
four minutes for the whole app, three groups at a time (`--jobs`).

`endpoint-scan.mjs` is the run, `endpoint-scan-lib.mjs` holds what the scan decides, and
`endpoint-scan.test.ts` runs that on made-up scripts.

To see what a candidate returns, open its section in Maccabi Online yourself with DevTools' Network panel recording,
and read the requests the site sent. A saved capture (`.har`) holds that section's records, the member id and the
session token in the clear: keep it on your machine and delete it when done. `.gitignore` blocks `*.har`.
