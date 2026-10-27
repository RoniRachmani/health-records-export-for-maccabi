// The approved store design is the default. Name shots to render a subset, e.g. -- start open.
// Each image is drawn at exactly the size the store asks for, and at no other.
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
/**
 * One image to render: drawn from the listing's layout (`html`), or photographed from a page of the store build.
 * @typedef {{ file: string; shot: string; width: number; height: number; html?: unknown; page?: string; prepare?: string; popupState?: string; [key: string]: any }} Shot
 */
/** @type {Shot[]} */
export const IMAGES = [...LISTING_IMAGES, ...AUXILIARY_IMAGES, social];

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

// The upload ZIP is gitignored (*.zip): it is written here for the upload, and kept as the Store images workflow's
// artifact when that check runs.
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

export async function renderStoreAssets(names = []) {
  const images = selectImages(names);
  const out = join(root, 'store/assets');
  mkdirSync(out, { recursive: true });
  const stage = await openStage();
  try {
    for (const image of images) {
      let bytes;
      if (image.html) {
        bytes = await renderListingImage(stage, image);
      } else {
        const page = await stage.open(image.page, image.width, image.height, 1, image.prepare);
        try { bytes = await page.screenshot(); } finally { await page.close(); }
      }
      writeFileSync(join(out, image.file), bytes);
      console.log('wrote store/assets/' + image.file);
    }
    if (images.some(image => /** @type {Shot[]} */ (LISTING_IMAGES).includes(image))) writeListingBundle(out);
  } finally {
    await stage.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--list') {
    console.log(JSON.stringify(selectImages(args.slice(1)).map(({ file, shot, width, height }) => ({ file, shot, width, height })), null, 2));
  } else {
    await renderStoreAssets(args);
  }
}
