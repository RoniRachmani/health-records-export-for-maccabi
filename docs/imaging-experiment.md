# Imaging viewer experiment

An experiment, not a feature: it is in the development build only (`dev:imagingProbe`), and nothing
in the store build or the export changes. It answers one question before anything is built on it:
**can the extension reach the scans behind an `imaging_study` row?**

Today the export says those scans are out of reach, because the site opens them only in its own
viewer. That viewer is MedDream on `meddreamy.maccabi4u.co.il`. The chain from the portal to it was
mapped by [orenyomtov/maccabi-health](https://github.com/orenyomtov/maccabi-health) (MIT, see
`packages/core/src/readers/imaging-viewer.ts` there), from a Node client that keeps its own cookie jar
and reads `Location` headers. An extension can do neither: Chrome owns the cookies, and a
`redirect: 'manual'` fetch is opaque. So the probe tries the two routes that are open:

| Mode | How |
|---|---|
| `fetch` | The extension follows each hop's redirects and reads `response.url`, and posts the two auto-submitting forms (the SAML assertion, then F5's `dummy` nonce) out of the markup. It cannot send the `Referer` the portal's own click sends, and its POSTs carry `Origin: chrome-extension://…`. |
| `tab` | A background tab opens the results lobby, then navigates to the handoff, and Chrome runs the whole chain itself. The extension then reads the viewer with the cookies that left behind, using the `storageId` the viewer page's own requests carried. |

## The chain

1. `GET /sonline/TestResultsAPI/webapi/mac/pdf/members/0/{mid}/meddream/token/<study UID>?checksum=<checksum_id>`
   redirects to `mac.maccabi4u.co.il/imaging/login?…`, a page with an auto-submitting SAML form.
2. `POST meddreamy…/saml/sp/profile/post/acs` with it lands on `/my.policy`, a form with a `dummy` nonce.
3. `POST` the nonce to the same address: redirects to `/`, then to `/?token=<HIS token>`.
4. `GET /his?token=…` grants the study and gives its `storageId`.
5. `GET /studies/<study>/structure?storageId=…`, then per image `/metadata`, `/thumbnail` (a JPEG)
   and `/pixels` (raw, headerless; its length must equal rows × columns × samples × bytes × frames).

The study UID is the `request_id` of the `imaging_study` row in the test list the export already
reads. `checksum_id` is per member, not per study, and is taken from the page's own storage. If it is
not there, the probe stops and says so; `tokenFull: true` then lets it ask
`TokenServerAPI/webapi/mac/v4/members/token/full`, which also returns a session token. That is the kind
of call the repository's rules keep out of the extension, which is why it is opt-in and exists only here.

## Running it

Build and load the development build (`npm run dev`, then load `dist-dev/` unpacked at
`chrome://extensions`). Chrome asks for the added permissions, which only the development build has:
the `cookies` permission and the hosts `mac.maccabi4u.co.il` and `meddreamy.maccabi4u.co.il`.
Log in to Maccabi Online, open any `/sonline/` page, and in its DevTools console define `dev` as in
the README's *Driving a run from the console*, then:

```js
copy(await dev({ type: 'dev:imagingProbe', mode: 'both' }))
```

The reply is on the clipboard. It holds no UID, token, cookie value, name or image, so it can be
pasted into an issue or a chat as it is. Check it before you do.

| Option | Default | Does |
|---|---|---|
| `mode` | `'fetch'` | `'fetch'`, `'tab'`, or `'both'` (fetch first, then tab) |
| `study` | `0` | Which of the member's imaging studies, by position in the test list |
| `pixels` | `true` | Also read the first image's raw pixels and check their length |
| `fresh` | `true` | Delete the viewer host's cookies before each attempt. `false` repeats a run on the cookies the last one left, which is how the Node client's "second run fails" bug showed itself |
| `tokenFull` | `false` | Allow the `TokenServerAPI` fallback for `checksum_id` |
| `download` | `false` | Save the first image's thumbnail to Downloads, to see that it is the scan |
| `keepTab` | `false` | Leave the tab-mode tab open, to look at the viewer |
| `waitMs` | `8000` | How long tab mode lets the viewer page load its study before reading |

## Reading the reply

- `runs.fetch.outcome` / `runs.tab.outcome`: `viewer read` means the thumbnail came back as a JPEG and
  the pixels matched their geometry. Anything else names where the chain stopped.
- `hops[]`: each request's status, where it landed (origin and path with ids masked, query *keys*
  only), content type, size, the input names of any form in the page, and the cookie names Chrome held
  for the login and viewer hosts afterwards.
- `study`: how many studies `/his` granted and whether the one asked for was among them; per series,
  the modality, image count, SOP classes and the `numberOfFrames` values in the structure; for the
  first image, its geometry and the thumbnail and pixel checks.
- `tabUrls` / `viewerRequests` (tab mode): the URLs the tab passed through, and the paths the viewer
  page requested itself.
- `portalAfter`: the status of one member request after the probe, to show the portal session survived.

## What it touches

Everything is a read, the same ones the site's own viewer makes. It also opens and closes a background
tab (tab mode) and, unless `fresh: false`, deletes the viewer host's cookies, which only ends a viewer
session. Nothing is staged or added to an export. With `download: true`, one thumbnail of your own
scan is saved to your Downloads folder.

## Not settled by one run

The Node client read one 8-bit ultrasound study only. CT and MR are 16-bit and may be multi-frame; the
viewer's error responses and how long its tokens last were never seen. One successful run here settles
whether the extension can get in, not what a whole-history export of scans would cost.
