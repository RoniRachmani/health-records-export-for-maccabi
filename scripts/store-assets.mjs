// Renders the Chrome Web Store images into store/assets/: screenshots of the real popup fed made-up
// states (store/src/mock-chrome.ts, no real data), the two promo tiles, the poster the README
// shows for the promo video, which is a frame of the film itself (store/src/video.ts), and the
// link previews of the AI assistant page and the landing page. Name shots on the command line to render only those, e.g.
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
  // The landing page's link preview, likewise: a photograph of the page's own hero, so the two cannot drift apart.
  // The page is restyled for the picture: only its name and its dashboard, centred, as the finished dashboard and
  // not a moment of its animation. Its og:title, the headline, is printed under the picture by whatever shows it.
  {
    file: 'og-site-1200x630.png', shot: 'og-site', page: '/site/index.html', width: 1200, height: 630, scale: 1,
    prepare: `document.head.insertAdjacentHTML('beforeend', '<style>' +
      'body > :not(.hero), .hero-text > :not(.eyebrow), .he-slip, .asked, .scene { display: none !important; }' +
      'html, body { width: 1200px; height: 630px; margin: 0; padding: 0; max-width: none; overflow: hidden; background: linear-gradient(135deg, #e6f0ff 0%, #f3f0fb 50%, #fde9ef 100%); }' +
      '.hero { display: flex !important; flex-direction: column; align-items: center; justify-content: center; gap: 22px; width: 1200px; height: 630px; margin: 0 !important; padding: 0 !important; max-width: none !important; }' +
      '.hero-text, .dash-stage { margin: 0 !important; padding: 0 !important; width: auto !important; min-height: 0 !important; }' +
      '.eyebrow { margin: 0 !important; }' +
      '.dash-stage { zoom: 1.05; }' +
      '.anim, .anim * { animation: none !important; }' +
      '</style>')`,
  },
  // The marquee at GitHub's size, published as social.png to be uploaded as the repository's social preview.
  { file: 'social-1280x640.png', shot: 'social', width: 1280, height: 640 },
];

const only = process.argv.slice(2);
const images = only.length ? IMAGES.filter((img) => only.includes(img.shot)) : IMAGES;
if (!images.length) throw new Error('No such shot: ' + only.join(', ') + '. Known: ' + IMAGES.map((i) => i.shot).join(', '));

const stage = await openStage();
try {
  for (const img of images) {
    const page = await stage.open(img.page || '/store/src/stage.html?shot=' + img.shot, img.width, img.height, img.scale, img.prepare);
    writeFileSync(join(root, 'store', 'assets', img.file), await page.screenshot());
    await page.close();
    console.log('wrote store/assets/' + img.file);
  }
} finally {
  await stage.close();
}
