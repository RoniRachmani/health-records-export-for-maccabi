// What scripts/endpoint-scan.mjs decides, apart from the browser and the rea process: how a script names
// its lazy chunks, what its calls are, what rea's analysis says of it, and which of all that
// docs/endpoints/endpoints.json already maps. Pure, so test/endpointScan.test.ts runs it on made-up scripts.

// ---- paths ---------------------------------------------------------------------------------------

/** A string that names a service call: a REST service, a versioned route, or a legacy handler or page. */
// The /sonline/ app writes its routes from the version on (v1/members/...), apart from the service's base.
const API_MARK = /[A-Za-z]API\/|webapi|(?:^|\/)v\d+\/|(?:^|\/)members\/|\.asmx|\.ashx|\.aspx|\/s?online\//i;
const URLISH = /^[\w\-./{}*:?=&%]+$/;

/** Whether a string in the code reads as an address on the site, with {} for the parts built at run time. */
export function pathLike(s) {
  return API_MARK.test(s) && URLISH.test(s.replace(/\{\}/g, ''));
}

/** One path's comparable shape: its segments, from the service's name on. */
export function shape(path) {
  return segments(path)
    .replace(/^s?online\/(?=\w+api\/)/i, '') // the REST services sit under /sonline/
    .replace(/^(\w+api)\/webapi\/mac(?=\/|$)/i, '$1'); // and under webapi/mac, which endpoints.json leaves out
}

/** A path as it is written, cut into segments: no origin or query, variables as *, lower case. */
function segments(path) {
  return path
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/[?#].*$/, '')
    .split('/')
    .map((s) => (/^(\{[^}]*\}|<[^>]*>|\d+|\*|:\w+)$/.test(s) ? '*' : s.replace(/\{\}/g, '')))
    .join('/')
    .replace(/^[/*]+|[/*]+$/g, '')
    .toLowerCase();
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

/** Every path and service docs/endpoints/endpoints.json names, wherever in it they are written. */
export function knownFrom(endpoints) {
  const paths = new Set();
  const services = new Set();
  const walk = (x) => {
    if (typeof x === 'string') {
      for (const m of x.matchAll(/[\w/{}<>.\-]*(?:[A-Za-z]API\/|webapi|\.asmx|\.ashx|\.aspx|\/online\/)[\w/{}<>.\-]*/g)) paths.add(shape(m[0]));
      for (const m of x.matchAll(/\b([A-Z][A-Za-z]+API)\b/g)) services.add(m[1]);
    } else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(endpoints);
  // Only shapes with a route in them: the bases' templates (<Service>/.../...) and lone names say nothing.
  return { paths: [...paths].filter((p) => p.includes('/') && !p.includes('...')), services };
}

/**
 * A path is known when its shape is whole segments of one endpoints.json maps: code often builds a path in
 * pieces, so a piece of a mapped path is that path.
 */
export function isKnown(path, known) {
  // Legacy services and popups are written from /online/ down (/Ajax/..., /Pages/...); endpoints.json writes them whole.
  const s = shape(/^\/(ajax|handlers|pages|webapi)\//i.test(path) ? '/online' + path : path);
  if (!s || /^(v\d+|members|webapi|online|sonline)$/.test(s)) return true; // a piece too small to say anything
  return known.paths.some((k) => ('/' + k + '/').includes('/' + s + '/'));
}

// ---- reading a script's text ---------------------------------------------------------------------

/** How far one call's arguments are read before it is given up as something else. */
const ARGS_LIMIT = 6000;

/** The index after the string or template that opens at `i`, or -1. */
function skipQuoted(text, i, end) {
  const q = text[i];
  for (let j = i + 1; j < end; j++) {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === q) return j + 1;
    else if (q === '`' && c === '$' && text[j + 1] === '{') {
      j = skipGroup(text, j + 1, end) - 1;
      if (j < 0) return -1;
    } else if (q !== '`' && c === '\n') return -1;
  }
  return -1;
}

/** The index after the bracket group that opens at `i`, or -1. */
function skipGroup(text, i, end) {
  let depth = 0;
  for (let j = i; j < end; j++) {
    const c = text[j];
    if (c === '"' || c === "'" || c === '`') {
      j = skipQuoted(text, j, end) - 1;
      if (j < 0) return -1;
    } else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (--depth === 0) return j + 1;
    }
  }
  return -1;
}

/** `src` cut at each `sep` that is outside every string and bracket, or null if it does not balance. */
function splitTop(src, sep) {
  const out = [];
  let from = 0;
  for (let j = 0; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') j = skipQuoted(src, j, src.length) - 1;
    else if (c === '(' || c === '[' || c === '{') j = skipGroup(src, j, src.length) - 1;
    else if (c === sep) {
      out.push(src.slice(from, j).trim());
      from = j + 1;
    }
    if (j < 0) return null;
  }
  out.push(src.slice(from).trim());
  return out;
}

/** The arguments of the call whose parenthesis opens at `open`, each as its source text. */
function argsAt(text, open) {
  const end = skipGroup(text, open, Math.min(text.length, open + ARGS_LIMIT));
  if (end < 0) return null;
  const inner = text.slice(open + 1, end - 1);
  return inner.trim() ? splitTop(inner, ',') : [];
}

const unescape = (s) => s.replace(/\\u\{?([0-9a-fA-F]{4,6})\}?|\\x([0-9a-fA-F]{2})|\\(.)/g, (m, u, x, c) =>
  (u || x ? String.fromCodePoint(parseInt(u || x, 16)) : c));

/** A template's text, each ${...} as {}. */
function templateText(body) {
  let out = '';
  for (let j = 0; j < body.length; j++) {
    if (body[j] === '\\') out += body[j] + (body[++j] ?? '');
    else if (body[j] === '$' && body[j + 1] === '{') {
      const end = skipGroup(body, j + 1, body.length);
      if (end < 0) return out + '{}';
      out += '{}';
      j = end - 1;
    } else out += body[j];
  }
  return unescape(out);
}

/**
 * The string an expression builds, with {} for each part only known at run time: literals, templates,
 * `+` and `"…".concat(…)` (what a template becomes when it is compiled down). Null when no part of it
 * is written out, which is an address built somewhere else.
 */
export function builtString(src) {
  const parts = splitTop(src, '+');
  if (!parts) return null;
  let literal = false;
  let out = '';
  for (let part of parts) {
    while (/^\([^]*\)$/.test(part) && skipGroup(part, 0, part.length) === part.length) part = part.slice(1, -1).trim();
    const q = part[0];
    const end = q === '"' || q === "'" || q === '`' ? skipQuoted(part, 0, part.length) : -1;
    if (end < 0) {
      out += '{}';
      continue;
    }
    literal = true;
    out += q === '`' ? templateText(part.slice(1, end - 1)) : unescape(part.slice(1, end - 1));
    let rest = part.slice(end);
    if (/^\s*[!=]==?/.test(rest)) return null; // "Case"===r is a test, not an address
    while (rest.startsWith('.concat(')) {
      const close = skipGroup(rest, 7, rest.length);
      const args = close < 0 ? null : splitTop(rest.slice(8, close - 1), ',');
      if (!args) break;
      for (const a of args) out += builtString(a) ?? '{}';
      rest = rest.slice(close);
    }
    if (rest.trim()) out += '{}';
  }
  return literal ? out.replace(/(\{\})+/g, '{}') : null;
}

/** The value source of `key` in an object literal's source, or undefined. */
function field(objectSrc, key) {
  if (!/^\{[^]*\}$/.test(objectSrc)) return undefined;
  for (const entry of splitTop(objectSrc.slice(1, -1), ',') || []) {
    const m = entry.match(/^["']?(\w+)["']?\s*:\s*([^]+)$/);
    if (m && m[1] === key) return m[2];
  }
  return undefined;
}

/** How far back a local variable's value is looked for; a constant of the file is looked for all the way up. */
const LOCAL_REACH = 4000;

/** The first argument of the last call in `src` (`fmt("v1/…/{0}", id)`, `n()("v1/…/{0}", id)`), or undefined. */
function firstArgOfCall(src) {
  if (!src.endsWith(')')) return undefined;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') i = skipQuoted(src, i, src.length) - 1;
    else if (c === '[' || c === '{') i = skipGroup(src, i, src.length) - 1;
    else if (c === '(') {
      const end = skipGroup(src, i, src.length);
      if (end === src.length) return (splitTop(src.slice(i + 1, -1), ',') || [])[0];
      i = end - 1;
    }
    if (i < 0) return undefined;
  }
  return undefined;
}

/** `src` as [test, then, else] when it is a conditional at its top level, or null. */
function splitConditional(src) {
  let mark = -1;
  let nested = 0;
  for (let j = 0; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') j = skipQuoted(src, j, src.length) - 1;
    else if (c === '(' || c === '[' || c === '{') j = skipGroup(src, j, src.length) - 1;
    else if (c === '?' && (src[j + 1] === '?' || (src[j + 1] === '.' && !/\d/.test(src[j + 2] || '')))) j++; // ?? and ?.
    else if (c === '?') {
      if (mark < 0) mark = j;
      else nested++;
    } else if (c === ':' && mark >= 0) {
      if (!nested) return [src.slice(0, mark).trim(), src.slice(mark + 1, j).trim(), src.slice(j + 1).trim()];
      nested--;
    }
    if (j < 0) return null;
  }
  return null;
}

/**
 * The strings an argument can stand for at `offset`: written out, or a name given a string just before (a
 * local `let s=fmt("v1/members/{0}/{1}/visits",…)`, or the file's `ed="/sonline/VisitsAPI/webapi/mac/"`), or a
 * formatting call around one. A conditional gives one for each side: the site picks an address's version that
 * way, fmt(e.isV2?"v2/members/{0}/{1}/drugs":"v1/members/{0}/{1}/drugs",…). Minified code reuses its names,
 * so the nearest value above is the one meant. Empty when nothing of it is written out.
 */
function valuesAt(text, src, offset, depth = 0) {
  while (/^\([^]*\)$/.test(src) && skipGroup(src, 0, src.length) === src.length) src = src.slice(1, -1).trim();
  const sides = splitConditional(src);
  if (sides) return [...new Set([...valuesAt(text, sides[1], offset, depth), ...valuesAt(text, sides[2], offset, depth)])];
  const direct = builtString(src);
  if (direct !== null && direct !== '{}') return [direct];
  if (depth > 2) return [];
  if (/^[\w$]+$/.test(src)) {
    // Minified code writes s=…; the legacy site's own scripts, var url = …
    const name = new RegExp('(?<![\\w$.])' + src.replace(/\$/g, '\\$') + '\\s*=(?!=)\\s*', 'g');
    let at = -1;
    const from = Math.max(0, offset - LOCAL_REACH);
    for (const m of text.slice(from, offset).matchAll(name)) at = from + m.index + m[0].length;
    if (at < 0) {
      const up = text.lastIndexOf(src + '="', offset);
      if (up < 0 || /[\w$.]/.test(text[up - 1] || '')) return [];
      at = up + src.length + 1;
    }
    // The value runs to the first , ; or closing bracket outside its own strings and brackets.
    let end = at;
    while (end < text.length && end < at + ARGS_LIMIT) {
      const c = text[end];
      if (c === '"' || c === "'" || c === '`') end = skipQuoted(text, end, text.length);
      else if (c === '(' || c === '[' || c === '{') end = skipGroup(text, end, text.length);
      else if (c === ',' || c === ';' || c === ')' || c === ']' || c === '}' || c === '\n') break;
      else end++;
      if (end < 0) return [];
    }
    return valuesAt(text, text.slice(at, end).trim(), at, depth + 1);
  }
  const inner = firstArgOfCall(src);
  return inner === undefined ? [] : valuesAt(text, inner, offset, depth + 1);
}

/** A service's base, which the site's client takes before the path: rest.get(base, path, options). */
const BASE = /(?:[A-Za-z]API|webapi)\/(?:[\w/]*\/)?$/i;

const VERB = /^(get|post|put|patch|delete|head)$/i;
const CALL = /(?<![\w$.])(fetch|axios|\$http)\s*\(|\.(get|post|put|patch|delete|head|request|ajax|open)\s*\(/g;

/**
 * The requests a script writes out: fetch, an HTTP client's get/post/put/patch/delete/head/request (axios and
 * the like, and the site's own rest.get(base, path)), jQuery's ajax and XMLHttpRequest's open, each with its
 * method and the address as far as the call and the values just above it spell it. A call whose address
 * cannot be read that way is left out.
 */
export function readCalls(text) {
  const calls = [];
  for (const m of text.matchAll(CALL)) {
    const name = (m[1] || m[2]).toLowerCase();
    const args = argsAt(text, m.index + m[0].length - 1);
    if (!args || !args.length) continue;
    let method;
    let url;
    const config = (src) => {
      url = field(src, 'url');
      const said = builtString(field(src, 'method') ?? field(src, 'type') ?? '');
      method = said && VERB.test(said) ? said : url === undefined ? undefined : 'GET';
    };
    if (name === 'open') {
      method = builtString(args[0]);
      if (!method || !VERB.test(method)) continue; // window.open, a file's open
      url = args[1];
    } else if (args[0].startsWith('{')) {
      config(args[0]);
    } else {
      url = args[0];
      method = VERB.test(name) ? name : 'GET';
      // fetch(url, { method }), $.ajax(url, { type })
      if (!VERB.test(name) && args[1]?.startsWith('{')) {
        const said = builtString(field(args[1], 'method') ?? field(args[1], 'type') ?? '');
        if (said && VERB.test(said)) method = said;
      }
    }
    if (url === undefined || !method) continue;
    for (const path of valuesAt(text, url, m.index)) {
      // The site's client: the service's base first, then the path.
      const rests = VERB.test(name) && args.length > 1 && BASE.test(path) ? valuesAt(text, args[1], m.index) : [''];
      for (const rest of rests) {
        calls.push({ path: path + rest.replace(/^\//, ''), method: method.toUpperCase(), offset: m.index + (m[2] ? 1 : 0), via: name });
      }
    }
  }
  return calls;
}

/** What a / follows when it opens a regular expression and not a division. */
const BEFORE_REGEX = /[(,=:[!&|?{};*%<>~^+-]/;
const WORD_BEFORE_REGEX = /(?<![\w$.])(?:return|typeof|case|in|of|void|delete|throw|new|else|do|instanceof)$/;

/** The index after the regular expression that opens at `i`, or -1 if it does not close on its line. */
function skipRegex(text, i, end) {
  let inClass = false;
  for (let j = i + 1; j < end; j++) {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === '\n') return -1;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return j + 1;
  }
  return -1;
}

/**
 * String literals in a script, each with where it opens; a template literal's ${...} becomes {}, and the
 * strings inside one are given too. Every string is walked to its end whatever its length, and comments and
 * regular expressions are stepped over, so a quote always opens what it opens: a reader that gives up on ""
 * or on a long string takes that string's closing quote for the next one's opening, and from there on
 * reads the code between the strings in place of the strings. Only then are the ones too short or too long
 * to be an address (under 2 characters, over 300, 600 for a template) left out.
 */
export function literals(text) {
  const out = [];
  const read = (from, end) => {
    let prev = '';
    for (let i = from; i < end; i++) {
      const c = text[i];
      if (c === '/' && text[i + 1] === '/') {
        const stop = text.indexOf('\n', i);
        i = stop < 0 || stop > end ? end : stop;
      } else if (c === '/' && text[i + 1] === '*') {
        const stop = text.indexOf('*/', i + 2);
        i = stop < 0 || stop > end ? end : stop + 1;
      } else if (c === '/') {
        const opens = !prev || (BEFORE_REGEX.test(prev) && !/(\+\+|--)\s*$/.test(text.slice(Math.max(from, i - 4), i)))
          || (/[\w$]/.test(prev) && WORD_BEFORE_REGEX.test(text.slice(Math.max(from, i - 16), i).trimEnd()));
        const after = opens ? skipRegex(text, i, end) : -1;
        if (after > 0) i = after - 1;
        prev = after > 0 ? ')' : c;
      } else if (c === '"' || c === "'" || c === '`') {
        const after = skipQuoted(text, i, end);
        prev = c;
        if (after < 0) continue; // a lone quote: an apostrophe in what is not code
        const body = text.slice(i + 1, after - 1);
        if (body.length >= 2 && body.length <= (c === '`' ? 600 : 300)) out.push({ value: c === '`' ? templateText(body) : unescape(body), offset: i });
        if (c === '`') {
          for (let j = i + 1; j < after - 1; j++) {
            if (text[j] === '\\') j++;
            else if (text[j] === '$' && text[j + 1] === '{') {
              const close = skipGroup(text, j + 1, after - 1);
              if (close < 0) break;
              read(j + 2, close - 1);
              j = close - 1;
            }
          }
        }
        i = after - 1;
      } else if (c === '\\') i++; // only a regular expression taken for a division has one: its \/ is no comment
      else if (!/\s/.test(c)) prev = c;
    }
  };
  read(0, text.length);
  return out.sort((a, b) => a.offset - b.offset);
}

/** Turns an offset into `line:column`, both from 1, as an editor counts them. */
export function locator(text) {
  const starts = [0];
  for (const m of text.matchAll(/\r\n|[\n\r\u2028\u2029]/g)) starts.push(m.index + m[0].length);
  return {
    at(offset) {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      return `${lo + 1}:${offset - starts[lo] + 1}`;
    },
  };
}

// ---- the chunks a script names -------------------------------------------------------------------

/**
 * The other script files one script names. webpack's and Rspack's runtimes name lazy chunks from an
 * id-to-hash map, after a folder and, for some, a name in place of the id:
 * "static/js/async/"+(({354:"lib-axios"})[e]||e)+"."+({337:"1343e675"})[e]+".js", or ("354"===e?"lib-axios":e)
 * for the name. They load them from the public path the same script sets (.p="/sonline/medicalFile/"): each
 * section of the app is a build of its own, under its own folder. Without one, a chunk with a folder is
 * written "@public:<folder><file>", for chunkUrl to place.
 */
export function chunkFiles(text) {
  const files = new Set();
  for (const { value: s } of literals(text)) {
    // A script file by name; "./x.js" and node_modules are a bundle's module ids, not files the server has.
    if (/^[\w.\-/]+\.m?js$/.test(s) && !s.includes('//') && !/^\.\/|node_modules\//.test(s)) files.add(s);
  }
  const publicPath = text.match(/\.p\s*=\s*["'](\/[\w./-]*\/)["']/)?.[1];
  for (const m of text.matchAll(/\(?\{((?:\s*["']?\w+["']?\s*:\s*["'][0-9a-f]{6,}["']\s*,?)+)\}\)?\[\w+\]\s*\+\s*["'](\.?[\w.]*js)["']/g)) {
    // The expression the map ends: from the function's arrow or return to the map.
    const before = text.slice(Math.max(0, m.index - 20_000), m.index);
    const expr = before.slice(Math.max(before.lastIndexOf('=>'), before.lastIndexOf('return')));
    const folder = expr.match(/^(?:=>|return)\s*["']([\w./-]*\/)["']\s*\+/)?.[1] || '';
    const names = {};
    for (const n of expr.matchAll(/["']?(\w+)["']?\s*:\s*["']([\w.-]+)["']/g)) names[n[1]] = n[2];
    for (const n of expr.matchAll(/["'](\w+)["']\s*===?\s*\w+\s*\?\s*["']([\w.-]+)["']/g)) names[n[1]] = n[2];
    const suffix = m[2].startsWith('.') ? m[2] : '.' + m[2];
    for (const p of m[1].matchAll(/["']?(\w+)["']?\s*:\s*["']([0-9a-f]+)["']/g)) {
      const file = `${names[p[1]] || p[1]}.${p[2]}${suffix}`;
      files.add(publicPath ? publicPath + folder + file : folder ? '@public:' + folder + file : file);
    }
  }
  return files;
}

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

// ---- rea's analysis ------------------------------------------------------------------------------

/** The part of rea's result this scan reads; the rest (the semantic graph) is megabytes per script. */
export const REA_FILTER = 'normalized_result.graph.nodes';

/**
 * What one `rea analyze-javascript-application --format json` result says of the scripts it was given
 * (paths as rea reports them, relative to the folder analyzed): the requests whose address is a literal,
 * with the call that makes each; the app's page routes; the source maps declared; and how far it parsed each
 * file. (It also reports chunks and what loads them, but drops those for a file of a megabyte or more, which
 * is where this site keeps its code, so nothing here leans on them.)
 */
export function readEvidence(result) {
  const graph = result?.normalized_result?.graph;
  const found = { endpoints: [], routes: new Set(), sourceMaps: [], partial: [], unparsed: [], parsed: 0 };
  if (!graph) return found;
  for (const node of graph.nodes || []) {
    for (const o of node.observations || []) {
      const p = o.properties || {};
      const at = o.evidence?.location?.available ? o.evidence.location.value : null;
      if (node.kind === 'endpoint' && p.endpoint_kind === 'route') found.routes.add(p.value);
      else if (node.kind === 'endpoint' && p.endpoint_kind === 'network' && at) {
        const call = String(p.mechanism || '').replace(/^call:/, '');
        found.endpoints.push({ path: p.value, call, file: at.source, line: at.start.line, column: at.start.column + 1 });
      } else if (node.kind === 'source-map') found.sourceMaps.push({ file: at?.source ?? null, url: p.declared_url });
      else if (node.kind === 'javascript-asset' && p.file_kind === 'javascript') {
        // 'partial' is a parse that recovered from a syntax error: the rest of the file was still read.
        if (p.parse_status === 'complete') found.parsed++;
        else if (p.parse_status === 'partial') found.partial.push(p.path);
        else found.unparsed.push(p.path);
      }
    }
  }
  return found;
}

// ---- putting it together -------------------------------------------------------------------------

/** How sure a candidate is, best first. */
export const PROOF = ['ast', 'call', 'named'];

/**
 * Every address the scripts name, once per shape and method: `files` is path-to-text, `evidence` what rea
 * said of them (readEvidence, merged), `known` from knownFrom. Each has how it was found: 'ast' (rea parsed
 * the call and its address is a literal), 'call' (a call this scan read, its address built from parts or
 * taken from a value just above it) or
 * 'named' (a string that reads as an address, with no call seen: a table of paths, or a call rea and this
 * scan both missed).
 */
export function candidates(files, evidence, known) {
  const byKey = new Map();
  const add = (path, method, proof, where) => {
    if (!pathLike(path)) return;
    const k = kind(path);
    if (k === 'noise') return;
    const key = shape(path) + '\0' + (k === 'api' ? method || '' : '');
    const had = byKey.get(key);
    if (!had) {
      byKey.set(key, { path, method: k === 'api' ? method : null, proof, where, kind: k, known: isKnown(path, known) });
    } else if (PROOF.indexOf(proof) < PROOF.indexOf(had.proof)) Object.assign(had, { path, proof, where });
  };

  const called = new Set();
  const calledAsWritten = new Set();
  for (const e of evidence.endpoints) {
    const verb = e.call.split('.').pop();
    // The method of a fetch or an open is in its arguments, which the call reader below reads; and a service's
    // base alone is the first argument of the site's client, whose path that reader joins to it.
    if (!VERB.test(verb) || BASE.test(e.path)) continue;
    called.add(shape(e.path));
    calledAsWritten.add(segments(e.path));
    add(e.path, verb.toUpperCase(), 'ast', `${e.file}:${e.line}:${e.column}`);
  }
  for (const [file, text] of files) {
    const where = locator(text);
    for (const c of readCalls(text)) {
      called.add(shape(c.path));
      calledAsWritten.add(segments(c.path));
      // A literal address that rea's parse also found at a call is proven by it.
      const parsed = !c.path.includes('{}') && evidence.endpoints.some((e) => e.file === file && e.path === c.path);
      add(c.path, c.method, parsed ? 'ast' : 'call', `${file}:${where.at(c.offset)}`);
    }
  }
  // A string that is whole segments of a call's address is a piece that call was built from: by its shape, or
  // as it is written, for a piece cut where a shape is not ("/sonline/XAPI/webapi/" before "mac/v1/…").
  const within = (set) => {
    const all = [...set].map((c) => '/' + c + '/');
    return (s) => !s || all.some((c) => c.includes('/' + s + '/'));
  };
  const inShape = within(called);
  const asWritten = within(calledAsWritten);
  const partOfCall = (path) => inShape(shape(path)) || asWritten(segments(path));
  for (const [file, text] of files) {
    const where = locator(text);
    for (const s of literals(text)) {
      if (pathLike(s.value) && !partOfCall(s.value)) add(s.value, null, 'named', `${file}:${where.at(s.offset)}`);
    }
  }
  return [...byKey.values()].sort((a, b) => shape(a.path).localeCompare(shape(b.path)) || String(a.method).localeCompare(String(b.method)));
}

/**
 * The requests a map in docs/endpoints/ writes out, once per method and shape: each entry's `method` and `url`
 * (and a second request after "then" in one), each `request` sentence, and what `manual_not_fetched` says.
 * `where` is the part of the map it is in; `elsewhere` marks a request to another site than the portal,
 * whose code this scan does not read.
 */
export function mappedRequests(map) {
  const out = new Map();
  const read = (text, where) => {
    for (const m of text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(https?:\/\/[^\s,]+|\/?[A-Za-z][\w.]*\/[^\s,]*)/g)) {
      const path = m[2].split('?')[0].replace(/[).;:'"]+$/, '');
      if (/\.m?js$/.test(path)) continue; // a script file a note names, not a request
      const key = m[1] + ' ' + mappedShape(path);
      if (!out.has(key)) out.set(key, { method: m[1], path, where, elsewhere: /^https?:\/\/(?!online\.maccabi4u\.co\.il\/)/i.test(path) });
    }
  };
  const walk = (x, where, depth) => {
    if (Array.isArray(x)) x.forEach((v) => walk(v, where, depth));
    else if (x && typeof x === 'object') {
      if (typeof x.method === 'string' && typeof x.url === 'string') read(`${x.method} ${x.url}`, where);
      if (typeof x.request === 'string') read(x.request, where);
      for (const [key, v] of Object.entries(x)) {
        if (typeof v === 'string' && where === 'manual_not_fetched') read(v, where);
        else walk(v, depth < 2 ? (where ? where + '.' : '') + key : where, depth + 1);
      }
    }
  };
  walk(map, '', 0);
  return [...out.values()];
}

/** A shape to compare a mapped request with one read in the code: a legacy path whole, no {0} left inside a segment. */
function mappedShape(path) {
  return shape(/^(\{\}|\{\d+\})?\/(ajax|handlers|pages|webapi)\//i.test(path) ? '/online' + path.replace(/^\{\d*\}/, '') : path).replace(/\{\d*\}/g, '');
}

/**
 * Where each mapped request is in the code (`found` from candidates): 'call' (a call with its method), 'method'
 * (a call, with another method), 'named' (its address, no call seen), 'absent', or 'elsewhere' (another site's).
 * The code writes many paths from the version on, with no service before them, so an address that ends a mapped
 * one is that one, when it says more than a version and "members".
 */
export function coverage(requests, found) {
  const shapes = found.map((c) => ({ c, s: mappedShape(c.path) }));
  const says = (s) => s.split('/').some((seg) => !/^(v\d+|members|\*|s?online|webapi|mac|)$/.test(seg));
  return requests.map((r) => {
    if (r.elsewhere) return { ...r, status: 'elsewhere' };
    const s = mappedShape(r.path);
    const hits = shapes.filter((x) => x.s === s || (says(x.s) && s.endsWith('/' + x.s))).map((x) => x.c);
    const same = hits.find((c) => c.method === r.method);
    const hit = same || hits.find((c) => c.method) || hits[0];
    return { ...r, status: !hit ? 'absent' : same ? 'call' : hit.method ? 'method' : 'named', ...(hit ? { as: hit.path, at: hit.where, calledAs: hit.method } : {}) };
  });
}

/** The app's page routes a script declares: each `path: "…"` of a router's table. */
export function routesIn(text) {
  const routes = new Set();
  for (const m of text.matchAll(/\bpath\s*:\s*["'`]([\w\-/:]*)["'`]/g)) if (m[1]) routes.add(m[1]);
  return routes;
}

/** The service names (…API) the scripts mention. */
export function servicesIn(files, known) {
  const names = new Set();
  for (const text of files.values()) for (const m of text.matchAll(/\b([A-Z][A-Za-z]+API)\b/g)) names.add(m[1]);
  return [...names].sort().map((name) => ({ name, known: known.services.has(name) }));
}

/** Files in groups rea analyzes one at a time: a group's result has to stay within rea's own budget. */
export function batches(sizes, maxBytes = 1_500_000, maxFiles = 30) {
  const out = [];
  let cur = [];
  let bytes = 0;
  for (const [file, size] of [...sizes].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (cur.length && (bytes + size > maxBytes || cur.length >= maxFiles)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(file);
    bytes += size;
  }
  if (cur.length) out.push(cur);
  return out;
}
