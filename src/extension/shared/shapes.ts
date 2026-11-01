/* Development only: the shape of what the site answers, as field names and types, so the fake site in test/ can be
   held to the real one and a live run can say what moved. docs/endpoints/shapes.json is committed, so nothing here
   may let a value through: a string is 'string', a key that is not plainly a field name is <key>, and a path segment
   that is not plainly a word is {id}. */
import { type HttpResponse, type Json, type Transport } from '../../core';

/** A field's path in an answer, such as `$.tests[].doc_id`, and every type seen there, sorted. */
export type Shape = Record<string, string[]>;
/** `METHOD /path`, with the ids taken out, and the shape of its answers. */
export type Shapes = Record<string, Shape>;

const FIELD_NAME = /^[A-Za-z_][A-Za-z_]*\d{0,2}$/;
const PATH_WORD = /^[A-Za-z_-]+(\.(asmx|ashx|aspx))?$/;
const MAX_NAME = 40;

function typeOf(v: Json): string {
  if (v === null) return 'null';
  return Array.isArray(v) ? 'array' : typeof v;
}

function note(shape: Shape, at: string, type: string): void {
  const types = (shape[at] ??= []);
  if (!types.includes(type)) {
    types.push(type);
    types.sort();
  }
}

/** Adds what value shows to shape, under at. */
function walk(shape: Shape, at: string, value: Json): void {
  note(shape, at, typeOf(value));
  if (Array.isArray(value)) value.forEach((x) => walk(shape, at + '[]', x));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(shape, at + '.' + (FIELD_NAME.test(k) && k.length <= MAX_NAME ? k : '<key>'), v);
  }
}

export function shapeOf(value: Json): Shape {
  const shape: Shape = {};
  walk(shape, '$', value);
  return shape;
}

/** A request as a key of Shapes: no host, no query, and no id of any kind. */
export function endpointKey(method: string, url: string, mid: string | null): string {
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0];
  const segments = path.split('/').map((s) => {
    if (!s || s === '0' || /^v\d+$/.test(s)) return s;
    if (mid && s === mid) return '{mid}';
    return PATH_WORD.test(s) && s.length <= MAX_NAME ? s : '{id}';
  });
  return method + ' ' + segments.join('/');
}

export function mergeShapes(into: Shapes, from: Shapes): Shapes {
  for (const [endpoint, shape] of Object.entries(from)) {
    const out = (into[endpoint] ??= {});
    for (const [at, types] of Object.entries(shape)) for (const t of types) note(out, at, t);
  }
  return into;
}

/** The same Shapes with its keys in order, so the committed file only changes where the site did. */
export function sortedShapes(s: Shapes): Shapes {
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return sorted(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, sorted(v)])));
}

/**
 * What `seen` shows that `known` does not, one line each: an endpoint or field it has never had, or a type it has
 * never had there. A null is not a type of its own: any field can be empty.
 */
export function shapeDrift(known: Shapes, seen: Shapes): string[] {
  const out: string[] = [];
  for (const [endpoint, shape] of Object.entries(seen)) {
    const had = known[endpoint];
    if (!had) {
      out.push('new endpoint: ' + endpoint);
      continue;
    }
    for (const [at, types] of Object.entries(shape)) {
      if (!had[at]) out.push(endpoint + ' ' + at + ': new field (' + types.join(', ') + ')');
      else {
        const fresh = types.filter((t) => t !== 'null' && !had[at].includes(t));
        if (fresh.length && had[at].some((t) => t !== 'null')) out.push(endpoint + ' ' + at + ': now ' + fresh.join(', ') + ', was ' + had[at].join(', '));
      }
    }
  }
  return out;
}

function jsonOf(r: HttpResponse): { ok: boolean; value?: Json } {
  if (r.status !== 200 || !/json/i.test(r.contentType)) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(r.bytes)) };
  } catch {
    return { ok: false };
  }
}

/** Passes every request on as it is, and hands record the shape of each JSON answer that came back 200. */
export function shapeTransport(base: Transport, mid: string | null, record: (s: Shapes) => Promise<void> | void): Transport {
  return {
    ...base,
    async fetch(req) {
      const r = await base.fetch(req);
      const json = jsonOf(r);
      if (json.ok) await record({ [endpointKey(req.method, req.url, mid)]: shapeOf(json.value) });
      return r;
    },
  };
}
