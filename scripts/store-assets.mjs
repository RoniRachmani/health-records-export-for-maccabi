// Renders the Chrome Web Store images into store/assets/: screenshots of the real popup fed made-up
// states (store/src/mock-chrome.ts, no real data), the two promo tiles, the poster the README
// shows for the promo video, which is a frame of the film itself (store/src/video.ts), and the
// AI assistant page's link preview. Name shots on the command line to render only those, e.g.
// `npm run store-assets -- marquee`.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStage, root } from './stage.mjs';

const IMAGES = [
  // What the member gets comes first, in docs/positioning.md's order; how they get there follows.
  { file: 'screenshot-1-ask.png', shot: 'ask', width: 1280, height: 800 },
  { file: 'screenshot-2-whole.png', shot: 'whole', width: 1280, height: 800 },
  { file: 'screenshot-3-advice.png', shot: 'advice', width: 1280, height: 800 },
  { file: 'screenshot-4-start.png', shot: 'start', width: 1280, height: 800 },
  { file: 'screenshot-5-open.png', shot: 'open', width: 1280, height: 800 },
  { file: 'promo-small-440x280.png', shot: 'promo', width: 440, height: 280 },
  { file: 'promo-marquee-1400x560.png', shot: 'marquee', width: 1400, height: 560 },
  // Not a store field: the README's poster, drawn by the video's own page at the size it plays.
  { file: 'video-poster.png', shot: 'poster', page: '/store/src/video.html?poster', width: 1920, height: 1080 },
  // Not a store field either, and not committed: the published AI assistant page's link preview, which
  // .github/workflows/pages.yml renders on each deploy (with Roboto installed) and publishes as og.png.
  { file: 'og-1200x630.png', shot: 'og', width: 1200, height: 630 },
  // The same at GitHub's size, published as social.png to be uploaded as the repository's social preview.
  { file: 'social-1280x640.png', shot: 'social', width: 1280, height: 640 },
];

const only = process.argv.slice(2);
const images = only.length ? IMAGES.filter((img) => only.includes(img.shot)) : IMAGES;
if (!images.length) throw new Error('No such shot: ' + only.join(', ') + '. Known: ' + IMAGES.map((i) => i.shot).join(', '));

const stage = await openStage();
try {
  for (const img of images) {
    const page = await stage.open(img.page || '/store/src/stage.html?shot=' + img.shot, img.width, img.height);
    writeFileSync(join(root, 'store', 'assets', img.file), await page.screenshot());
    await page.close();
    console.log('wrote store/assets/' + img.file);
  }
} finally {
  await stage.close();
}
