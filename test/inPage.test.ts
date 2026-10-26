// The functions tab.ts runs inside the Maccabi Online tab (chrome.scripting.executeScript) must be
// self-contained: Chrome sends the page the function's source and nothing else, so a constant or helper it
// reaches from tab.ts works under Vitest, where the module is loaded, and fails only in the member's tab. (The
// terminal export sends the same source with scripts/in-page.mjs's call(), so it would fail there too.)
//
// So each one is rebuilt here from its own source text, as the page gets it, in a fresh context that holds the
// page's globals and nothing of tab.ts, and run: any name it takes from the module throws a ReferenceError.
import { readFileSync } from 'node:fs';
import { createContext, runInContext, type Context } from 'node:vm';
import { Window } from 'happy-dom';
import { transformWithOxc } from 'vite';
import { describe, expect, it } from 'vitest';

const TAB = readFileSync('src/extension/background/tab.ts', 'utf8');

/** Every function tab.ts hands to inTab, the one way into the page. */
const IN_PAGE = [...new Set([...TAB.matchAll(/inTab\(\s*\w+,\s*(\w+)/g)].map((m) => m[1]))];

/** A top-level function's source, from its declaration to the closing brace at the start of a line, as JavaScript. */
async function source(name: string, from = TAB): Promise<string> {
  const start = from.search(new RegExp(`^(export )?(async )?function ${name}\\(`, 'm'));
  if (start < 0) throw new Error(name + ' is not a top-level function');
  const end = from.indexOf('\n}', start) + 2;
  const ts = from.slice(start, end).replace(/^export /, '');
  return (await transformWithOxc(ts, name + '.ts', { lang: 'ts' })).code;
}

/** A page at /sonline/ with only what a page has: no tab.ts, no core. */
function page(): Context & { calls: string[] } {
  const win = new Window({ url: 'https://online.maccabi4u.co.il/sonline/dashboard' });
  win.document.cookie = 'cookie_sessionId_0_123456789=x';
  win.sessionStorage.setItem('token', 'jwt');
  const calls: string[] = [];
  // The legacy page's own idle timer, which activityInPage resets.
  const pageWindow = {
    countDownStarted: true,
    resetActive: () => calls.push('resetActive'),
    closedialog: () => calls.push('closedialog'),
  };
  class FakeXhr {
    status = 0;
    responseText = '';
    onload = () => {};
    onerror = () => {};
    open() {}
    setRequestHeader() {}
    send() {
      this.status = 200;
      this.responseText = 'xhr body';
      setTimeout(() => this.onload());
    }
  }
  return createContext({
    calls,
    window: pageWindow,
    location: win.location,
    document: win.document,
    sessionStorage: win.sessionStorage,
    MouseEvent: win.MouseEvent,
    XMLHttpRequest: FakeXhr,
    fetch: async () => new Response('hello', { headers: { 'content-type': 'text/plain' } }),
    AbortController,
    setTimeout,
    clearTimeout,
    btoa,
  }) as Context & { calls: string[] };
}

/** What each one is called with, and what it gives back, in the page above. */
const RUNS: Record<string, { args: unknown[]; expect: (result: unknown, ctx: Context & { calls: string[] }) => void }> = {
  snapshotInPage: {
    args: [],
    expect: (r) => expect(r).toEqual({ host: 'online.maccabi4u.co.il', path: '/sonline/dashboard', cookieMid: '123456789', jwt: 'jwt' }),
  },
  clearTokenInPage: { args: [], expect: (_, ctx) => expect(ctx.sessionStorage.getItem('token')).toBeNull() },
  activityInPage: { args: [], expect: (_, ctx) => expect(ctx.calls).toEqual(['resetActive', 'closedialog']) },
  pathInPage: { args: [], expect: (r) => expect(r).toBe('/sonline/dashboard') },
  xhrInPage: { args: [{ method: 'GET', url: '/online/x', headers: { a: 'b' } }], expect: (r) => expect(r).toEqual({ status: 200, text: 'xhr body' }) },
  fetchInPage: {
    args: [{ method: 'GET', url: 'https://online.maccabi4u.co.il/x' }, 60_000, 1000],
    expect: (r) => expect(r).toMatchObject({ ok: true, status: 200, contentType: 'text/plain', b64: btoa('hello') }),
  },
};

async function runInPage(code: string, args: unknown[]) {
  const ctx = page();
  const fn = runInContext('(' + code + ')', ctx) as (...a: unknown[]) => unknown;
  return { ctx, result: await fn(...args) };
}

describe('the functions run in the tab', () => {
  it('are all checked here', () => {
    expect(IN_PAGE.length).toBeGreaterThan(0);
    expect(IN_PAGE.filter((name) => !RUNS[name])).toEqual([]);
  });

  for (const name of IN_PAGE) {
    it(`${name} runs from its own source alone`, async () => {
      const { ctx, result } = await runInPage(await source(name), RUNS[name].args);
      RUNS[name].expect(result, ctx);
    });
  }

  it('would catch one that reaches into the module', async () => {
    const leaky = await source('leaky', 'const LIMIT = 1;\nfunction leaky(): number {\n  return LIMIT;\n}\n');
    await expect(runInPage(leaky, [])).rejects.toThrow(/LIMIT is not defined/);
  });
});
