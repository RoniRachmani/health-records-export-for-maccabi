---
name: store-media
description: Rendering and checking the Chrome Web Store images, promo video, soundtrack, poster, link previews and icons (npm run store-assets, store-video, icons; the Store images and Store video workflows). Load before touching store/, scripts/store-*.mjs, scripts/make-icons.mjs, the soundtrack or narration.
---

# Store images, video and the mark

Moved out of the root `CLAUDE.md` so it loads only for this work; the root keeps the rules that bind every session.

## Rendering

The store images (`store-assets`) are rendered on a Mac **without** Roboto installed, so the Roboto-first stacks of
the listing layouts and the popup fall back to the macOS system face (San Francisco): that is the chosen look. Check
with `fc-list | grep -i roboto` or Font Book, and render elsewhere if this Mac has it. Linux has no San Francisco, so
CI cannot reproduce these images. The video (`store-video`) still wants Roboto on the machine (`fonts-roboto` on
Debian/Ubuntu, then `fc-cache -f`), as its workflow installs. Either way the font is only the machine's; the extension
itself never ships or fetches one. Byte-for-byte reproducibility is only expected with the same browser, fonts and OS. Its static captures enable reduced motion
and wait two animation frames, so the progress sheen and pulse cannot vary between shots.

The approved listing images are the default for `npm run store-assets`, `npm run release`, and the *Store images*
workflow. Canonical outputs are the eight PNGs in `store/assets/`, with `review.html`, `store-artwork.json` and
`store-artwork.zip` (gitignored: written by each render; upload one rendered on a Mac, not the Store images workflow's artifact). CI validates the bundle and uploads its ZIP and hash manifest as an artifact. The README hero uses
`store/assets/screenshot-1-ask.png`. Named shots include the five screenshots, `promo`, `marquee`, `icon`, `poster`,
`og-site` and `social`; `npm run store-assets -- start open` updates only those shots, then refreshes the bundle.
The proposal renderer and `--mock` flag are retired. `store/redesign/mock-review.html` preserves the historical
comparison; the latest column links to canonical assets. See `store/redesign/README.md` and `docs/store-listing.md`.

The *Store images* workflow (`gh workflow run store-assets.yml`, optionally `-f shots="start open"`) renders on Linux
in the runner's own fonts (DejaVu Sans, which is wider) and pushes changed images to a `store-images/` branch: use it
to check that a render works, not for the committed images, and delete its branch rather than merging it. The
*Store video* workflow (`gh workflow run
store-video.yml`) renders the video's picture there and keeps it as the run's artifact, with no sound: the narration is
only in a maintainer's `.cache/narration/`, so download it to `store/assets/` and add the soundtrack with `--remux`.

## How the pieces are built

- **Store images**: `store/design/listing.mjs` and `listing.css` hold the approved HTML/CSS and SVG design (the mark and file icons come from `store/design/glyphs.mjs`, shared with the video's `parts.ts`);
  `scripts/store-listing.mjs` captures it on `store/src/listing.html` with the real popup and synthetic states. `scripts/store-assets.mjs` routes
  named shots and writes the eight-PNG upload bundle and hash manifest. Keep the shared grid, compact header with
  Unofficial chip, simple two-document illustration on white, pale-blue prompt bubbles, pink-line callout and numbered
  steps. Show the popup inside a browser: screenshot 4 shows progress, screenshot 5 completion. Keep synthetic labels
  and reduced-motion capture. `scripts/store-auxiliary.mjs` retains the poster and landing-page-preview recipes;
  the social preview reuses the approved marquee layout. Regeneration needs no AI service or real account.
- **Video**: the original listing layouts are archived as images in `store/redesign/original/`. `store/src/video.ts` draws the
  promo video a frame at a time (`window.video.at(n)`, nothing animates by itself, so the render is the same
  everywhere: every value is a function of the second, shaped by the helpers in `motion.ts`). It is built
  around the **real popup** in an iframe, fed made-up states by `mock-chrome.ts`; the video drives a whole run
  through it with `demoRun`, which fires the popup's own `storage.onChanged` listener with states built from
  `PLAN` and `WEIGHTS`. The README's poster is that page again, asked for one frame with a play badge over it
  (`?poster=`, taken by `store-assets` as the `poster` shot). The landing page's link preview is
  the `og-site` shot, a photograph of its hero, which the Pages workflow renders on each deploy, with Roboto installed, and which is not committed. What all of them draw lives in
  `store/src/parts.ts` and `parts.css`; `scripts/stage.mjs` builds, serves and photographs them in headless
  Chrome. The video is 4K at 60 fps (the stage at `deviceScaleFactor` 2), each frame piped as it is taken to
  `ffmpeg` if it is on `PATH`, else to `scripts/encode-mp4.swift` (macOS); the popup's own CSS animations are
  put on the film's clock, or they would flicker. A frame must look the same in a browser that has just
  started as in one that drew the frames before it (the render restarts it every 150 frames): no
  `translate3d`, whose layers keep text where it was first drawn, and no camera or element creeping by
  fractions of a pixel, which reads as text shivering. The soundtrack is scored from the same timeline
  (`window.video.soundtrack`: the parts, `NARRATION`, `SOUNDS`) by `scripts/soundtrack.mjs`. The music is Eleven Music v2.5
  and the effects ElevenLabs Sound Effects (`scripts/eleven-sound.mjs`), brought in as `.cache/elevenlabs-sound/import/`
  `music.mp3` and `<kind>.mp3` (or `<kind>-1.mp3`…), or asked for with the key; `--synth` plays the score and effects
  `soundtrack.mjs` synthesizes instead, which each recorded effect's loudness is matched to. The voice is ElevenLabs (`scripts/narration.mjs`): one take of the script
  (`--script`) cut into lines by `--import <take>` (on its words, by ElevenLabs' forced alignment, when there is a key), or line by line with `ELEVENLABS_API_KEY` from `.env`, and
  cached in `.cache/narration/`. Retime a scene and the narration moves with it; a line that no longer fits stops
  the render before the first frame. The MP4 is gitignored, because the store's video field takes a YouTube link.
- **The mark** is a folder with a download arrow, drawn in Maccabi Online's own illustration register:
  a navy (`#083f92`) outline of even weight with round joins, and a pale-pink (`#f1c1cd`) echo of that
  outline offset up and left, so it reads as slightly off-register print. The folder is filled white so
  the navy survives a dark Chrome toolbar. Its geometry lives twice — as a rounded polygon in
  `scripts/make-icons.mjs` and as `MARK_PATH` in `store/src/parts.ts` — so change both together. 16 and
  32px have hand-tuned layouts in `PIXEL`, on the pixel grid; at 16px the arrow is a solid staircase,
  because a 1px chevron there just makes a cross.

## When to re-render

- **Re-run `npm run store-assets`** when the selected listing images or popup change; inspect all
  eight canonical PNGs and validate the ZIP with `node scripts/check-store-assets.mjs`. The same renderer handles
  the poster and link previews.
  Re-run `npm run store-video` if the video's own copy or the popup states it shows go stale; a re-rendered video has to be re-uploaded to YouTube, and its
  poster (`store-assets -- poster`) re-rendered with it.
