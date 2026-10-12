// scripts/headless-export.mjs puts two seams of its own under the collector: the Maccabi Online page as
// a Transport (requests evaluated inside the page) and a folder as a Sink. Here the "page" evaluates the
// in-page sources for real, with fetch answered by the fake Maccabi, and the folder is a temp dir; the
// collector's own test-results step runs over them and writes what the extension would write.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Collector, newCtx, runStep, type HttpRequest, type HttpResponse } from '../src/core';
// What the script bundles into dist-cli/, from the sources.
import * as core from '../src/cli/index';
import { EXPORT_ERRORS, INSTRUCTION_POINTERS } from '../src/extension/shared/readme';
import { FILE_LAYOUT } from '../src/extension/shared/state';
import { TAB_FETCH_TIMEOUT_MS } from '../src/extension/background/tab';
import { folderSink, keepAlive, pageTransport, sessionOf, SINK_STATE } from '../scripts/headless-lib.mjs';
import { fakeMaccabi, htmlParser, MID } from './fakes';

/** A page whose evaluate runs the expression as the browser would, with fetch and XMLHttpRequest answered by routes. */
function fakePage(routes: ReturnType<typeof fakeMaccabi>['routes'], snapshot: Record<string, unknown>) {
  const answer = (req: HttpRequest): HttpResponse => {
    const url = new URL(req.url);
    for (const r of routes) {
      const res = r({ ...req, url: url.pathname + url.search }, url);
      if (res) return res;
    }
    return { status: 404, redirected: false, contentType: 'text/html', bytes: new TextEncoder().encode('not found') };
  };
  const fetch = async (url: string, init: RequestInit) => {
    const r = answer({ url, method: init.method as string, headers: init.headers as Record<string, string>, body: init.body as string });
    return new Response(r.bytes as BodyInit, { status: r.status, headers: { 'content-type': r.contentType } });
  };
  class XMLHttpRequest {
    status = 0;
    responseText = '';
    onload: (() => void) | null = null;
    private req: HttpRequest = { url: '', method: 'GET', headers: {} };
    open(method: string, url: string) { this.req = { ...this.req, method, url }; }
    setRequestHeader(k: string, v: string) { this.req.headers![k] = v; }
    send(body?: string) {
      const r = answer({ ...this.req, body });
      this.status = r.status;
      this.responseText = new TextDecoder().decode(r.bytes);
      this.onload?.();
    }
  }
  const events: string[] = [];
  const timeouts: (number | undefined)[] = [];
  const scope = { fetch, XMLHttpRequest, location: { hostname: snapshot.host, pathname: snapshot.path },
    document: { cookie: snapshot.cookie, dispatchEvent: (e: { type: string }) => events.push(e.type) },
    sessionStorage: { getItem: () => snapshot.jwt }, window: {}, MouseEvent: class { constructor(readonly type: string) {} },
    AbortController, setTimeout, clearTimeout, btoa, String, Number, Array, Uint8Array, Promise, URL };
  const evaluate = (expression: string, timeoutMs?: number) => {
    timeouts.push(timeoutMs);
    return new Function(...Object.keys(scope), 'return (' + expression + ')')(...Object.values(scope));
  };
  return { evaluate, events, timeouts, probe: async (e: string, fallback: unknown) => { try { return await evaluate(e); } catch { return fallback; } } };
}

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('headless export', () => {
  it('runs the test-results step through the page transport and the folder sink, and writes the root files', async () => {
    const { routes } = fakeMaccabi();
    const jwt = 'h.' + btoa(JSON.stringify({ mem_id: MID, gender: 'F' })).replace(/=+$/, '') + '.s';
    const page = fakePage(routes, { host: 'online.maccabi4u.co.il', path: '/sonline/', cookie: '', jwt });
    const session = await sessionOf(page, core);
    expect(session).toEqual({ mid: MID, jwt, gender: 'F' });

    const dir = mkdtempSync(join(tmpdir(), 'hrem-headless-'));
    dirs.push(dir);
    const sink = folderSink(core, dir, '0.0.0');
    const c = new Collector({ transport: pageTransport(page, core), sink, html: htmlParser(), clock: { now: () => Date.now(), sleep: async () => {} } }, session!);
    await runStep(c, newCtx(), 'testResults');

    const files = readdirSync(join(dir, 'test-results'));
    expect(files.sort()).toEqual(['details', 'files', 'followed-counter.json', 'history', 'latest-lab-results.json', 'list.json']);
    const list = JSON.parse(readFileSync(join(dir, 'test-results/list.json'), 'utf8'));
    expect(list.endpoint).toBe('POST TestResultsAPI/v1/members/0/{mid}/tests');
    expect(list.data.tests).toHaveLength(4);
    expect(readdirSync(join(dir, 'test-results/details'))).toHaveLength(4);
    expect(readdirSync(join(dir, 'test-results/history'))).toEqual(['HGB_המוגלובין.json']);
    // A PDF came back through the page as base64 and landed byte for byte.
    const pdfs = readdirSync(join(dir, 'test-results/files'));
    expect(pdfs.length).toBeGreaterThan(0);
    expect(readFileSync(join(dir, 'test-results/files', pdfs[0])).subarray(0, 5).toString()).toBe('%PDF-');
    expect(sink.problems).toEqual([]);

    const { files: counts, errors } = sink.writeRootFiles(new Date().toISOString(), ['testResults']);
    expect(errors).toEqual([]);
    const onDisk = (d: string): number => readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? onDisk(join(d, f)) : 1), 0);
    expect(counts).toEqual({ 'test-results': onDisk(join(dir, 'test-results')) });
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('version 0.0.0 (headless-export), file layout ' + FILE_LAYOUT);
    expect(readme).toContain('`test-results/`');
    // Only this step ran: the README says the other sections were left out, never that the site had nothing there.
    expect(readme).toMatch(/This export has no `profile\/`, .*`visit-summaries\/`.* they were not collected in this run/);
    expect(readme).not.toContain('nothing on record for');
    expect(readme).toContain('This run did not order one, and took none from the\nsite.');
    expect(readme).not.toContain('Ordering or downloading it failed');
    expect(JSON.parse(readFileSync(join(dir, EXPORT_ERRORS), 'utf8'))).toEqual([]);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe(INSTRUCTION_POINTERS['CLAUDE.md']);

    // A second run into the same folder changes nothing and asks for no document again.
    const c2 = new Collector({ transport: pageTransport(page, core), sink: folderSink(core, dir, '0.0.0'), html: htmlParser(), clock: { now: () => Date.now(), sleep: async () => {} } }, session!);
    await runStep(c2, newCtx(), 'testResults');
    // Documents already there are not asked for (pdfIfMissing returns before the sink), so the log is JSON only, all unchanged.
    expect(new Set(c2.log.map(([, r]) => r))).toEqual(new Set(['unchanged']));
  });

  it('brings a redirect, a failure and an XHR back the way the extension does', async () => {
    const page = fakePage([
      (req) => (req.url.startsWith('/x/redirect') ? { status: 302, redirected: true, contentType: '', bytes: new Uint8Array() } : undefined),
      (req) => (req.url.startsWith('/x/json') ? { status: 200, redirected: false, contentType: 'application/json', bytes: new TextEncoder().encode('{"a":1}') } : undefined),
    ], { host: 'online.maccabi4u.co.il', path: '/sonline/', cookie: '', jwt: null });
    const t = pageTransport(page, core);
    expect(await t.pagePath()).toBe('/sonline/');
    const ok = await t.fetch({ url: '/x/json', method: 'GET' });
    expect(ok.status).toBe(200);
    expect(new TextDecoder().decode(ok.bytes)).toBe('{"a":1}');
    expect(await t.xhr({ url: '/x/json', method: 'GET' })).toEqual({ status: 200, text: '{"a":1}' });
    expect(await sessionOf(page, core, 1)).toBeNull(); // no token on the page
    // A request gets the time the extension gives the tab, not the protocol's default; the rest take the default.
    expect(page.timeouts.filter((ms) => ms !== undefined)).toEqual([TAB_FETCH_TIMEOUT_MS]);
    await keepAlive(page, core);
    expect(page.events).toEqual(['mousedown']);
  });

  it('files a problem under the step it was told, so a step that failed whole is put against its folders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hrem-headless-'));
    dirs.push(dir);
    const sink = folderSink(core, dir, '0.0.0');
    await sink.putJson('test-results/list.json', { x: 1 });
    sink.setStep('visits');
    await sink.problem({ where: 'visits', what: 'SESSION ENDED: HTTP 401', at: '2026-09-18T07:00:00.000Z' });
    const { errors } = sink.writeRootFiles('2026-09-18T06:00:00.000Z', ['testResults', 'visits']);
    expect(errors).toEqual([{ folders: ['visit-summaries'], step: 'visits', where: 'visits', what: 'SESSION ENDED: HTTP 401', at: '2026-09-18T07:00:00.000Z' }]);
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    expect(readme).toMatch(/This export has no `visit-summaries\/` because collecting it failed/);
    expect(readme).toMatch(/This export has no `profile\/`.* they were not collected in this run/);
    expect(readme).not.toContain('nothing on record for');
  });

  it('remembers across runs which documents were copies, and never keeps a file cut off mid-write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hrem-headless-'));
    dirs.push(dir);
    const sink = folderSink(core, dir, '0.0.0');
    const pdf = new TextEncoder().encode('%PDF-1.4 x');
    await sink.putBin('a/f.pdf', pdf, false);
    await sink.putBin('a/h.pdf', new TextEncoder().encode('%PDF-1.4 h'), false);
    await sink.putAlias('b/g.pdf', 'a/f.pdf');
    await sink.putAlias('b/i.pdf', 'a/h.pdf');
    expect(readdirSync(join(dir, 'a')).sort()).toEqual(['f.pdf', 'h.pdf']); // nothing left under a part's name
    // What a run killed inside a write leaves behind: the part, and no file under the document's name.
    writeFileSync(join(dir, 'a/cut.pdf.part'), '%PDF-1.4 half');
    rmSync(join(dir, 'a/h.pdf'));

    const again = folderSink(core, dir, '0.0.0');
    expect(await again.aliasOf('b/g.pdf')).toBe('a/f.pdf');
    expect(await again.aliasOf('b/i.pdf')).toBeNull(); // its file has gone: asked for again
    expect(await again.exists('a/cut.pdf')).toBe(false);
    expect(existsSync(join(dir, 'a/cut.pdf.part'))).toBe(false);
    // The sink's own state is not a file of the export: not counted, and not indexed as a document.
    expect(again.writeRootFiles('2026-09-18T06:00:00.000Z', []).files).toEqual({ a: 1 });
    expect(existsSync(join(dir, SINK_STATE))).toBe(true);
  });

  it('refuses a bad path and keeps a document it already holds', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hrem-headless-'));
    dirs.push(dir);
    const sink = folderSink(core, dir, '0.0.0');
    expect(await sink.putJson('../x.json', {})).toEqual({ error: 'bad path: "../x.json"' });
    expect(await sink.putJson('a/b.json', { x: 1 })).toEqual({ result: 'written' });
    expect(await sink.putJson('a/b.json', { x: 1 })).toEqual({ result: 'unchanged' });
    expect(await sink.putJson('a/b.json', { x: 2 })).toEqual({ result: 'updated' });
    const pdf = new TextEncoder().encode('%PDF-1.4 x');
    expect(await sink.putBin('a/f.pdf', pdf, false)).toEqual({ result: 'written' });
    expect(await sink.putBin('a/f.pdf', new TextEncoder().encode('%PDF-1.4 y'), false)).toEqual({ result: 'kept_existing' });
    // The folder's documents are indexed by content when the sink opens, so a rerun finds them.
    const again = folderSink(core, dir, '0.0.0');
    const { createHash } = await import('node:crypto');
    expect(await again.findBySha256(createHash('sha256').update(pdf).digest('hex'))).toBe('a/f.pdf');
    await again.putAlias('a/g.pdf', 'a/f.pdf');
    expect(await again.aliasOf('a/g.pdf')).toBe('a/f.pdf');
  });
});
