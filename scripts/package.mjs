// Zips dist/ into release/health-records-export-for-maccabi-<version>.zip for
// the Chrome Web Store upload (run through `npm run package`, which builds first).
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name !== '.DS_Store') files[relative('dist', full)] = readFileSync(full);
  }
})('dist');

mkdirSync('release', { recursive: true });
const out = join('release', `${pkg.name}-${pkg.version}.zip`);
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`wrote ${out} (${Object.keys(files).length} files)`);
