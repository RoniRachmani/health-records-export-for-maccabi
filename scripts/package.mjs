// Zips dist/ into release/health-records-export-for-maccabi-<version>.zip for
// the Chrome Web Store upload (run through `npm run package`, which builds first).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
if (manifest.content_scripts) {
  console.error('dist/manifest.json has content scripts: that is the development build. Run `npm run build`.');
  process.exit(1);
}

const files = {};
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name !== '.DS_Store') files[relative('dist', full)] = readFileSync(full);
  }
})('dist');

mkdirSync('release', { recursive: true });
const out = join('release', `${pkg.name}-${pkg.version}.zip`);
// One fixed time on every entry, not the minute it was packaged: the same dist/ then gives the same ZIP, byte for
// byte, so a release's ZIP can be checked against a build of its tag. Midnight local time, which is what a ZIP
// stores, so it is the same bytes in any time zone.
writeFileSync(out, zipSync(files, { level: 9, mtime: new Date(2000, 0, 1) }));
console.log(`wrote ${out} (${Object.keys(files).length} files)`);
