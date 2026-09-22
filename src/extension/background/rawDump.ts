/* Development build only, and off unless dev:rawDump turns it on: a Transport
   wrapper that stages every response the run receives, byte for byte, under
   _raw/ in the export ZIP. Nothing is parsed, decoded, trimmed, merged or split
   -- the point is to read exactly what the site sent, beside what the export
   makes of it. Compiled out of the store build. */
import { errMessage, isPdf, mimeType, type HttpResponse, type Json, type Transport } from '../../core';
import { getFile, putBinDirect, putTextDirect } from '../shared/staging';

/** Where the captures go inside the export. Not one of the export's own folders, so README.md ignores it. */
export const RAW_DIR = '_raw';
const INDEX = RAW_DIR + '/index.jsonl';
const FLAG_KEY = 'devRawDump';
const SEQ_KEY = 'devRawSeq';

export async function rawDumpOn(): Promise<boolean> {
  return (await chrome.storage.local.get(FLAG_KEY))[FLAG_KEY] === true;
}

/** On also starts the numbering again; off leaves whatever is already staged alone. */
export async function setRawDump(on: boolean): Promise<void> {
  if (on) await chrome.storage.local.set({ [FLAG_KEY]: true, [SEQ_KEY]: 0 });
  else await chrome.storage.local.remove([FLAG_KEY, SEQ_KEY]);
}

/** Kept in storage, not in a module variable: a restarted service worker must keep counting up rather than overwrite. */
async function nextSeq(): Promise<string> {
  const n = (((await chrome.storage.local.get(SEQ_KEY))[SEQ_KEY] as number | undefined) ?? 0) + 1;
  await chrome.storage.local.set({ [SEQ_KEY]: n });
  return String(n).padStart(4, '0');
}

/** Only so the file opens in the right viewer; the bytes are written as they arrived either way. */
function ext(contentType: string, bytes: Uint8Array): string {
  const t = mimeType(contentType);
  if (isPdf(bytes)) return '.pdf';
  if (/json/.test(t)) return '.json';
  if (/html/.test(t)) return '.html';
  if (/xml/.test(t)) return '.xml';
  // The uploads step brings back photographed documents, not only PDFs.
  if (/^image\//.test(t)) return '.' + (t === 'image/jpeg' ? 'jpg' : t.slice(6).replace(/[^a-z0-9]/g, ''));
  if (/^text\//.test(t)) return '.txt';
  if (t) return '.bin';
  const head = new TextDecoder().decode(bytes.subarray(0, 1)).trim();
  return head === '{' || head === '[' ? '.json' : '.bin';
}

/**
 * The request path, as a file name. The member id is replaced by {mid} -- it never goes into a
 * path (CLAUDE.md); index.jsonl carries the URL as sent, which is not a path.
 */
function nameFor(seq: string, url: string, mid: string | null, e: string): string {
  let p = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0];
  if (mid) p = p.split('/' + mid).join('/{mid}');
  const slug = p.replace(/[^A-Za-z0-9{}._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-90) || 'request';
  return RAW_DIR + '/' + seq + '_' + slug + e;
}

/** The Bearer token is the live session; it is the one thing not written down. */
function headersFor(h: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!h) return undefined;
  const out: Record<string, string> = {};
  for (const k in h) out[k] = /^authorization$/i.test(k) ? 'Bearer <omitted>' : h[k];
  return out;
}

/** One line per request, in the order they were sent. Read-modify-write: the run sends one at a time. */
async function append(entry: Json): Promise<void> {
  const prev = await getFile(INDEX);
  await putTextDirect(INDEX, (prev ? new TextDecoder().decode(prev) : '') + JSON.stringify(entry) + '\n');
}

export function capturingTransport(base: Transport, mid: string | null): Transport {
  return {
    async fetch(req): Promise<HttpResponse> {
      const seq = await nextSeq();
      const head = { seq, at: new Date().toISOString(), via: 'fetch', method: req.method, url: req.url, request_headers: headersFor(req.headers), request_body: req.body };
      let r: HttpResponse;
      try {
        r = await base.fetch(req);
      } catch (e) {
        await append({ ...head, error: errMessage(e) });
        throw e;
      }
      const file = nameFor(seq, req.url, mid, ext(r.contentType, r.bytes));
      await putBinDirect(file, r.bytes);
      await append({ ...head, status: r.status, redirected: r.redirected, content_type: r.contentType, retry_after: r.retryAfter, bytes: r.bytes.length, file: file.slice(RAW_DIR.length + 1) });
      return r;
    },
    async xhr(req) {
      const seq = await nextSeq();
      const head = { seq, at: new Date().toISOString(), via: 'xhr', method: req.method, url: req.url, request_headers: headersFor(req.headers), request_body: req.body };
      const res = await base.xhr(req);
      // responseText, so this is the one capture that went through the page's own decoding.
      const bytes = new TextEncoder().encode(res.text);
      const file = nameFor(seq, req.url, mid, ext('', bytes));
      await putBinDirect(file, bytes);
      await append({ ...head, status: res.status, bytes: bytes.length, file: file.slice(RAW_DIR.length + 1) });
      return res;
    },
    pagePath: base.pagePath,
  };
}
