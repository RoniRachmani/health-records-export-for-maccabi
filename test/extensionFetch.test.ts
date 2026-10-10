import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { b64bytes } from '../src/core';
import { extensionFetch, fetchInPage, STALL_MS } from '../src/extension/background/tab';

// A stand-in for the browser's fetch: headers after headersAt ms (never when null), then one
// chunk at each of chunksAt, then the end of the body at endAt (never when null). An abort
// fails whatever is still pending with the abort's reason, as the real one does. Each chunk is `chunk`, and the
// response carries `headers` beside its content type.
function stubFetch(headersAt: number | null, chunksAt: number[] = [], endAt: number | null = null, chunk = new Uint8Array([1, 2]), headers: Record<string, string> = {}) {
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    const signal = init.signal as AbortSignal;
    return new Promise<Response>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
      if (headersAt === null) return;
      setTimeout(() => {
        const body = new ReadableStream<Uint8Array>({
          start(ctrl) {
            signal.addEventListener('abort', () => ctrl.error(signal.reason));
            for (const t of chunksAt) setTimeout(() => signal.aborted || ctrl.enqueue(chunk), t - headersAt);
            if (endAt !== null) setTimeout(() => signal.aborted || ctrl.close(), endAt - headersAt);
          },
        });
        resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/pdf', ...headers } }));
      }, headersAt);
    });
  });
}

describe('extensionFetch()', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up on a request that gets no answer', async () => {
    stubFetch(null);
    const res = extensionFetch({ url: '/sonline/x', method: 'GET' });
    const settled = expect(res).rejects.toThrow('sent nothing for 60 s');
    await vi.advanceTimersByTimeAsync(STALL_MS);
    await settled;
  });

  it('gives up on a body that stops arriving', async () => {
    stubFetch(1000, [2000]);
    const res = extensionFetch({ url: '/sonline/x', method: 'GET' });
    const settled = expect(res).rejects.toThrow('sent nothing for 60 s');
    await vi.advanceTimersByTimeAsync(2000 + STALL_MS);
    await settled;
  });

  it('lets a slow download finish while its bytes keep coming', async () => {
    stubFetch(40_000, [80_000, 120_000, 160_000], 170_000);
    const res = extensionFetch({ url: '/sonline/x', method: 'GET' });
    await vi.advanceTimersByTimeAsync(170_000);
    expect(await res).toMatchObject({ status: 200, contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 1, 2, 1, 2]) });
  });
});

// The tab's own requests (uploads, discharge letters): run here as the page would run them.
describe('fetchInPage()', () => {
  const req = { url: '/online/Pages/Popups/PHR/PHRDownloadDocument.aspx?fileid=x', method: 'GET' };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('brings the body back as base64', async () => {
    stubFetch(10, [20, 30], 40);
    const res = fetchInPage(req, STALL_MS, 1000);
    await vi.advanceTimersByTimeAsync(40);
    const r = await res;
    expect(r).toMatchObject({ ok: true, status: 200, contentType: 'application/pdf' });
    expect(b64bytes(r.b64 as string)).toEqual(new Uint8Array([1, 2, 1, 2]));
  });

  it('lets a slow download finish while its bytes keep coming, past the old 60 s limit on the whole request', async () => {
    stubFetch(40_000, [80_000, 120_000, 160_000], 170_000);
    const res = fetchInPage(req, STALL_MS, 1000);
    await vi.advanceTimersByTimeAsync(170_000);
    expect(b64bytes((await res).b64 as string)).toEqual(new Uint8Array([1, 2, 1, 2, 1, 2]));
  });

  it('gives up on a body that stops arriving, as a plain failure the collector retries', async () => {
    stubFetch(1000, [2000]);
    const res = fetchInPage(req, STALL_MS, 1000);
    await vi.advanceTimersByTimeAsync(2000 + STALL_MS);
    expect(await res).toEqual({ ok: false, error: 'Maccabi Healthcare Services sent nothing for 60 s' });
  });

  it('leaves behind a body over the limit, whether its length is declared or not', async () => {
    stubFetch(10, [20], 30, new Uint8Array(4), { 'content-length': '5000' });
    const declared = fetchInPage(req, STALL_MS, 4096);
    await vi.advanceTimersByTimeAsync(30);
    expect(await declared).toMatchObject({ ok: true, status: 200, tooLarge: true });
    expect((await declared).b64).toBeUndefined();

    stubFetch(10, [20, 30, 40], 50, new Uint8Array(2000));
    const streamed = fetchInPage(req, STALL_MS, 4096);
    await vi.advanceTimersByTimeAsync(50);
    expect(await streamed).toMatchObject({ ok: true, tooLarge: true });
    expect((await streamed).b64).toBeUndefined();
  });
});
