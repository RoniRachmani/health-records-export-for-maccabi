// The approved store design is the default. Name shots to render a subset, e.g. -- start open.
// Each image is drawn at SCALE times its size (--scale N, default 2) and kept as <name>@<N>x.png, and the file at the
// size the store asks for is that drawing scaled down, so its edges are sharper too. --scale 1 draws only that file.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import { LISTING_IMAGES } from '../store/design/listing.mjs';
import { AUXILIARY_IMAGES } from './store-auxiliary.mjs';
import { renderListingImage } from './store-listing.mjs';
import { openStage, root } from './stage.mjs';

const marquee = LISTING_IMAGES.find(image => image.shot === 'marquee');
const social = {
  ...marquee,
  file: 'social-1280x640.png', shot: 'social', className: 'marquee social', width: 1280, height: 640,
  // GitHub's repo card template keeps everything that matters 80px in from each edge, where nothing gets cropped.
  css: '.social .listing-brand{left:80px;top:80px}.social .mq-copy{left:80px;width:640px}.social .mq-copy h1{font-size:56px}.social .mq-art{left:720px;top:144px;width:464px;height:352px}',
};
export const IMAGES = [...LISTING_IMAGES, ...AUXILIARY_IMAGES, social];
export const SCALE = 2;

/** The file an image is kept in when drawn `scale` times its size: screenshot-1-ask@2x.png. */
export const scaledFile = (file, scale) => file.replace(/\.png$/, `@${scale}x.png`);

export function selectImages(names) {
  const unknown = names.filter(name => !IMAGES.some(image => image.shot === name));
  if (unknown.length) throw new Error('Unknown shot: ' + unknown.join(', ') + '. Known: ' + IMAGES.map(image => image.shot).join(', '));
  return names.length ? IMAGES.filter(image => names.includes(image.shot)) : IMAGES;
}

/** Throws unless `bytes` is a PNG of the listing image's size. */
export function assertListingPng(bytes, image) {
  if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== image.width || bytes.readUInt32BE(20) !== image.height) {
    throw new Error('Unexpected PNG dimensions: ' + image.file);
  }
}

// The upload ZIP is gitignored (*.zip): it is written here and kept as the Store images workflow's artifact.
export function writeListingBundle(out) {
  const missing = LISTING_IMAGES.filter(image => !existsSync(join(out, image.file))).map(image => image.file);
  if (missing.length) throw new Error('Cannot write the upload bundle without ' + missing.join(', ') + ': run npm run store-assets with no shot names');
  const files = {};
  const manifest = LISTING_IMAGES.map(image => {
    const { file, shot, width, height } = image;
    const bytes = readFileSync(join(out, file));
    assertListingPng(bytes, image);
    files[file] = bytes;
    return { file, shot, width, height, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  writeFileSync(join(out, 'store-artwork.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(out, 'store-artwork.zip'), zipSync(files));
  const cards = LISTING_IMAGES.map(({ file, shot, width, height }) => `<figure><figcaption>${shot} · ${width} × ${height}</figcaption><a href="${file}"><img src="${file}" alt="${shot}" ${shot === 'icon' ? 'class="icon"' : ''}></a></figure>`).join('');
  writeFileSync(join(out, 'review.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Chrome Web Store artwork</title><style>body{margin:32px;background:#f1f9fe;color:#083f92;font:16px/1.5 system-ui}h1{font-size:26px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px}figure{margin:0}figcaption{margin:16px 0 8px}img{display:block;width:100%;height:auto}.icon{width:128px}a{color:#b83b7c}</style><h1>Chrome Web Store artwork</h1><p><a href="store-artwork.zip">The ${LISTING_IMAGES.length} PNGs as one ZIP</a> (written by npm run store-assets, not committed) · <a href="store-artwork.json">Dimensions and SHA-256 hashes</a> · <a href="../redesign/mock-review.html">Design comparison</a></p><main>${cards}</main></html>`);
}

// The large drawing scaled down to the image's own size by the browser, on a transparent page so the icon keeps its alpha.
async function scaleDown(stage, bytes, image) {
  const page = await stage.open('/store/src/listing.html', image.width, image.height, 1, 'void 0');
  try {
    await page.evaluate(`(async () => {
      document.documentElement.innerHTML = '<head><style>html,body{margin:0;background:transparent}img{display:block;width:${image.width}px;height:${image.height}px}</style></head><body><img></body>';
      const img = document.querySelector('img');
      img.src = 'data:image/png;base64,${bytes.toString('base64')}';
      await img.decode();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
    if (image.shot === 'icon') {
      await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    }
    return await page.screenshot();
  } finally {
    await page.close();
  }
}

export async function renderStoreAssets(names = [], scale = SCALE) {
  const images = selectImages(names);
  const out = join(root, 'store/assets');
  mkdirSync(out, { recursive: true });
  const stage = await openStage();
  try {
    for (const image of images) {
      let bytes;
      if (image.html) {
        bytes = await renderListingImage(stage, image, scale);
      } else {
        const page = await stage.open(image.page, image.width, image.height, scale, image.prepare);
        try { bytes = await page.screenshot(); } finally { await page.close(); }
      }
      if (scale !== 1) {
        writeFileSync(join(out, scaledFile(image.file, scale)), bytes);
        console.log('wrote store/assets/' + scaledFile(image.file, scale));
        bytes = await scaleDown(stage, bytes, image);
      }
      writeFileSync(join(out, image.file), bytes);
      console.log('wrote store/assets/' + image.file);
    }
    if (images.some(image => LISTING_IMAGES.includes(image))) writeListingBundle(out);
  } finally {
    await stage.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--list') {
    console.log(JSON.stringify(selectImages(args.slice(1)).map(({ file, shot, width, height }) => ({ file, shot, width, height })), null, 2));
  } else {
    const at = args.indexOf('--scale');
    const scale = at < 0 ? SCALE : Number(args.splice(at, 2)[1]);
    if (!Number.isInteger(scale) || scale < 1) throw new Error('--scale takes a whole number, 1 or more');
    await renderStoreAssets(args, scale);
  }
}
