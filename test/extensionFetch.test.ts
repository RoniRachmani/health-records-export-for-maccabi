import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extensionFetch, STALL_MS } from '../src/extension/background/tab';

// A stand-in for the browser's fetch: headers after headersAt ms (never when null), then one
// chunk at each of chunksAt, then the end of the body at endAt (never when null). An abort
// fails whatever is still pending with the abort's reason, as the real one does.
function stubFetch(headersAt: number | null, chunksAt: number[] = [], endAt: number | null = null) {
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    const signal = init.signal as AbortSignal;
    return new Promise<Response>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
      if (headersAt === null) return;
      setTimeout(() => {
        const body = new ReadableStream<Uint8Array>({
          start(ctrl) {
            signal.addEventListener('abort', () => ctrl.error(signal.reason));
            for (const t of chunksAt) setTimeout(() => ctrl.enqueue(new Uint8Array([1, 2])), t - headersAt);
            if (endAt !== null) setTimeout(() => ctrl.close(), endAt - headersAt);
          },
        });
        resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/pdf' } }));
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
