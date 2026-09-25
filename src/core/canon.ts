import type { Json } from './types';

/* Two responses are "the same record" when they match after dropping
   per-session signature fields and ignoring list order. */

// Values that are re-signed or re-stamped on every fetch. Keys, at any depth.
const VOLATILE_KEYS = new Set([
  'fetched_at', 'hash', 'timestamp', 'time_stamp', 't', 'corona_hash', 'corona_t',
  'url', 'searchQueryId', 'token', 'link_pdf', 'file_name_title',
]);

// Every *link field seen so far (link, pdf_link, file_link, ...) is a per-session signed path.
function isVolatile(key: string): boolean {
  return VOLATILE_KEYS.has(key) || key.endsWith('link');
}

function stripVolatile(o: Json): Json {
  if (Array.isArray(o)) return o.map(stripVolatile);
  if (o && typeof o === 'object') {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(o)) if (!isVolatile(k)) out[k] = stripVolatile(o[k]);
    return out;
  }
  return o;
}

/** JSON with sorted keys. */
function stable(o: Json): string {
  if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
  if (o && typeof o === 'object') {
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  }
  return JSON.stringify(o) ?? 'null';
}

// The portal does not return lists in a stable order; order is not content.
function sortedLists(o: Json): Json {
  if (Array.isArray(o)) {
    return o.map(sortedLists).map((v) => [stable(v), v] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map((p) => p[1]);
  }
  if (o && typeof o === 'object') {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(o)) out[k] = sortedLists(o[k]);
    return out;
  }
  return o;
}

export function canon(o: Json): string {
  return stable(sortedLists(stripVolatile(o)));
}
