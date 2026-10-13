// Lists what Maccabi Online's own front-end code can call that docs/endpoints.json does not map, with the
// HTTP method of each call and the place in the code that makes it. For finding records the export could
// add, and for seeing what moved after the site changes.
//
//   npm run endpoints:rea                    the services and API calls that endpoints.json does not have
//   npm run endpoints:rea -- --all           the ones it has too, marked, and the app's own page routes
//   npm run endpoints:rea -- --out FILE      also writes everything found to FILE as JSON
//   npm run endpoints:rea -- --save DIR      also keeps the script files read, in DIR, laid out as on the site
//   npm run endpoints:rea -- --from DIR      analyzes scripts a --save kept, with no browser and no sign-in
//   npm run endpoints:rea -- --no-rea        skips rea: seconds instead of minutes, nothing parsed
//   npm run endpoints:rea -- --jobs N        how many rea processes run at once (default 3); --keep leaves the browser open
//
// Two readers go over the same files. REA (Reverse Engineer Anything, github.com/morluto/rea) parses each
// script without running it and reports what an AST can prove: the calls whose address is a literal and the
// method of the call that makes each, the app's page routes, the chunks each file holds and the chunk ids
// the code loads, the source maps declared, and the files it could not parse. Its own limits say what it
// leaves out ("string-built routes and endpoints may remain unknown"), and a site that writes the member id
// into every path builds nearly all of them, so a reader here (rea-endpoints-lib.mjs) takes those: it reads
// each fetch, client call, ajax and XHR open, and writes the address with {} for the parts made at run time.
// What neither saw called but reads as an address is listed last, as named only.
//
// It opens the browser and signs in as `npm run export` does (scripts/maccabi-browser.mjs), then reads only
// static files: the scripts the /sonline/ app loads, the chunks they name, and the scripts of the legacy
// summary page the extension itself opens, plus the addresses that page links to. It calls no API, so a
// call it prints is a candidate to look at by hand, in the site, never something to try from here: an
// unknown call may change something on the account (see "Read-only" in CLAUDE.md), and one that is not a
// GET is marked for that. Script files hold no member's data, and links are kept without their query
// strings, so what it prints and writes is the site's code, not the account's. rea runs on this machine,
// on those files alone; the first run downloads it from npm (REA_VERSION below; REA_BIN names an installed one).
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { call } from './in-page.mjs';
import { ORIGIN, START, openBrowser, signIn } from './maccabi-browser.mjs';
import { REA_FILTER, batches, candidates, chunkFiles, chunkUrl, missingChunks, readEvidence, servicesIn, knownFrom, isKnown } from './rea-endpoints-lib.mjs';
import { root, sleep } from './stage.mjs';

/** The rea release this was written against: its result's shape is what readEvidence reads. */
const REA_VERSION = '6.4.0';
/** Requests are paced as the collector's are (PACE_MS in src/core), one at a time. */
const PACE_MS = 300;
/** Enough for any bundle split; a scan that reaches it says so. */
const MAX_FILES = 600;
const LEGACY_PAGE = ORIGIN + '/online/medicalfile/summary/';
/** How long a page is left to load its scripts before they are listed. */
const SETTLE_MS = 5000;

// ---- in the page ---------------------------------------------------------------------------------

/** In the page: the script files it has loaded. Self-contained, as call() needs. */
function loadedScripts() {
  const urls = [...document.scripts].map((s) => s.src).filter(Boolean);
  for (const e of performance.getEntriesByType('resource')) {
    if (e.initiatorType === 'script' || /\.m?js(\?|$)/.test(e.name)) urls.push(e.name);
  }
  return [...new Set(urls)];
}

/** In the page: the addresses its links and forms go to, on this site, without queries. */
function pageLinks(origin) {
  const out = new Set();
  const add = (u) => {
    try {
      const url = new URL(u, location.href);
      if (url.origin === origin) out.add(url.pathname);
    } catch { /* not an address */ }
  };
  document.querySelectorAll('a[href]').forEach((a) => add(a.getAttribute('href')));
  document.querySelectorAll('form[action]').forEach((f) => add(f.getAttribute('action')));
  return [...out];
}

/**
 * In the page: one static file's text, or why not. A redirect is not followed: Maccabi's gateway answers an
 * address it does not serve, or an ended session, by sending the page to its logout address.
 */
async function fetchText(url) {
  try {
    const r = await fetch(url, { credentials: 'same-origin', redirect: 'manual' });
    if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)) return { failed: 'redirect' };
    if (!r.ok) return { failed: String(r.status) };
    const text = await r.text();
    return /^\s*</.test(text) ? { failed: 'a web page, not a script' } : { text };
  } catch (e) {
    return { failed: String(e && e.message || e) };
  }
}

const ours = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'maccabi4u.co.il' || u.hostname.endsWith('.maccabi4u.co.il'));
  } catch {
    return false;
  }
};

/** Where a script is kept: its path on the site, under `dir`. */
function fileFor(dir, url) {
  const rel = new URL(url).pathname.split('/').filter(Boolean).map((s) => s.replace(/[^\w.@-]+/g, '_')).join('/');
  const file = resolve(dir, rel || 'index.js');
  return file.startsWith(dir + sep) ? file : null;
}

/** Reads the scripts in `start` and every script they name, into `dir`. */
async function readScripts(page, start, dir, found) {
  const queue = [...start];
  let redirects = 0;
  while (queue.length && found.read.size + found.failed.size < MAX_FILES) {
    const url = queue.shift();
    if (found.read.has(url) || found.failed.has(url) || !ours(url)) continue;
    const got = await page.evaluate(call(fetchText, url), 60_000);
    await sleep(PACE_MS);
    if (got.failed) {
      found.failed.set(url, got.failed);
      redirects = got.failed === 'redirect' ? redirects + 1 : 0;
      if (redirects >= 3) {
        console.log('  Three files in a row were redirected: the session may have ended. Stopped reading.');
        return;
      }
      continue;
    }
    redirects = 0;
    found.read.add(url);
    const file = fileFor(dir, url);
    if (file) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, got.text);
    }
    for (const f of chunkFiles(got.text)) {
      const next = chunkUrl(f, url);
      if (!found.read.has(next) && !found.failed.has(next) && !queue.includes(next)) queue.push(next);
    }
    if (found.read.size % 10 === 0) console.log(`  ${found.read.size} read, ${found.failed.size} would not load, ${queue.length} to go`);
  }
  console.log(`  Done: ${found.read.size} read, ${found.failed.size} would not load.`);
  if (queue.some((u) => ours(u) && !found.read.has(u) && !found.failed.has(u))) found.capped = true;
}

// ---- rea -----------------------------------------------------------------------------------------

/** Runs rea on one folder and gives its result, or throws with what it said. */
function rea(dir) {
  const args = ['analyze-javascript-application', dir, '--format', 'json', '--filter-output', REA_FILTER];
  const [cmd, pre] = process.env.REA_BIN ? [process.env.REA_BIN, []] : ['npx', ['-y', `rea-agents@${REA_VERSION}`]];
  return new Promise((done, fail) => {
    const child = spawn(cmd, [...pre, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    child.stdout.on('data', (d) => out.push(d));
    // rea reports its progress here, a line of JSON per phase; only the end of it is kept, for a failure.
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    child.on('error', (e) => fail(new Error(e.code === 'ENOENT' ? `${cmd} is not installed.` : e.message)));
    child.on('close', (code) => {
      if (code !== 0) return fail(new Error(`rea ended with ${code}: ${err.trim().split('\n').pop()}`));
      try {
        done(JSON.parse(Buffer.concat(out).toString('utf8')));
      } catch {
        fail(new Error('rea did not answer in JSON.'));
      }
    });
  });
}

/** rea's findings over every file, a few folders of them at a time. */
async function analyze(dir, files, jobs) {
  const sizes = new Map([...files].map(([file, text]) => [file, Buffer.byteLength(text)]));
  const groups = batches(sizes);
  const merged = { endpoints: [], routes: new Set(), chunks: [], loads: [], sourceMaps: [], unparsed: [], parsed: 0, failed: [] };
  const work = mkdtempSync(join(tmpdir(), 'rea-endpoints-'));
  let next = 0;
  let finished = 0;
  const worker = async () => {
    while (next < groups.length) {
      const i = next++;
      const batch = join(work, String(i));
      for (const file of groups[i]) cpSync(join(dir, file), join(batch, file), { recursive: true });
      try {
        const found = readEvidence(await rea(batch));
        for (const key of ['endpoints', 'chunks', 'loads', 'sourceMaps', 'unparsed']) merged[key].push(...found[key]);
        found.routes.forEach((r) => merged.routes.add(r));
        merged.parsed += found.parsed;
      } catch (e) {
        merged.failed.push(...groups[i]);
        // The first failure is the one to read: without rea at all, every batch says the same.
        if (merged.failed.length === groups[i].length) console.log('  ' + e.message);
      }
      rmSync(batch, { recursive: true, force: true });
      console.log(`  rea: ${++finished} of ${groups.length} groups of files`);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(jobs, groups.length) }, worker));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return merged;
}

// ---- the run -------------------------------------------------------------------------------------

/** Every script under a folder, by its path in it. */
function scriptsIn(dir) {
  const files = new Map();
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.m?js$/.test(entry.name) && statSync(path).isFile()) files.set(relative(dir, path).split(sep).join('/'), readFileSync(path, 'utf8'));
    }
  };
  walk(dir);
  return files;
}

function option(args, name, what) {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} takes ${what}`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const ALL = args.includes('--all');
  const KEEP = args.includes('--keep');
  const OUT = option(args, '--out', 'a file: --out ~/endpoint-scan.json');
  const SAVE = option(args, '--save', 'a folder: --save ~/maccabi-scripts');
  const FROM = option(args, '--from', 'a folder a --save kept: --from ~/maccabi-scripts');
  const JOBS = Math.max(1, Number(option(args, '--jobs', 'a number: --jobs 2') ?? 3) || 3);
  if (FROM && SAVE) throw new Error('--from reads a folder --save kept; it has nothing to save.');

  const known = knownFrom(JSON.parse(readFileSync(join(root, 'docs/endpoints.json'), 'utf8')));
  const dir = FROM ? resolve(FROM) : SAVE ? resolve(SAVE) : mkdtempSync(join(tmpdir(), 'maccabi-scripts-'));
  const found = { read: new Set(), failed: new Map(), legacyPages: [], capped: false };

  if (!FROM) {
    mkdirSync(dir, { recursive: true });
    const page = await openBrowser({ startUrl: START, keep: KEEP });
    await signIn(page);
    console.log('Signed in. Reading the /sonline/ app\'s scripts (no API is called).');
    await sleep(SETTLE_MS);
    const scripts = await page.evaluate(call(loadedScripts));
    console.log(`  The page loaded ${scripts.filter(ours).length} script files from Maccabi's own servers.`);
    await readScripts(page, scripts, dir, found);

    console.log('Reading the legacy summary page\'s scripts and links.');
    await page.navigate(LEGACY_PAGE);
    await sleep(SETTLE_MS);
    if ((await page.probe('location.pathname', '')).startsWith('/online/')) {
      found.legacyPages = (await page.probe(call(pageLinks, ORIGIN), [])).filter((p) => p.startsWith('/online/')).sort();
      await readScripts(page, await page.probe(call(loadedScripts), []), dir, found);
    } else {
      console.log('  The legacy page did not open (logged out?); its part is left out.');
    }
  }

  const files = scriptsIn(dir);
  if (!files.size) throw new Error(`No script files in ${dir}.`);
  let evidence = { endpoints: [], routes: new Set(), chunks: [], loads: [], sourceMaps: [], unparsed: [], parsed: 0, failed: [...files.keys()] };
  if (!args.includes('--no-rea')) {
    console.log(`Analyzing ${files.size} script files with rea ${REA_VERSION} (parsed, never run; some minutes for the whole app).`);
    evidence = await analyze(dir, files, JOBS);
  }
  const all = candidates(files, evidence, known);
  const calls = all.filter((p) => p.kind === 'api');
  const pages = all.filter((p) => p.kind === 'page');
  const app = all.filter((p) => p.kind === 'app');
  const services = servicesIn(files, known);
  const legacy = found.legacyPages.map((path) => ({ path, known: isKnown(path, known) }));
  const missing = missingChunks(evidence);

  const show = (list, label, line) => {
    const shown = ALL ? list : list.filter((x) => !x.known);
    console.log(`\n${label}: ${list.filter((x) => !x.known).length} not in endpoints.json, of ${list.length}`);
    for (const x of shown) console.log('  ' + (ALL ? (x.known ? '  known ' : '  NEW   ') : '') + line(x));
  };
  // A call that is not a GET may change something: the one thing the export must never do by accident.
  const callLine = (p) => `${(p.method || '?').padEnd(6)} ${p.path}    [${p.proof}] ${p.where}` + (p.method && p.method !== 'GET' ? '    not a GET' : '');

  if (!FROM) {
    const why = {};
    for (const r of found.failed.values()) why[r] = (why[r] || 0) + 1;
    console.log(`\nRead ${found.read.size} script files` + (found.failed.size ? `; ${found.failed.size} would not load (${Object.entries(why).map(([r, n]) => `${n} ${r}`).join(', ')})` : '')
      + (found.capped ? `; stopped at ${MAX_FILES}, so some were left unread` : '') + '.');
    // A few of the addresses that failed, by reason: what to look at when the scan builds a chunk's address wrong.
    for (const r of Object.keys(why)) {
      console.log(`  ${r}: ${[...found.failed].filter(([, w]) => w === r).slice(0, 3).map(([u]) => new URL(u).pathname).join('  ')}`);
    }
  }
  console.log(`\nrea parsed ${evidence.parsed} of ${files.size} files`
    + (evidence.failed.length ? `; ${evidence.failed.length} it was not run on or failed on, read by this scan alone` : '')
    + (evidence.unparsed.length ? `; ${evidence.unparsed.length} it could not parse (${evidence.unparsed.slice(0, 3).join('  ')})` : '') + '.');
  if (missing.length) {
    console.log('Chunks the code loads that were not read, so their calls are not below:');
    for (const m of missing) console.log(`  ${m.build || '/'}: ${m.keys.length} (${m.keys.slice(0, 8).join(', ')}${m.keys.length > 8 ? ', …' : ''})`);
  }
  if (evidence.sourceMaps.length) console.log(`${evidence.sourceMaps.length} files declare a source map (the code as it was written): ${evidence.sourceMaps.slice(0, 3).map((m) => m.url).join('  ')}`);

  show(services, 'Services', (s) => s.name);
  show(calls, 'API calls in the code', callLine);
  show(pages, 'Legacy pages and popups in the code', (p) => `${p.path}    [${p.proof}] ${p.where}`);
  show(legacy, 'Legacy pages linked from the summary page', (p) => p.path);
  if (ALL) {
    console.log(`\nThe app's own pages and service bases (${app.length}): ${app.map((p) => p.path).join('  ')}`);
    console.log(`\nThe app's page routes, as rea read them (${evidence.routes.size}): ${[...evidence.routes].sort().join('  ')}`);
  }
  console.log('\n[ast] rea parsed the call, its address a literal; [call] a call read here, its address built from parts ({});'
    + '\n[named] a string that reads as an address, no call seen: a table of paths, or the address of a call that takes it'
    + '\nfrom a variable. These are candidates, not calls to try: open the matching section in the site and record its traffic.');

  if (OUT) {
    const file = resolve(OUT);
    writeFileSync(file, JSON.stringify({
      scanned: new Date().toISOString(),
      rea: args.includes('--no-rea') ? null : REA_VERSION,
      files: [...files.keys()],
      failed: [...found.failed].map(([u, why]) => ({ file: new URL(u).pathname, why })),
      services, calls, pages, app, legacyPages: legacy, routes: [...evidence.routes].sort(),
      missingChunks: missing, sourceMaps: evidence.sourceMaps, unparsed: evidence.unparsed, notAnalyzed: evidence.failed,
    }, null, 2) + '\n');
    console.log('Wrote ' + file);
  }
  if (!FROM && !SAVE) rmSync(dir, { recursive: true, force: true });
  else if (SAVE) console.log(`Kept the scripts in ${dir} (site code, not records; still, keep it out of the repository). Run again on them with --from.`);
  if (!KEEP) process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
