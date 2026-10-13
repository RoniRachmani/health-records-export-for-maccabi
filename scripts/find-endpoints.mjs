// Lists what Maccabi Online's own front-end code can call that docs/endpoints.json does not map: the API
// services and paths named in the site's script files, and the legacy pages its menus link to. For finding
// records the export could add, and for seeing what moved after the site changes.
//
//   npm run endpoints                     the services and API paths that endpoints.json does not have
//   npm run endpoints -- --all            the ones it has too, marked, and the app's own page routes
//   npm run endpoints -- --out FILE       also writes everything found to FILE as JSON
//   npm run endpoints -- --keep           leave the browser open at the end
//
// It opens the browser and signs in as `npm run export` does (scripts/maccabi-browser.mjs), then reads only
// static files: the scripts the /sonline/ app loads, the chunks they name, and the scripts of the legacy
// summary page the extension itself opens, plus the addresses that page links to. It calls no API, so a path
// it prints is a candidate to look at by hand, in the site, never something to try from here: an unknown
// call may change something on the account (see "Read-only" in CLAUDE.md). Script files hold no member's
// data, and links are kept without their query strings, so what it prints and writes is the site's code,
// not the account's.
import { writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { call } from './in-page.mjs';
import { ORIGIN, START, openBrowser, signIn } from './maccabi-browser.mjs';
import { root, sleep } from './stage.mjs';

/** Requests are paced as the collector's are (PACE_MS in src/core), one at a time. */
const PACE_MS = 300;
/** Enough for any bundle split; a scan that reaches it says so. */
const MAX_FILES = 600;
const LEGACY_PAGE = ORIGIN + '/online/medicalfile/summary/';
/** How long a page is left to load its scripts before they are listed. */
const SETTLE_MS = 5000;

// ---- reading the code (pure: what the tests and a dry run can call) -------------------------------

/** A string that names a service call: a REST service, a versioned route, or a legacy handler or page. */
// The /sonline/ app writes its routes from the version on (v1/members/...), apart from the service's base.
const API_MARK = /[A-Za-z]API\/|webapi|(?:^|\/)v\d+\/|(?:^|\/)members\/|\.asmx|\.ashx|\.aspx|\/s?online\//i;
const URLISH = /^[\w\-./{}*:?=&%]+$/;

/** String literals in a script; a template literal's ${...} becomes {}. */
export function literals(text) {
  const out = [];
  const re = /"((?:[^"\\\n]|\\.){2,300})"|'((?:[^'\\\n]|\\.){2,300})'|`((?:[^`\\]|\\.){2,600})`/g;
  for (const m of text.matchAll(re)) {
    if (m[3] !== undefined) out.push(m[3].replace(/\$\{[^}]*\}/g, '{}'));
    else out.push(m[1] ?? m[2]);
  }
  return out;
}

/** One path's comparable shape: no origin, query or slashes at the ends, variables as *, lower case. */
export function shape(path) {
  return path
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/[?#].*$/, '')
    .split('/')
    .map((s) => (/^(\{[^}]*\}|<[^>]*>|\d+|\*|:\w+)$/.test(s) ? '*' : s.replace(/\{\}/g, '')))
    .join('/')
    .replace(/^[/*]+|[/*]+$/g, '')
    .replace(/^s?online\/(?=\w+api\/)/i, '') // the REST services sit under /sonline/
    .toLowerCase();
}

/** What one script names: API paths, service names, the app's page routes, and other script files. */
export function scan(text) {
  const paths = new Set();
  const routes = new Set();
  const files = new Set();
  for (const s of literals(text)) {
    if (API_MARK.test(s) && URLISH.test(s.replace(/\{\}/g, ''))) paths.add(s);
    if (/^[\w.\-/]+\.m?js$/.test(s) && !s.includes('//')) files.add(s);
  }
  for (const m of text.matchAll(/\bpath\s*:\s*["'`]([\w\-/:]*)["'`]/g)) if (m[1]) routes.add(m[1]);
  // webpack's and Rspack's runtimes name lazy chunks from an id-to-hash map, after a folder from the site's
  // public path and, sometimes, a map of names: "static/js/async/"+({12:"name"}[id]||id)+"."+{12:"9f3a…"}[id]+".js".
  // A chunk with a folder is written "@public:<folder><file>", for readScripts to place under the public path.
  for (const m of text.matchAll(/\{((?:\s*["']?\w+["']?\s*:\s*["'][0-9a-f]{6,}["']\s*,?)+)\}\[\w+\]\s*\+\s*["'](\.?[\w.]*js)["']/g)) {
    const before = text.slice(Math.max(0, m.index - 20_000), m.index);
    const lead = before.match(/(?:["']([\w./-]*)["']\s*\+\s*)?(?:\(\s*\{([^{}]*)\}\[\w+\]\s*\|\|\s*\w+\s*\)|\w+)\s*\+\s*["']\.["']\s*\+\s*$/);
    const folderPart = lead?.[1] || '';
    const names = {};
    for (const n of (lead?.[2] || '').matchAll(/["']?(\w+)["']?\s*:\s*["']([\w.-]+)["']/g)) names[n[1]] = n[2];
    const suffix = m[2].startsWith('.') ? m[2] : '.' + m[2];
    for (const p of m[1].matchAll(/["']?(\w+)["']?\s*:\s*["']([0-9a-f]+)["']/g)) {
      const file = `${names[p[1]] || p[1]}.${p[2]}${suffix}`;
      files.add(folderPart ? '@public:' + folderPart + file : file);
    }
  }
  const services = new Set([...text.matchAll(/\b([A-Z][A-Za-z]+API)\b/g)].map((m) => m[1]));
  return { paths, services, routes, files };
}

/** Every path and service docs/endpoints.json names, wherever in it they are written. */
export function knownFrom(endpoints) {
  const strings = [];
  const walk = (x) => {
    if (typeof x === 'string') strings.push(x);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(endpoints);
  const paths = new Set();
  const services = new Set();
  for (const s of strings) {
    for (const m of s.matchAll(/[\w/{}<>.\-]*(?:[A-Za-z]API\/|webapi|\.asmx|\.ashx|\.aspx|\/online\/)[\w/{}<>.\-]*/g)) paths.add(shape(m[0]));
    for (const m of s.matchAll(/\b([A-Z][A-Za-z]+API)\b/g)) services.add(m[1]);
  }
  // Only shapes with a route in them: the bases' templates (<Service>/.../...) and lone names say nothing.
  return { paths: [...paths].filter((p) => p.includes('/') && !p.includes('...')), services };
}

/**
 * What a path in the code is: 'api' (a call that returns data), 'page' (a web page or popup of the legacy
 * site), 'app' (a page of the /sonline/ app, or one of its service bases), or 'noise' (static files, other
 * sites, a developer's localhost).
 */
export function kind(path) {
  if (/^https?:\/\/(?!online\.maccabi4u\.co\.il\/)/i.test(path)) return 'noise';
  const p = path.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
  if (/\.(m?js|css|ico|png|svg|gif|jpe?g|woff2?|map)$/i.test(p) || /^\/?(retail|sonline\/scripts|sonline\/static)\//i.test(p)) return 'noise';
  if (/\.aspx$/i.test(p) && !/webapi/i.test(p)) return 'page';
  if (/[A-Za-z]API\/|webapi|\.asmx|\.ashx|(?:^|\/)v\d+\/|(?:^|\/)members\//i.test(p)) {
    return /^\/?(sonline\/)?\w+\/webapi\/mac\/?$/i.test(p) ? 'app' : 'api';
  }
  return /^\/?sonline\//i.test(p) ? 'app' : 'page';
}

/**
 * A path is known when its shape is whole segments of one endpoints.json maps: code often builds a path in
 * pieces, so a piece of a mapped path is that path.
 */
export function isKnown(path, known) {
  const s = shape(path);
  if (!s || /^(v\d+|members|webapi|online|sonline)$/.test(s)) return true; // a piece too small to say anything
  return known.paths.some((k) => ('/' + k + '/').includes('/' + s + '/'));
}

// ---- the run -------------------------------------------------------------------------------------

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

/**
 * A file the code names, as an address. One the runtime places under the public path ("@public:static/js/async/…")
 * goes where the script that named it sits above its own first folder: /sonline/static/js/x.js names
 * /sonline/static/js/async/….
 */
export function chunkUrl(f, from) {
  if (!f.startsWith('@public:')) return new URL(f, from).href;
  const rel = f.slice('@public:'.length);
  const u = new URL(from);
  const top = rel.split('/')[0];
  const at = top && rel.includes('/') ? u.pathname.indexOf('/' + top + '/') : -1;
  const base = at >= 0 ? u.pathname.slice(0, at + 1) : u.pathname.replace(/[^/]*$/, '');
  return new URL(base + rel, u.origin).href;
}

export async function readScripts(page, start, found) {
  const queue = [...start];
  let redirects = 0;
  while (queue.length && found.read.size + found.failed.size < MAX_FILES) {
    const url = queue.shift();
    if (found.read.has(url) || found.failed.has(url) || !ours(url)) continue;
    const got = await page.evaluate(call(fetchText, url), 60_000);
    await sleep(PACE_MS);
    const name = new URL(url).pathname.split('/').pop();
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
    const seen = scan(got.text);
    for (const p of seen.paths) if (!found.paths.has(p)) found.paths.set(p, name);
    seen.services.forEach((x) => found.services.add(x));
    seen.routes.forEach((r) => found.routes.add(r));
    for (const f of seen.files) {
      const next = chunkUrl(f, url);
      if (!found.read.has(next) && !found.failed.has(next) && !queue.includes(next)) queue.push(next);
    }
    if (found.read.size % 10 === 0) console.log(`  ${found.read.size} read, ${found.failed.size} would not load, ${queue.length} to go`);
  }
  console.log(`  Done: ${found.read.size} read, ${found.failed.size} would not load.`);
  if (queue.some((u) => ours(u) && !found.read.has(u) && !found.failed.has(u))) found.capped = true;
}

async function main() {
  const args = process.argv.slice(2);
  const ALL = args.includes('--all');
  const KEEP = args.includes('--keep');
  const outAt = args.indexOf('--out');
  const OUT = outAt >= 0 ? args[outAt + 1] : undefined;
  if (outAt >= 0 && (!OUT || OUT.startsWith('--'))) throw new Error('--out takes a file: --out ~/endpoint-scan.json');

  const known = knownFrom(JSON.parse(readFileSync(join(root, 'docs/endpoints.json'), 'utf8')));
  const page = await openBrowser({ startUrl: START, keep: KEEP });
  await signIn(page);
  console.log('Signed in. Reading the /sonline/ app\'s scripts (no API is called).');
  await sleep(SETTLE_MS);

  const found = { read: new Set(), failed: new Map(), paths: new Map(), services: new Set(), routes: new Set(), legacyPages: [], capped: false };
  const scripts = await page.evaluate(call(loadedScripts));
  console.log(`  The page loaded ${scripts.filter(ours).length} script files from Maccabi's own servers.`);
  await readScripts(page, scripts, found);

  console.log('Reading the legacy summary page\'s scripts and links.');
  await page.navigate(LEGACY_PAGE);
  await sleep(SETTLE_MS);
  if ((await page.probe('location.pathname', '')).startsWith('/online/')) {
    found.legacyPages = (await page.probe(call(pageLinks, ORIGIN), [])).filter((p) => p.startsWith('/online/')).sort();
    await readScripts(page, await page.probe(call(loadedScripts), []), found);
  } else {
    console.log('  The legacy page did not open (logged out?); its part is left out.');
  }

  // Legacy services and popups are written from /online/ down (/Ajax/..., /Pages/...); endpoints.json writes them whole.
  const legacyAt = (p) => (/^\/(ajax|handlers|pages|webapi)\//i.test(p) ? '/online' + p : p);
  const all = [...found.paths].map(([path, file]) => ({ path, file, kind: kind(path), known: isKnown(legacyAt(path), known) }))
    .sort((a, b) => shape(a.path).localeCompare(shape(b.path)));
  const paths = all.filter((p) => p.kind === 'api');
  const pages = all.filter((p) => p.kind === 'page');
  const services = [...found.services].sort().map((name) => ({ name, known: known.services.has(name) }));
  const legacy = found.legacyPages.map((path) => ({ path, known: isKnown(path, known) }));

  const show = (list, label, line) => {
    const shown = ALL ? list : list.filter((x) => !x.known);
    console.log(`\n${label}: ${list.filter((x) => !x.known).length} not in endpoints.json, of ${list.length}`);
    for (const x of shown) console.log('  ' + (ALL ? (x.known ? '  known ' : '  NEW   ') : '') + line(x));
  };
  const why = {};
  for (const r of found.failed.values()) why[r] = (why[r] || 0) + 1;
  const whyText = Object.entries(why).map(([r, n]) => `${n} ${r}`).join(', ');
  console.log(`\nRead ${found.read.size} script files` + (found.failed.size ? `; ${found.failed.size} would not load (${whyText})` : '')
    + (found.capped ? `; stopped at ${MAX_FILES}, so some were left unread` : '') + '.');
  // A few of the addresses that failed, by reason: what to look at when the scan builds a chunk's address wrong.
  for (const r of Object.keys(why)) {
    const some = [...found.failed].filter(([, w]) => w === r).slice(0, 3).map(([u]) => new URL(u).pathname);
    console.log(`  ${r}: ${some.join('  ')}`);
  }
  show(services, 'Services', (s) => s.name);
  show(paths, 'API calls in the code', (p) => `${p.path}    (${p.file})`);
  show(pages, 'Legacy pages and popups in the code', (p) => `${p.path}    (${p.file})`);
  show(legacy, 'Legacy pages linked from the summary page', (p) => p.path);
  if (ALL) {
    const app = all.filter((p) => p.kind === 'app').map((p) => p.path);
    console.log(`\nThe app's own pages and service bases (${app.length}): ${app.join('  ')}`);
    console.log(`\nThe app's page routes (${found.routes.size}): ${[...found.routes].sort().join('  ')}`);
  }
  console.log('\nThese are candidates, not calls to try: open the matching section in the site and record its traffic.');

  if (OUT) {
    const file = resolve(OUT);
    writeFileSync(file, JSON.stringify({
      scanned: new Date().toISOString(),
      files: [...found.read].map((u) => new URL(u).pathname),
      failed: [...found.failed].map(([u, why]) => ({ file: new URL(u).pathname, why })),
      services, paths, pages, app: all.filter((p) => p.kind === 'app'), legacyPages: legacy, routes: [...found.routes].sort(),
    }, null, 2) + '\n');
    console.log('Wrote ' + file);
  }
  if (!KEEP) process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
