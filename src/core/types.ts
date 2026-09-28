/* Seams of the collector. The collection logic in core/ never touches the
   network, disk or DOM directly: it goes through these, so it runs the same in
   the extension and in tests. */

export type SaveResult = 'written' | 'updated' | 'unchanged' | 'kept_existing';

/** API responses are used as the server sends them; their shape is not typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export interface HttpRequest {
  /** Site-relative ("/sonline/...", "/online/...") or absolute. */
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  /** 'manual' reports a redirect as redirected=true instead of following it. */
  redirect?: 'manual' | 'follow';
}

export interface HttpResponse {
  /** 0 for an opaque redirect. */
  status: number;
  /** true when redirect was 'manual' and the server redirected (fetch type 'opaqueredirect'). */
  redirected: boolean;
  contentType: string;
  bytes: Uint8Array;
  /** The Retry-After header, when the server sent one (with 429 or 503). Seconds or an HTTP date. */
  retryAfter?: string;
  /** Where the response came from after followed redirects (fetch's Response.url), when known. */
  url?: string;
}

export interface Transport {
  /** Same-origin request with the session cookies. Rejects on a network error. */
  fetch(req: HttpRequest): Promise<HttpResponse>;
  /** An XMLHttpRequest from the page itself (Radware adds its header only to page XHRs). Never rejects: status 0 on error. */
  xhr(req: HttpRequest): Promise<{ status: number; text: string }>;
  /** location.pathname of the page the requests come from. */
  pagePath(): Promise<string>;
}

export interface SaveReply {
  result?: SaveResult;
  error?: string;
}

export interface Problem {
  where: string;
  what: string;
  at: string;
}

export interface Sink {
  exists(rel: string): Promise<boolean>;
  putJson(rel: string, obj: Json): Promise<SaveReply>;
  /** replace=false keeps an existing file (kept_existing); replace=true rewrites it unless identical. */
  putBin(rel: string, bytes: Uint8Array, replace: boolean): Promise<SaveReply>;
  problem(p: Problem): Promise<void>;
  /** The path putBin saved these bytes under (their SHA-256, hex), or null. JSON is not indexed. */
  findBySha256(sha: string): Promise<string | null>;
  /** Records that rel was not written because existing already holds its bytes. */
  putAlias(rel: string, existing: string): Promise<void>;
  /** The file rel was recorded as a copy of, or null. */
  aliasOf(rel: string): Promise<string | null>;
}

/** Where a document went: its own file, or the file already in the export with the same bytes. */
export type DocRef = { file: string } | { same_as: string };

/** The two legacy responses that are HTML; parsed with DOMParser wherever one exists. */
export interface HtmlParser {
  /** Header cell count. */
  purchaseTable(html: string): Promise<{ cols: number }>;
  /** Unique [fileid] attributes and the names passed to PHR.OpenFile('...'). */
  phrGrid(html: string): Promise<{ ids: string[]; openArgs: string[] }>;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface Session {
  mid: string | null;
  jwt: string | null;
  gender: Json;
}

export interface ProgressEvent {
  done: number;
  total: number;
  detail?: string;
}

export interface Deps {
  transport: Transport;
  sink: Sink;
  html: HtmlParser;
  clock: Clock;
  progress?: (ev: ProgressEvent) => void;
  /** Checked before every request; true stops the run with CancelledError. */
  shouldStop?: () => boolean;
}

/** Carried between steps (and, in the extension, across a paused run). JSON-serializable. */
export interface Ctx {
  birthDate?: string | null;
  /** The letters step leaves the existing medical file alone because a new one is ordered after it. */
  skipExistingMedicalFile?: boolean;
}

export function newCtx(): Ctx {
  return {};
}
