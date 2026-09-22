// Renders the Chrome Web Store images into store/: screenshots of the real popup fed made-up
// states (store/src/mock-chrome.ts, no real data) and the two promo tiles. Name shots on the
// command line to render only those, e.g. `npm run store-assets -- marquee`.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStage, root } from './stage.mjs';

const IMAGES = [
  { file: 'screenshot-1-start.png', shot: 'start', width: 1280, height: 800 },
  { file: 'screenshot-2-progress.png', shot: 'progress', width: 1280, height: 800 },
  { file: 'screenshot-3-done.png', shot: 'done', width: 1280, height: 800 },
  { file: 'screenshot-4-contents.png', shot: 'contents', width: 1280, height: 800 },
  { file: 'screenshot-5-privacy.png', shot: 'privacy', width: 1280, height: 800 },
  { file: 'promo-small-440x280.png', shot: 'promo', width: 440, height: 280 },
  { file: 'promo-marquee-1400x560.png', shot: 'marquee', width: 1400, height: 560 },
];

const only = process.argv.slice(2);
const images = only.length ? IMAGES.filter((img) => only.includes(img.shot)) : IMAGES;
if (!images.length) throw new Error('No such shot: ' + only.join(', ') + '. Known: ' + IMAGES.map((i) => i.shot).join(', '));

const stage = await openStage();
try {
  for (const img of images) {
    const page = await stage.open('/store/src/stage.html?shot=' + img.shot, img.width, img.height);
    writeFileSync(join(root, 'store', img.file), await page.screenshot());
    await page.close();
    console.log('wrote store/' + img.file);
  }
} finally {
  await stage.close();
}
