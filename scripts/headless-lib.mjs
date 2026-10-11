// The two seams scripts/headless-export.mjs puts under the collector (src/core/): the Maccabi Online
// page as its Transport, and a folder as its Sink. Kept apart from the script so the tests can run them
// without a browser. `core` is the bundled src/cli/index.ts (or, in the tests, the sources themselves).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ORIGIN = 'https://online.maccabi4u.co.il';

// A value written into code that a page evaluates (as in maccabi-browser.mjs).
const UNSAFE = { '<': '\\u003C', '>': '\\u003E', '/': '\\u002F', '\u2028': '\\u2028', '\u2029': '\\u2029' };
const lit = (value) => JSON.stringify(value).replace(/[<>/\u2028\u2029]/g, (c) => UNSAFE[c]);

/** Seconds without a byte after which a request is given up, and the largest body brought back (as in the extension). */
export const STALL_MS = 60_000;
export const MAX_BYTES = 32 * 1024 * 1024;

// ---- the page as a Transport ------------------------------------------------------------------

/** Runs in the page: fetchInPage from src/extension/background/tab.ts, as source for Runtime.evaluate. */
export const FETCH_IN_PAGE = `async (req, stallMs, maxBytes) => {
  const abort = new AbortController();
  let timer;
  const alive = () => { clearTimeout(timer); timer = setTimeout(() => abort.abort(), stallMs); };
  try {
    alive();
    const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, credentials: 'include', redirect: req.redirect || 'follow', signal: abort.signal });
    const head = { ok: true, status: r.status, redirected: r.type === 'opaqueredirect', contentType: r.headers.get('content-type') || '', retryAfter: r.headers.get('retry-after') || undefined, url: r.url };
    if (Number(r.headers.get('content-length')) > maxBytes) { abort.abort(); return { ...head, tooLarge: true }; }
    const parts = [];
    let length = 0;
    if (r.body) {
      const reader = r.body.getReader();
      for (;;) {
        alive();
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxBytes) { abort.abort(); return { ...head, tooLarge: true }; }
        parts.push(value);
      }
    }
    const buf = new Uint8Array(length);
    let at = 0;
    for (const p of parts) { buf.set(p, at); at += p.length; }
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
    return { ...head, b64: btoa(bin) };
  } catch (e) {
    return { ok: false, error: abort.signal.aborted ? 'Maccabi Healthcare Services sent nothing for ' + stallMs / 1000 + ' s' : (e && e.message) || String(e) };
  } finally {
    clearTimeout(timer);
  }
}`;

/** Runs in the page: xhrInPage from tab.ts. Never rejects: status 0 on error. */
export const XHR_IN_PAGE = `(req) => new Promise((resolve) => {
  const x = new XMLHttpRequest();
  x.open(req.method, req.url, true);
  const h = req.headers || {};
  for (const k in h) x.setRequestHeader(k, h[k]);
  x.onload = () => resolve({ status: x.status, text: x.responseText });
  x.onerror = () => resolve({ status: 0, text: '' });
  x.send(req.body);
})`;

/** Runs in the page: activityInPage from tab.ts, the click the site's idle timers listen for. */
export const ACTIVITY_IN_PAGE = `(() => {
  document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  if (typeof resetActive !== 'function') return;
  const counting = window.countDownStarted === true;
  if (counting) window.countDownStarted = false;
  resetActive();
  if (counting && typeof closedialog === 'function') closedialog();
})()`;

export const SNAPSHOT = `({ host: location.hostname, path: location.pathname,
  cookieMid: (document.cookie.match(/cookie_sessionId_0_(\\d+)/) || [])[1] || null,
  jwt: sessionStorage.getItem('token') })`;

export function pageTransport(page) {
  return {
    async fetch(req) {
      const url = new URL(req.url, ORIGIN).toString();
      const r = await page.evaluate(`(${FETCH_IN_PAGE})(${lit({ ...req, url })}, ${STALL_MS}, ${MAX_BYTES})`);
      if (!r.ok) throw new Error(r.error);
      const { b64, ...head } = r;
      return { ...head, bytes: b64 ? new Uint8Array(Buffer.from(b64, 'base64')) : new Uint8Array() };
    },
    xhr(req) {
      return page.evaluate(`(${XHR_IN_PAGE})(${lit({ ...req, url: new URL(req.url, ORIGIN).toString() })})`);
    },
    pagePath: () => page.evaluate('location.pathname'),
  };
}

/** The member's session as the page holds it (token and member id), or null when nobody is signed in. */
export async function sessionOf(page, core, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const s = await page.probe(SNAPSHOT, null);
    if (s && s.host === new URL(ORIGIN).hostname && s.jwt) {
      const { mid, gender } = core.sessionFrom(s.cookieMid, s.jwt);
      if (mid) return { mid, jwt: s.jwt, gender };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// ---- a folder as a Sink -------------------------------------------------------------------------

/** The export folder, with the extension's write rules: JSON rewritten only when changed, documents kept. */
export function folderSink(core, dir, version) {
  const shas = new Map(); // sha256 -> rel, of the documents already in the folder
  const aliases = new Map();
  const problems = [];
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const walk = (d, rel = '') => {
    for (const name of existsSync(d) ? readdirSync(d) : []) {
      const full = join(d, name);
      const r = rel ? rel + '/' + name : name;
      if (statSync(full).isDirectory()) walk(full, r);
      else if (!r.endsWith('.json') && !r.endsWith('.md')) shas.set(sha(readFileSync(full)), r);
    }
  };
  walk(dir);
  const read = (rel) => (existsSync(join(dir, rel)) ? new Uint8Array(readFileSync(join(dir, rel))) : undefined);
  const write = (rel, bytes) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), bytes);
  };
  return {
    problems,
    async exists(rel) {
      return existsSync(join(dir, rel));
    },
    async putJson(rel, obj) {
      const bad = core.badPath(rel);
      if (bad) return { error: bad };
      const result = core.jsonResult(read(rel), obj);
      if (result !== 'unchanged') write(rel, core.jsonBytes(obj));
      return { result };
    },
    async putBin(rel, bytes, replace) {
      const bad = core.badPath(rel);
      if (bad) return { error: bad };
      const result = core.binResult(read(rel), bytes, replace);
      if (result === 'written' || result === 'updated') {
        for (const [s, at] of shas) if (at === rel) shas.delete(s);
        write(rel, bytes);
        shas.set(sha(bytes), rel);
      }
      return { result };
    },
    async findBySha256(s) {
      return shas.get(s) ?? null;
    },
    async putAlias(rel, existing) {
      aliases.set(rel, existing);
    },
    async aliasOf(rel) {
      return aliases.get(rel) ?? null;
    },
    async problem(p) {
      problems.push(p);
    },
    /** The root files the extension's save step writes, from what the folder holds. */
    writeRootFiles(startedAt) {
      const files = {};
      let medicalFile = null;
      const count = (d, rel = '') => {
        for (const name of readdirSync(d)) {
          const full = join(d, name);
          const r = rel ? rel + '/' + name : name;
          if (statSync(full).isDirectory()) count(full, r);
          else if (r.includes('/')) files[r.split('/')[0]] = (files[r.split('/')[0]] || 0) + 1;
          else if (r.endsWith('_medical-file.pdf') && (!medicalFile || r > medicalFile)) medicalFile = r;
        }
      };
      count(dir);
      const errors = core.exportErrors(problems);
      write(core.EXPORT_ERRORS, Buffer.from(JSON.stringify(errors, null, 2) + '\n'));
      const made = { version: version + ' (headless-export)', layout: core.FILE_LAYOUT, startedAt, dev: false };
      write('README.md', Buffer.from(core.exportReadme(core.israelToday(Date.now()), files, medicalFile, errors, made)));
      for (const [name, text] of Object.entries(core.INSTRUCTION_POINTERS)) write(name, Buffer.from(text));
      return { files, errors };
    },
  };
}
