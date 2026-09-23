import type { Deps, HttpResponse, Json, SaveResult, Session } from './types';
import { charset, isPdf, mimeType, retryAfterMs } from './util';

export const PACE_MS = 300;

/** How long to wait on a 429 that carries no Retry-After, and the longest wait the run sits through. */
export const RATE_LIMIT_WAIT_MS = 30_000;
export const RATE_LIMIT_MAX_MS = 120_000;

export class SessionEndedError extends Error {
  readonly sessionEnded = true;
  constructor(msg: string) {
    super('SESSION ENDED: ' + msg + ' -- log in again and rerun; finished files are kept');
  }
}

export class CancelledError extends Error {
  readonly cancelled = true;
  constructor() {
    super('cancelled');
  }
}

/** Maccabi answered 429: it is asking for a pause longer than the run is willing to wait out. */
export class RateLimitedError extends Error {
  readonly rateLimited = true;
  constructor(waitS: number) {
    super('RATE LIMITED: Maccabi Healthcare Services asked for a pause of ' + waitS + ' s -- the export stops here; finished files are kept');
  }
}

/** Errors that end a step instead of being recorded as a problem inside it. */
export function isControl(e: unknown): boolean {
  return !!e && typeof e === 'object' && ('sessionEnded' in e || 'cancelled' in e || 'rateLimited' in e);
}

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface ApiResult {
  status: number;
  /** undefined when the body was not JSON; null when empty. */
  data: Json;
}

export interface BinResult {
  status: number;
  type: string;
  bytes: Uint8Array;
}

/** One export session: the seams, the member's session and the per-phase log. */
export class Collector {
  log: [string, string][] = [];

  constructor(readonly deps: Deps, public session: Session) {}

  now(): number {
    return this.deps.clock.now();
  }

  sleep(ms: number): Promise<void> {
    return this.deps.clock.sleep(ms);
  }

  progress(done: number, total: number, detail?: string): void {
    this.deps.progress?.({ done, total, detail });
  }

  private checkStop(): void {
    if (this.deps.shouldStop?.()) throw new CancelledError();
  }

  // ---- sink -----------------------------------------------------------
  exists(rel: string): Promise<boolean> {
    return this.deps.sink.exists(rel);
  }

  async save(rel: string, obj: Json): Promise<SaveResult | undefined> {
    const res = await this.deps.sink.putJson(rel, obj);
    this.log.push([rel, (res.result || res.error) as string]);
    return res.result;
  }

  async saveBin(rel: string, bytes: Uint8Array, replace = false): Promise<SaveResult | undefined> {
    const res = await this.deps.sink.putBin(rel, bytes, replace);
    this.log.push([rel, (res.result || res.error) as string]);
    return res.result;
  }

  async problem(where: string, what: unknown): Promise<void> {
    this.log.push([where, 'PROBLEM: ' + what]);
    await this.deps.sink.problem({ where, what: String(what).slice(0, 300), at: new Date(this.now()).toISOString() });
  }

  // ---- Maccabi --------------------------------------------------------
  // "MedicalFileAPI/v1/members/0/{mid}/x" -> "/sonline/MedicalFileAPI/webapi/mac/v1/members/0/<mid>/x"
  apiUrl(path: string): string {
    const svc = path.split('/')[0];
    return '/sonline/' + svc + '/webapi/mac/' + path.slice(svc.length + 1).split('{mid}').join(this.session.mid ?? '');
  }

  async api(method: string, path: string, body?: Json, tries = 4): Promise<ApiResult> {
    if (!this.session.jwt || !this.session.mid) {
      throw new SessionEndedError('no session token on this page -- run API steps from a /sonline/ page');
    }
    this.checkStop();
    let r: HttpResponse;
    try {
      r = await this.deps.transport.fetch({
        url: this.apiUrl(path),
        method,
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.session.jwt },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (isControl(e)) throw e;
      // No response at all is usually momentary: retry like a 503 before calling the session ended.
      if (tries > 1) {
        await this.sleep(2500);
        return this.api(method, path, body, tries - 1);
      }
      throw new SessionEndedError('request failed (' + errMessage(e) + ')');
    }
    if (r.redirected || r.status === 401) throw new SessionEndedError('HTTP ' + (r.status || 'redirect to login'));
    if (r.status === 429) {
      await this.rateLimitPause(r, tries);
      return this.api(method, path, body, tries - 1);
    }
    if ((r.status === 500 || r.status === 503) && tries > 1) {
      await this.sleep(2500);
      return this.api(method, path, body, tries - 1);
    }
    const text = new TextDecoder().decode(r.bytes);
    let data: Json = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = undefined;
    }
    await this.sleep(PACE_MS);
    return { status: r.status, data };
  }

  // Wrapped record as stored on disk. The endpoint keeps {mid} as a placeholder.
  rec(method: string, path: string, r: ApiResult, extra?: Record<string, Json>): Json {
    return Object.assign({ endpoint: method + ' ' + path.split('?')[0] }, extra || {}, {
      fetched_at: new Date(this.now()).toISOString(),
      status: r.status,
      data: r.data === undefined ? null : r.data,
    });
  }

  async getSave(
    rel: string,
    method: string,
    path: string,
    body?: Json,
    extra?: Record<string, Json>,
  ): Promise<{ r: ApiResult; result: SaveResult | undefined | null }> {
    const r = await this.api(method, path, body);
    if (r.status !== 200 && r.status !== 204) {
      await this.problem(rel, 'HTTP ' + r.status);
      return { r, result: null };
    }
    if (r.data === undefined) {
      await this.problem(rel, 'response was not JSON');
      return { r, result: null };
    }
    const e = Object.assign({}, extra || {});
    if (body !== undefined && !e.request_body) e.request_body = body;
    const result = await this.save(rel, this.rec(method, path, r, e));
    return { r, result };
  }

  /**
   * A 429 is Maccabi asking the extension to slow down: wait exactly as long as it says and try once
   * more, and stop the whole run rather than keep knocking if it asks again or asks for a long wait.
   */
  private async rateLimitPause(r: HttpResponse, tries: number): Promise<void> {
    const waitMs = retryAfterMs(r.retryAfter, this.now(), RATE_LIMIT_WAIT_MS);
    if (tries <= 1 || waitMs > RATE_LIMIT_MAX_MS) throw new RateLimitedError(Math.round(waitMs / 1000));
    await this.sleep(waitMs);
  }

  async fetchBin(url: string, headers?: Record<string, string>, tries = 2): Promise<BinResult> {
    this.checkStop();
    const r = await this.deps.transport.fetch({
      url,
      method: 'GET',
      headers: headers || { Authorization: 'Bearer ' + this.session.jwt },
    });
    if (r.status === 429) {
      await this.rateLimitPause(r, tries);
      return this.fetchBin(url, headers, tries - 1);
    }
    await this.sleep(PACE_MS);
    return { status: r.status, type: mimeType(r.contentType), bytes: r.bytes };
  }

  async pdfIfMissing(rel: string, url: string, headers?: Record<string, string>): Promise<SaveResult | null | undefined> {
    if (await this.exists(rel)) return 'kept_existing';
    const b = await this.fetchBin(url, headers);
    if (b.status !== 200 || !isPdf(b.bytes)) {
      await this.problem(rel, 'PDF download: HTTP ' + b.status + ' ' + b.type);
      return null;
    }
    return this.saveBin(rel, b.bytes);
  }

  /** A legacy /online/ request: session cookies only, no Bearer, redirects followed. */
  async legacy(url: string, method: string, headers: Record<string, string>, body?: string): Promise<HttpResponse> {
    this.checkStop();
    return this.deps.transport.fetch({ url, method, headers, body });
  }

  legacyText(r: HttpResponse, fallback = 'utf-8'): string {
    return new TextDecoder(charset(r.contentType, fallback)).decode(r.bytes);
  }
}

export function changed(result: SaveResult | null | undefined): boolean {
  return result === 'written' || result === 'updated';
}
