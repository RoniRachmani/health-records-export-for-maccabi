// Read-only validation of the listing images and their manifest, and of the upload ZIP when one has been written
// (it is gitignored, so a fresh checkout has none); useful after partial renders and in CI.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { LISTING_IMAGES } from '../store/design/listing.mjs';
import { root } from './stage.mjs';
import { assertListingPng } from './store-assets.mjs';

const out = join(root, 'store/assets');
const count = LISTING_IMAGES.length;
const manifest = JSON.parse(readFileSync(join(out, 'store-artwork.json'), 'utf8'));
const zipPath = join(out, 'store-artwork.zip');
const archive = existsSync(zipPath) ? unzipSync(readFileSync(zipPath)) : null;
if (manifest.length !== count) throw new Error(`Expected ${count} images in store-artwork.json`);
if (archive && Object.keys(archive).length !== count) throw new Error(`Expected ${count} images in store-artwork.zip`);
for (const image of LISTING_IMAGES) {
  const bytes = readFileSync(join(out, image.file));
  const recorded = manifest.find(entry => entry.file === image.file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (!recorded || recorded.shot !== image.shot || recorded.width !== image.width || recorded.height !== image.height || recorded.sha256 !== sha256) {
    throw new Error('Stale manifest: ' + image.file);
  }
  assertListingPng(bytes, image);
  // Opaque RGB for store screenshots/promo tiles, RGBA for the transparent store icon.
  if (bytes[25] !== (image.shot === 'icon' ? 6 : 2)) throw new Error('Incorrect PNG colour type: ' + image.file);
  if (archive && (!archive[image.file] || !bytes.equals(Buffer.from(archive[image.file])))) throw new Error('Stale ZIP entry: ' + image.file);
}
console.log(`Verified ${count} PNGs, dimensions, colour types and SHA-256 hashes` + (archive ? ', and the ZIP.' : '; no ZIP here to check.'));
