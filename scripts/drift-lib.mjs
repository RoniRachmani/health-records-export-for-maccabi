// What scripts/drift-check.mjs (npm run drift) puts together, kept apart from it so the tests can run it against
// the fake site: a Sink that keeps no record, a Transport that counts answers by endpoint, the run of every step,
// the endpoint scan over the session's own requests, and the report. `core` is the bundled src/cli/index.ts (or, in
// the tests, the sources themselves).
//
// The report is the one thing a drift check writes, and it is written to be safe to read anywhere: endpoint keys
// (endpointKey in shared/shapes.ts: no host, no query, no id), field paths and types, step and folder names, HTTP
// statuses and counts. Never a value, a title, a file name or the member id. The one exception is the site's feature
// flags (featureFlags), which are the site's settings and not the member's records: their names and true or false.
import { createHash } from 'node:crypto';
import { candidates, chunkFiles, chunkUrl, coverage, knownFrom, mappedRequests } from '../tools/endpoint-scan/endpoint-scan-lib.mjs';

/** @import { Problem, SaveReply, Session, Sink, Transport } from '../src/core' */
/** @typedef {Record<string, Record<string, string[]>>} Shapes */
/** What these take from core: the bundled src/cli/index.ts, or the sources in a test. @typedef {any} Core */
/**
 * The run's Sink: JSON kept in memory for the steps that read back what an earlier one wrote (STEP_NEEDS), and of a
 * document only its digest, so the alias rules hold and nothing of it outlives the run. Counts what it was given.
 * @typedef {Sink & {
 *   problems: (Problem & { step: string })[];
 *   setStep(name: string): void;
 *   counts(): Record<string, number>;
 * }} MemorySink
 */
/** @typedef {{ step: string; kind: string; folder: string; detail: string }} ProblemKey */

// ---- a Sink that keeps nothing -----------------------------------------------------------------------

/**
 * @param {Core} core
 * @returns {MemorySink}
 */
export function memorySink(core) {
  /** @type {Map<string, Uint8Array>} */
  const json = new Map();
  /** @type {Map<string, string>} rel -> sha256 of a document */
  const docs = new Map();
  /** @type {Map<string, string>} sha256 -> rel */
  const shas = new Map();
  /** @type {Map<string, string>} */
  const aliases = new Map();
  /** @type {MemorySink['problems']} */
  const problems = [];
  let step = '';
  const sha = (/** @type {Uint8Array} */ b) => createHash('sha256').update(b).digest('hex');
  return {
    problems,
    setStep(name) {
      step = name;
    },
    async exists(rel) {
      return json.has(rel) || docs.has(rel);
    },
    async readJson(rel) {
      return core.parseJson(json.get(rel));
    },
    async putJson(rel, obj) {
      const bad = core.badPath(rel);
      if (bad) return { error: bad };
      const result = core.jsonResult(json.get(rel), obj);
      if (result !== 'unchanged') json.set(rel, core.jsonBytes(obj));
      return { result };
    },
    async putBin(rel, bytes, replace) {
      const bad = core.badPath(rel);
      if (bad) return { error: bad };
      const had = docs.get(rel);
      const now = sha(bytes);
      /** @type {SaveReply['result']} */
      const result = had === undefined ? 'written' : !replace ? 'kept_existing' : had === now ? 'unchanged' : 'updated';
      if (result === 'written' || result === 'updated') {
        if (had) shas.delete(had);
        docs.set(rel, now);
        shas.set(now, rel);
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
      problems.push({ ...p, step });
    },
    /** Files per top folder, as an export of this run would hold them, aliases included. */
    counts() {
      /** @type {Record<string, number>} */
      const out = {};
      for (const rel of [...json.keys(), ...docs.keys(), ...aliases.keys()]) {
        if (rel.includes('/')) out[rel.split('/')[0]] = (out[rel.split('/')[0]] || 0) + 1;
      }
      return out;
    },
  };
}

// ---- what the site answered ----------------------------------------------------------------------------

/**
 * Passes every request on, and counts each answer's status under its endpoint key, and the requests that got none.
 * @param {Transport} base
 * @param {Core} core
 * @param {string | null} mid
 * @returns {Transport & { statuses: Record<string, Record<string, number>> }}
 */
export function countingTransport(base, core, mid) {
  /** @type {Record<string, Record<string, number>>} */
  const statuses = {};
  const count = (/** @type {string} */ key, /** @type {string} */ status) => {
    const s = (statuses[key] ??= {});
    s[status] = (s[status] || 0) + 1;
  };
  return {
    ...base,
    statuses,
    async fetch(req) {
      const key = core.endpointKey(req.method, req.url, mid);
      try {
        const r = await base.fetch(req);
        count(key, String(r.status));
        return r;
      } catch (e) {
        count(key, 'no answer');
        throw e;
      }
    },
  };
}

/**
 * The steps in the run's order, the legacy ones first under one priming of their page, as the extension's run and
 * `npm run export` take them. A control error (an ended session, a 429 past waiting) stops the run: it is filed
 * against the step it happened in and returned as `stopped`, and the steps after it are not run.
 * @param {Core} core
 * @param {{ collector: any; ctx: any; sink: MemorySink; steps: readonly string[];
 *   primeLegacy(): Promise<void>; backToPortal(): Promise<Session | null | undefined>; log?: (line: string) => void }} run
 * @returns {Promise<{ ran: string[]; stopped: string | null; seconds: Record<string, number> }>}
 */
export async function runSteps(core, { collector, ctx, sink, steps, primeLegacy, backToPortal, log = () => {} }) {
  const legacy = steps.filter((s) => core.LEGACY_STEPS.includes(s));
  const rest = steps.filter((s) => !core.LEGACY_STEPS.includes(s));
  /** @type {string[]} */
  const ran = [];
  /** @type {Record<string, number>} */
  const seconds = {};
  let current = '';
  const one = async (/** @type {string} */ name) => {
    const t = Date.now();
    current = name;
    ran.push(name);
    sink.setStep(name);
    await core.runStep(collector, ctx, name);
    seconds[name] = Math.round((Date.now() - t) / 100) / 10;
    log(`${name}: ${seconds[name]} s`);
  };
  try {
    if (legacy.length) {
      current = legacy[0];
      await primeLegacy();
      for (const name of legacy) await one(name);
      current = rest[0] || '';
      collector.session = (await backToPortal()) || collector.session;
    }
    for (const name of rest) await one(name);
    return { ran, stopped: null, seconds };
  } catch (e) {
    if (current && !ran.includes(current)) ran.push(current);
    sink.setStep(current);
    await collector.problem(current || 'run', e.message);
    return { ran, stopped: current || 'run', seconds };
  }
}

/**
 * A problem as the report may name it: its step, its kind, the folder it was filed under (the first segment of
 * `where`, never a file name), and what kind of failure it was, read off its text by pattern alone. A 'shape' problem
 * names the list key the collector expected; the keys found instead are kept only where they read as field names.
 * @param {Problem & { step: string }} p
 * @returns {ProblemKey}
 */
export function problemKey(p) {
  const folder = /^[\w-]+$/.test(p.where.split('/')[0]) ? p.where.split('/')[0] : '?';
  if (p.kind === 'shape') {
    const expected = p.what.match(/expected a `(\w{1,40})` list/)?.[1] || '?';
    const found = p.what.match(/found (.*)$/)?.[1] || '';
    const words = found.replace(/^only /, '').split(/,\s*/).map((w) => w.replace(/`/g, '').trim()).filter(Boolean);
    const safe = words.map((w) => (/^([A-Za-z_]\w{0,39}( as \w+)?|a list|…)$/.test(w) ? w : '<key>'));
    return { step: p.step, kind: 'shape', folder, detail: 'expected `' + expected + '`' + (safe.length ? ', found ' + safe.join(', ') : '') };
  }
  const status = p.what.match(/\b(?:HTTP|status)\s*(\d{3})\b/i)?.[1];
  const detail = status ? 'HTTP ' + status
    : /SESSION ENDED/i.test(p.what) ? 'session ended'
    : /429|rate.?limit/i.test(p.what) ? 'rate limited'
    : /time(d)? ?out|stall/i.test(p.what) ? 'timed out'
    : /too large/i.test(p.what) ? 'too large'
    : /failed to fetch|no answer|network/i.test(p.what) ? 'no answer'
    : 'other';
  return { step: p.step, kind: p.kind || 'failure', folder, detail };
}

/** @param {ProblemKey} k */
const problemLine = (k) => `${k.step} ${k.folder}: ${k.kind}, ${k.detail}`;

// ---- the endpoint scan, over the session ---------------------------------------------------------------

const MAX_FILES = 600;

/** On Maccabi's own servers, over https. @param {string} url */
export function ours(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'maccabi4u.co.il' || u.hostname.endsWith('.maccabi4u.co.il'));
  } catch {
    return false;
  }
}

/**
 * The scripts a page's HTML loads: its script tags, and the scripts it preloads.
 * @param {string} html
 * @param {string} pageUrl
 * @returns {string[]}
 */
export function pageScripts(html, pageUrl) {
  const out = new Set();
  const add = (/** @type {string} */ src) => {
    try {
      out.add(new URL(src.replace(/&amp;/g, '&'), pageUrl).href);
    } catch { /* not an address */ }
  };
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/\brel\s*=\s*["']?(modulepreload|preload)/i.test(m[0]) && (/\bas\s*=\s*["']?script/i.test(m[0]) || /modulepreload/i.test(m[0]))) {
      const href = m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
      if (href) add(href);
    }
  }
  return [...out];
}

/**
 * Reads the scripts in `start` and every script they name, as the endpoint scan does in the page (readScripts in
 * tools/endpoint-scan/endpoint-scan.mjs), with `get` sending each request. Files are kept in memory by their path on
 * the site, for the scan's readers, and dropped with the run.
 * @param {(url: string) => Promise<{ text?: string; failed?: string }>} get
 * @param {string[]} start
 * @param {{ files: Map<string, string>; failed: Map<string, string>; capped: boolean }} found
 */
export async function readScripts(get, start, found) {
  const queue = [...start];
  const seen = new Set([...found.files.keys()].map((p) => p));
  let redirects = 0;
  while (queue.length && found.files.size + found.failed.size < MAX_FILES) {
    const url = /** @type {string} */ (queue.shift());
    const path = ours(url) ? new URL(url).pathname : null;
    if (!path || seen.has(path) || found.failed.has(path)) continue;
    const got = await get(url);
    if (got.failed !== undefined || got.text === undefined) {
      found.failed.set(path, got.failed || 'no text');
      redirects = got.failed === 'redirect' ? redirects + 1 : 0;
      if (redirects >= 3) return; // the session may have ended
      continue;
    }
    redirects = 0;
    seen.add(path);
    found.files.set(path, got.text);
    for (const f of chunkFiles(got.text)) {
      const next = chunkUrl(f, url);
      if (!queue.includes(next)) queue.push(next);
    }
  }
  if (queue.some((u) => ours(u) && !seen.has(new URL(u).pathname) && !found.failed.has(new URL(u).pathname))) found.capped = true;
}

/**
 * One static file's text over the session, as fetchText in the scan reads it in the page: a redirect is not
 * followed, a web page is not a script.
 * @param {{ request(url: string, init?: RequestInit): Promise<Response> }} session
 * @returns {(url: string) => Promise<{ text?: string; failed?: string }>}
 */
export function sessionGet(session) {
  return async (url) => {
    try {
      const r = await session.request(url, { redirect: 'manual' });
      if (r.status >= 300 && r.status < 400) {
        await r.arrayBuffer().catch(() => {});
        return { failed: 'redirect' };
      }
      if (!r.ok) {
        await r.arrayBuffer().catch(() => {});
        return { failed: String(r.status) };
      }
      const text = await r.text();
      return /^\s*</.test(text) ? { failed: 'a web page, not a script' } : { text };
    } catch (e) {
      return { failed: e?.sessionEnded ? 'redirect' : 'no answer' };
    }
  };
}

/**
 * What the scan says about the requests the export makes: each mapped request of endpoints.json the code no longer
 * has (beyond scan-baseline.json's), or calls with another method; and the calls in the code `before` did not have.
 * @param {Map<string, string>} files
 * @param {{ endpoints: any; baseline: string[] }} maps
 * @param {string[] | null} before the calls the last completed check found, as `METHOD path`
 */
export function scanFindings(files, maps, before) {
  const known = knownFrom(maps.endpoints);
  const all = candidates(files, { endpoints: [], routes: new Set(), sourceMaps: [], partial: [], unparsed: [], parsed: 0 }, known);
  const mapped = coverage(mappedRequests(maps.endpoints), all, maps.baseline);
  const calls = [...new Set(all.filter((c) => c.kind === 'api').map((c) => `${c.method || '?'} ${c.path}`))].sort();
  return {
    mapped: mapped.length,
    found: mapped.filter((r) => r.status === 'call' || r.status === 'named').length,
    absent: mapped.filter((r) => r.status === 'absent' && !r.expected).map((r) => `${r.method} ${r.path}`),
    method: mapped.filter((r) => r.status === 'method').map((r) => `${r.method} ${r.path}: called as ${r.calledAs}`),
    calls,
    newCalls: before ? calls.filter((c) => !before.includes(c)) : [],
  };
}

// ---- the site's feature flags --------------------------------------------------------------------------

/**
 * The flags the export's downloads depend on (docs/endpoints/other-endpoints.json says how): a change in one of them
 * says so beside it.
 */
export const FLAGS_THE_EXPORT_READS = ['isOpenPdfByLinkHandlerV2', 'IshurMakdim'];
/** A flag's name is the site's own identifier; anything else is not written into a report. */
const FLAG_NAME = /^[A-Za-z][\w.-]{0,79}$/;

/**
 * The site's feature flags out of the features answer, by name, each value as a string ("true", "false"): or why
 * they could not be read. They are the site's settings, not the member's records, so a report names them and their
 * values, which it does for nothing else.
 * @param {{ status: number; redirected: boolean; bytes: Uint8Array }} r
 * @returns {{ flags: Record<string, string> } | { error: string }}
 */
export function featureFlags(r) {
  if (r.redirected || r.status === 401) return { error: 'session ended' };
  if (r.status !== 200) return { error: 'HTTP ' + r.status };
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(r.bytes));
  } catch {
    return { error: 'the answer is not JSON' };
  }
  const shaped = (/** @type {any} */ f) => f && typeof f === 'object' && typeof f.feature_id === 'string' && FLAG_NAME.test(f.feature_id)
    && ['boolean', 'number', 'string'].includes(typeof f.feature_enabled) && String(f.feature_enabled).length <= 5;
  if (!Array.isArray(data) || !data.length || !data.every(shaped)) return { error: 'the answer is no longer a list of {feature_id, feature_enabled}' };
  /** @type {Record<string, string>} */
  const flags = {};
  for (const f of data) flags[f.feature_id] = String(f.feature_enabled);
  return { flags };
}

/**
 * Each flag that changed since the last completed check: turned, new or gone, by name.
 * @param {Record<string, string>} before
 * @param {Record<string, string>} now
 */
export function flagChanges(before, now) {
  const reads = (/** @type {string} */ name) => (FLAGS_THE_EXPORT_READS.includes(name) ? ' (the export\'s downloads depend on it)' : '');
  /** @type {string[]} */
  const out = [];
  for (const name of [...new Set([...Object.keys(before), ...Object.keys(now)])].sort()) {
    if (!(name in before)) out.push(`${name}: new, ${now[name]}${reads(name)}`);
    else if (!(name in now)) out.push(`${name}: gone, was ${before[name]}${reads(name)}`);
    else if (before[name] !== now[name]) out.push(`${name}: now ${now[name]}, was ${before[name]}${reads(name)}`);
  }
  return out;
}

// ---- the report ----------------------------------------------------------------------------------------

/**
 * Field paths `seen` lacks that `known` has, per endpoint seen: informational, since one account's answers need not
 * carry every field (shapes.json is only ever added to), but a renamed field shows here beside its new name.
 * @param {Shapes} known
 * @param {Shapes} seen
 */
export function missingFields(known, seen) {
  /** @type {string[]} */
  const out = [];
  for (const [endpoint, shape] of Object.entries(seen)) {
    for (const at of Object.keys(known[endpoint] || {})) if (!shape[at]) out.push(endpoint + ' ' + at);
  }
  return out;
}

/** The state a completed check leaves for the next one to compare against: problem lines, calls in the code, flags. */
/** @typedef {{ date: string; problems: string[]; calls: string[] | null; flags?: Record<string, string> | null }} DriftState */

/**
 * The report, as Markdown, and whether anything in it is a difference. A difference: a shape drift line, a 'shape'
 * problem, a problem the last completed check did not have, a mapped request gone from the site's code or called
 * with another method, a feature flag that changed (or flags that could not be read), or a run that could not
 * finish. The rest is said for reading, not counted.
 * @param {{
 *   date: string; seconds: number; requests: number;
 *   stopped: string | null; signIn: string | null;
 *   drift: string[]; missing: string[]; endpoints: number;
 *   problems: ProblemKey[]; before: DriftState | null;
 *   statuses: Record<string, Record<string, number>>;
 *   counts: Record<string, number>;
 *   scan: ReturnType<typeof scanFindings> & { read: number; failed: Record<string, number>; capped: boolean } | { error: string } | null;
 *   flags?: ReturnType<typeof featureFlags> | null;
 * }} r
 * @returns {{ text: string; differs: boolean; failed: boolean; state: DriftState | null }}
 */
export function driftReport(r) {
  /** @type {string[]} */
  const differences = [];
  const out = [`# Maccabi drift check, ${r.date}`, ''];
  if (r.signIn) {
    out.push('**Could not check: ' + r.signIn + '**', '', 'Nothing past the sign-in was asked for.');
    return { text: out.join('\n') + '\n', differs: false, failed: true, state: null };
  }
  const problemLines = [...new Set(r.problems.map(problemLine))].sort();
  const freshProblems = r.before ? problemLines.filter((l) => !r.before?.problems.includes(l)) : problemLines;
  const shapeProblems = problemLines.filter((l) => / shape, /.test(l));
  if (r.stopped) differences.push(`The run stopped in \`${r.stopped}\`; the steps after it were not checked.`);
  for (const d of r.drift) differences.push('Shape: ' + d);
  for (const l of shapeProblems) differences.push('Shape problem: ' + l);
  for (const l of freshProblems) if (!shapeProblems.includes(l)) differences.push('New problem: ' + l);
  const scan = r.scan && 'error' in r.scan ? null : r.scan;
  if (r.scan && 'error' in r.scan) differences.push('The endpoint scan could not run: ' + r.scan.error);
  if (scan && scan.read === 0) differences.push('The endpoint scan read no script files.');
  for (const a of scan?.absent || []) differences.push('Gone from the site\'s code: ' + a);
  for (const m of scan?.method || []) differences.push('Another method in the site\'s code: ' + m);
  const flags = r.flags && 'flags' in r.flags ? r.flags.flags : null;
  const flagsBefore = r.before?.flags ?? null;
  const turned = flags && flagsBefore ? flagChanges(flagsBefore, flags) : [];
  if (r.flags && 'error' in r.flags) differences.push('The feature flags could not be read: ' + r.flags.error);
  for (const t of turned) differences.push('Feature flag: ' + t);

  out.push(differences.length ? `**${differences.length} difference${differences.length > 1 ? 's' : ''}**` : '**No differences**', '');
  for (const d of differences) out.push('- ' + d);
  if (differences.length) out.push('');

  const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
  out.push('## The run', '', `${r.requests} requests in ${Math.round(r.seconds / 6) / 10} min; ${total} files collected and not kept, by folder:`, '');
  for (const [folder, n] of Object.entries(r.counts).sort()) out.push(`- ${folder}: ${n}`);
  out.push('', `Shapes: ${r.endpoints} endpoints answered JSON; ${r.drift.length} differences from docs/endpoints/shapes.json.`);
  if (r.missing.length) {
    out.push('', `Fields shapes.json has that this run's answers did not carry (${r.missing.length}; one account need not have them all):`, '');
    for (const m of r.missing.slice(0, 40)) out.push('- ' + m);
    if (r.missing.length > 40) out.push(`- … and ${r.missing.length - 40} more`);
  }
  const odd = Object.entries(r.statuses).filter(([, s]) => Object.keys(s).some((k) => k !== '200')).sort();
  if (odd.length) {
    out.push('', 'Answers other than 200, by endpoint:', '');
    for (const [k, s] of odd) out.push(`- ${k}: ${Object.entries(s).map(([st, n]) => `${n}× ${st}`).join(', ')}`);
  }
  out.push('', `Problems: ${r.problems.length}` + (problemLines.length ? ', of these kinds:' : '.'));
  if (problemLines.length) {
    out.push('');
    for (const l of problemLines) out.push('- ' + l + (r.before && freshProblems.includes(l) ? ' (new)' : ''));
  }
  if (r.flags) {
    out.push('', '## The feature flags', '');
    if (flags) {
      const n = Object.keys(flags).length;
      out.push(`${n} flags; ` + (flagsBefore ? `${turned.length} changed since ${r.before?.date}.` : 'kept for the next check to compare with.'));
      out.push('', 'The ones the export\'s downloads depend on: ' + FLAGS_THE_EXPORT_READS.map((f) => `${f} ${flags[f] ?? 'absent'}`).join(', ') + '.');
    } else out.push('Not read.');
  }
  out.push('', '## The endpoint scan', '');
  if (scan) {
    out.push(`Read ${scan.read} script files` + (Object.keys(scan.failed).length ? `; ${Object.entries(scan.failed).map(([w, n]) => `${n} ${w}`).join(', ')} would not load` : '')
      + (scan.capped ? '; stopped at the limit' : '') + '.');
    out.push(`endpoints.json maps ${scan.mapped} requests: ${scan.found} are in the code, ${scan.absent.length} are newly absent, ${scan.method.length} called another way.`);
    if (scan.newCalls.length) {
      out.push('', `Calls in the code the last check did not see (${scan.newCalls.length}; candidates to look at, not differences):`, '');
      for (const c of scan.newCalls.slice(0, 40)) out.push('- ' + c);
    }
  } else out.push(r.scan && 'error' in r.scan ? 'Did not run.' : 'Not run.');
  out.push('', 'Accept a difference by fixing the fake site or the collector, and shapes.json by `npm run live -- --shapes`; the next check compares problems with this one.');
  const failed = !!r.stopped || !!(r.scan && 'error' in r.scan);
  /** @type {DriftState | null} */
  const state = failed ? null : { date: r.date, problems: problemLines, calls: scan ? scan.calls : r.before?.calls ?? null, flags: flags ?? flagsBefore };
  return { text: out.join('\n') + '\n', differs: differences.length > 0, failed, state };
}

/**
 * What may be written: nothing in Hebrew, no long number (an id), so a value that got past the rules above is
 * never kept. The same guard as the live run's for shapes.json.
 * @param {string} text
 */
export function safeToWrite(text) {
  return !/[֐-׿]|\d{6,}/.test(text);
}

// ---- the schedule --------------------------------------------------------------------------------------

export const LABEL = 'com.ronirachmani.hrem.drift';
const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * The launchd agent that runs the check weekly: `script` is drift-check.mjs, or drift-update.mjs for a checkout kept only
 * for the check. launchd runs a job missed while the Mac slept once it wakes.
 * @param {{ node: string; script: string; cwd: string; log: string; day: string; time: string; path: string }} o
 */
export function launchAgent(o) {
  const day = DAYS[/** @type {keyof typeof DAYS} */ (o.day.slice(0, 3).toLowerCase())];
  const [hour, minute] = (o.time.match(/^(\d{1,2}):(\d{2})$/) || []).slice(1).map(Number);
  if (day === undefined || !(hour >= 0 && hour < 24) || !(minute >= 0 && minute < 60)) throw new Error('The schedule takes a day and a time: --day tue --time 03:30');
  const esc = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const str = (/** @type {string} */ s) => `<string>${esc(s)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${str(LABEL)}
  <key>ProgramArguments</key>
  <array>${str(o.node)}${str(o.script)}${str('--notify')}</array>
  <key>WorkingDirectory</key>${str(o.cwd)}
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key>${str(o.path)}</dict>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>${day}</integer><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>StandardOutPath</key>${str(o.log)}
  <key>StandardErrorPath</key>${str(o.log)}
  <key>ProcessType</key>${str('Background')}
</dict>
</plist>
`;
}
