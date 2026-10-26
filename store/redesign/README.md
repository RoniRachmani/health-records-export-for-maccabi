# Chrome Web Store artwork

The approved design is now the default for `npm run store-assets`, `npm run release`, and the *Store images*
GitHub workflow. Production files live in `store/assets/`, with ordinary filenames and no review flag.

[Review the production images](../assets/review.html) · [Download eight PNGs](../assets/store-artwork.zip) (after a local render; not committed) ·
[Dimensions and SHA-256 hashes](../assets/store-artwork.json) · [Historical comparison](mock-review.html)

## Generate and check

From the repository root, with Node.js 22 or newer and dependencies installed using `npm ci`:

```sh
npm run store-assets
node scripts/check-store-assets.mjs
```

The renderer builds the local Vite stage, serves it on localhost and captures HTML/CSS and SVG layouts in headless
Chrome. Chrome, Chromium or Edge must be installed; `CHROME_PATH` overrides discovery. A restricted environment may
require permission to listen on localhost and launch Chrome. Render on a Mac without Roboto installed: the Roboto-first
stacks then fall back to the macOS system face, which is the chosen look and which Linux CI cannot draw. No fonts are fetched by the
extension, and no AI service, API key, login or real medical records are needed to regenerate the artwork.

Rerender when the artwork's copy, illustration, layout, shared mark or popup changes. An unrelated extension release
does not require new images. Updating the listing images alone needs neither a new package nor a version bump.

## Outputs and upload order

All paths below are relative to `store/assets/`.

| Field | PNG | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128 × 128, transparent padding |
| Screenshot 1 | `screenshot-1-ask.png` | 1280 × 800 |
| Screenshot 2 | `screenshot-2-whole.png` | 1280 × 800 |
| Screenshot 3 | `screenshot-3-advice.png` | 1280 × 800 |
| Screenshot 4 | `screenshot-4-start.png` | 1280 × 800 |
| Screenshot 5 | `screenshot-5-open.png` | 1280 × 800 |
| Small promo tile | `promo-small-440x280.png` | 440 × 280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400 × 560 |

`store-artwork.zip` contains exactly these eight PNGs. `store-artwork.json` records their dimensions, shot names and
SHA-256 hashes. Screenshots and promo tiles are opaque RGB; the icon is RGBA. Upload the images to their matching
fields, with screenshots in the numbered order. The artwork ZIP is not an extension package. The *Store images*
workflow validates the bundle, pushes changed canonical files to a `store-images/` branch and offers the ZIP and
hash manifest as an artifact.
See [the listing guide](../../docs/store-listing.md#graphic-assets) for content descriptions and store fields.

## Named renders and other images

```sh
npm run store-assets -- start open     # progress and completed popup screenshots
npm run store-assets -- promo marquee  # promo tiles
npm run store-assets -- icon           # approved padded store icon
npm run store-assets -- poster         # video poster, drawn by the video's own page
npm run store-assets -- og-site social # landing-page preview and approved marquee at GitHub size
npm run store-assets -- --list         # available shot names, filenames and dimensions; no browser needed
npm run icons                         # packaged toolbar icons only; the store icon is the `icon` shot
```

A default render includes the eight listing PNGs, video poster and two link previews. A partial render updates only
its selected images; when one of them is a listing image it rewrites the bundle, and stops if any of the eight is missing. Unknown shot names
fail before launching Chrome, even if a valid name is also supplied. The ZIP is gitignored and its timestamps change
between renders; compare the PNGs or ZIP entries rather than the container's bytes.

The packaged icons in `public/icons/` retain their existing geometry and hand-tuned small sizes. `scripts/make-icons.mjs`
generates those only, and `npm run icons` runs just that; the store icon is `npm run store-assets -- icon`, which needs Chrome.
The store icon and packaged icons share the same mark, with different canvas scale, padding and rasterization.

## Source and design rules

- `store/design/listing.mjs` holds the eight layouts and vector illustration. `listing.css` holds the approved CSS,
  one rule per selector, including shared design tokens and the alignment grid. `store/src/listing.html` is the page
  they are drawn on.
- `scripts/store-assets.mjs` selects shots and writes canonical PNGs, the review page, manifest and ZIP.
  `scripts/store-listing.mjs` captures the approved layouts.
- `scripts/store-auxiliary.mjs` retains the separate video-poster and landing-page-preview recipes. The social preview
  uses the approved marquee at its own dimensions.
- `store/design/glyphs.mjs` supplies the canonical outlined folder mark and distinct document/folder glyphs, shared
  with the video through `store/src/parts.ts`.
- The actual extension popup supplies the UI, with synthetic Chrome API states from `store/src/mock-chrome.ts`.
  Screenshot 4 is exporting at 47%; screenshot 5 is complete. No real account is used.
- `scripts/stage.mjs` builds, serves and captures the local stage.

Use the established navy `#083f92`, blue `#296bed`, magenta `#b83b7c`, pink `#f1c1cd`, white and pale blue. Screenshots
share an 8px grid: 64px outer margins, a 528px copy column, a 48px gutter and a 576px visual column. The marquee follows
the same margin and optical-alignment principles at its own size.

Keep the compact product title with an **Unofficial** chip instead of a full disclaimer footer. Label illustrative
assistant examples and synthetic export previews. Two understated document shapes sit behind the folder: directly
on white in screenshot 1 and the marquee, and on full pale blue in the small tile. There is no surrounding panel,
decorative circle or dots. Preserve the assistant card's soft shadow, screenshot 1's feature pills, screenshot 2's
pink-line callout, screenshot 3's plain prompt bubbles without link arrows, and screenshot 5's numbered Unzip/Open/Ask
steps. Extension popups appear over a synthetic browser page.

## Verification

1. Inspect all eight production PNGs at native and half size for readable text, clipping, alignment and source labels.
2. Run `node scripts/check-store-assets.mjs` to check dimensions, colour types, hashes and exact ZIP contents.
3. For reproducibility, record the eight hashes in `store-artwork.json`, rerun the same render command in the same
   browser/font/OS environment, and compare them. Cross-platform pixel identity is not guaranteed.
4. Check the poster and link previews when changing their recipes. They are not part of the eight-image upload ZIP.

On 25 October 2026, all eight review PNGs matched byte for byte across two consecutive renders. Promotion also checked
every canonical PNG against that approved set. Static captures use the popup's existing reduced-motion styles and
wait two animation frames, freezing the progress sheen and pulse without changing normal extension animations.

## Historical review artifacts

`mock-review.html` remains the three-column **Original → First redesign → Latest revision** comparison, and this
folder holds only what it shows: the images from before the redesign under `original/`, and the first redesign's
PNGs beside it. Its latest column links to the canonical `store/assets/` images. The approved artwork is entirely
code-generated.

Platform specifications were checked against [Chrome's image guide](https://developer.chrome.com/docs/webstore/images)
on 22 October 2026. Rendering files locally does not upload a listing or publish an extension release.
