// The two seams scripts/headless-export.mjs puts under the collector (src/core/): the Maccabi Online
// page as its Transport, and a folder as its Sink. Kept apart from the script so the tests can run them
// without a browser. `core` is the bundled src/cli/index.ts (or, in the tests, the sources themselves).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { call } from './in-page.mjs';

// ---- the page as a Transport ------------------------------------------------------------------

/**
 * Requests sent from inside the page, by the functions the extension runs in the tab (fetchInPage and
 * xhrInPage in src/extension/background/tab.ts), with its limits: a request is given up after STALL_MS
 * without a byte, a body over TAB_MAX_BYTES is left behind, and the page gets TAB_FETCH_TIMEOUT_MS in all.
 */
export function pageTransport(page, core) {
  const absolute = (req) => ({ ...req, url: new URL(req.url, core.MACCABI_ORIGIN).toString() });
  return {
    async fetch(req) {
      const r = await page.evaluate(call(core.fetchInPage, absolute(req), core.STALL_MS, core.TAB_MAX_BYTES), core.TAB_FETCH_TIMEOUT_MS);
      if (!r.ok) throw new Error(r.error);
      const { b64, ...head } = r;
      return { ...head, bytes: b64 ? new Uint8Array(Buffer.from(b64, 'base64')) : new Uint8Array() };
    },
    xhr(req) {
      return page.evaluate(call(core.xhrInPage, absolute(req)));
    },
    pagePath: () => page.evaluate('location.pathname'),
  };
}

/** The click the site's idle timers listen for (activityInPage in tab.ts); a page between documents is left alone. */
export function keepAlive(page, core) {
  return page.probe(call(core.activityInPage), undefined);
}

/** The member's session as the page holds it (token and member id), or null when nobody is signed in. */
export async function sessionOf(page, core, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const s = await page.probe(call(core.snapshotInPage), null);
    if (s && s.host === new URL(core.MACCABI_ORIGIN).hostname && s.jwt) {
      const { mid, gender } = core.sessionFrom(s.cookieMid, s.jwt);
      if (mid) return { mid, jwt: s.jwt, gender };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// ---- a folder as a Sink -------------------------------------------------------------------------

/**
 * What the folder sink keeps for itself, beside the export's files: which documents were not written
 * because the folder already held their bytes under another name. The extension keeps this in its
 * staging; a folder has to keep it in the folder, or a rerun would ask for each of them again.
 */
export const SINK_STATE = '.export-state.json';
/** A file being written. It takes its name only once it is whole, so a run cut off mid-write leaves no half document. */
const PART = '.part';

/** The export folder, with the extension's write rules: JSON rewritten only when changed, documents kept. */
export function folderSink(core, dir, version) {
  const shas = new Map(); // sha256 -> rel, of the documents already in the folder
  const aliases = new Map();
  const problems = [];
  let step = '';
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  /** Every file of the export under d, as [rel, full]; the sink's own state is not one, and a leftover part is removed. */
  const files = (d, rel = '') => {
    const out = [];
    for (const name of existsSync(d) ? readdirSync(d) : []) {
      const full = join(d, name);
      const r = rel ? rel + '/' + name : name;
      if (statSync(full).isDirectory()) out.push(...files(full, r));
      else if (name.endsWith(PART)) rmSync(full, { force: true });
      else if (r !== SINK_STATE) out.push([r, full]);
    }
    return out;
  };
  for (const [r, full] of files(dir)) if (!r.endsWith('.json') && !r.endsWith('.md')) shas.set(sha(readFileSync(full)), r);
  const read = (rel) => (existsSync(join(dir, rel)) ? new Uint8Array(readFileSync(join(dir, rel))) : undefined);
  const write = (rel, bytes) => {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full + PART, bytes);
    renameSync(full + PART, full);
  };
  try {
    // An alias whose file has gone says nothing any more: the document is asked for again.
    for (const [rel, existing] of Object.entries(JSON.parse(readFileSync(join(dir, SINK_STATE), 'utf8')).aliases || {})) {
      if (existsSync(join(dir, existing))) aliases.set(rel, existing);
    }
  } catch {
    /* no state yet, or not ours to read: start without */
  }
  return {
    problems,
    /** The step whose problems are filed from here on, as the extension's staging is told. */
    setStep(name) {
      step = name;
    },
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
      write(SINK_STATE, Buffer.from(JSON.stringify({ aliases: Object.fromEntries(aliases) }, null, 2) + '\n'));
    },
    async aliasOf(rel) {
      return aliases.get(rel) ?? null;
    },
    async problem(p) {
      problems.push({ ...p, step });
    },
    /**
     * The root files the extension's save step writes, from what the folder holds. `ran` is the steps this
     * run took: the README says of the rest that they were not collected, not that the site had nothing.
     */
    writeRootFiles(startedAt, ran) {
      const counts = {};
      let medicalFile = null;
      for (const [r] of files(dir)) {
        if (r.includes('/')) counts[r.split('/')[0]] = (counts[r.split('/')[0]] || 0) + 1;
        else if (r.endsWith('_medical-file.pdf') && (!medicalFile || r > medicalFile)) medicalFile = r;
      }
      const errors = core.exportErrors(problems);
      write(core.EXPORT_ERRORS, Buffer.from(JSON.stringify(errors, null, 2) + '\n'));
      const made = { version: version + ' (headless-export)', layout: core.FILE_LAYOUT, startedAt, dev: false };
      const readme = core.exportReadme(core.israelToday(Date.now()), counts, medicalFile, errors, made, core.notCollected(ran));
      write('README.md', Buffer.from(readme));
      for (const [name, text] of Object.entries(core.INSTRUCTION_POINTERS)) write(name, Buffer.from(text));
      return { files: counts, errors };
    },
  };
}
