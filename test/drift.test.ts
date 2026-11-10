// scripts/drift-lib.mjs, what `npm run drift` is made of: the run of every step over a sink that keeps nothing,
// with the answers' shapes recorded and compared with docs/endpoints/shapes.json, the endpoint scan over the session's
// own requests, and the report. Against the fake site, a run finds nothing; the site changed under it (a renamed list
// key, a field gone from the code, an ended session) finds each, and the report names it without a value.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newCtx, SessionEndedError, type HttpRequest, type Transport } from '../src/core';
import * as core from '../src/cli/index';
import {
  countingTransport, driftReport, featureFlags, flagChanges, launchAgent, memorySink, missingFields, ours, pageScripts, problemKey, readScripts, runSteps, safeToWrite, scanFindings, sessionGet,
} from '../scripts/drift-lib.mjs';
import { lastRunFile, lastSlot, parseSchedule, whenDue, withoutDue } from '../scripts/drift-due.mjs';
import { fakeMaccabi, fakeTransport, makeCollector, MID } from './fakes';

const known = JSON.parse(readFileSync('docs/endpoints/shapes.json', 'utf8'));
const maps = {
  endpoints: JSON.parse(readFileSync('docs/endpoints/endpoints.json', 'utf8')),
  baseline: JSON.parse(readFileSync('docs/endpoints/scan-baseline.json', 'utf8'))['endpoints.json'],
};

/** The run as drift-check.mjs puts it together, over `transport`, with the legacy page "loaded" in between. */
async function check(transport: Transport, steps = core.STEP_ORDER) {
  const seen: Record<string, Record<string, string[]>> = {};
  const counting = countingTransport(transport, core, MID);
  const sink = memorySink(core);
  const { c } = makeCollector(core.shapeTransport(counting, MID, (s) => { core.mergeShapes(seen, s); }), sink);
  const primed: string[] = [];
  const done = await runSteps(core, {
    collector: c, ctx: newCtx(), sink, steps,
    primeLegacy: async () => { primed.push('legacy'); },
    backToPortal: async () => { primed.push('portal'); return c.session; },
  });
  return { done, sink, seen, counting, primed };
}

/** The fake site with one answer changed by `edit`. */
function changed(match: (req: HttpRequest) => boolean, edit: (body: any) => any): Transport {
  const base = fakeTransport(fakeMaccabi().routes, { pagePath: '/online/medicalfile/summary/' });
  return {
    ...base,
    async fetch(req) {
      const r = await base.fetch(req);
      if (!match(req) || !/json/.test(r.contentType)) return r;
      return { ...r, bytes: new TextEncoder().encode(JSON.stringify(edit(JSON.parse(new TextDecoder().decode(r.bytes))))) };
    },
  };
}

const report = (over: Partial<Parameters<typeof driftReport>[0]>) => driftReport({
  date: '2026-11-03', seconds: 600, requests: 100, stopped: null, signIn: null, drift: [], missing: [], endpoints: 30,
  problems: [], before: null, statuses: {}, counts: { visits: 3 }, scan: null, ...over,
});

describe('a drift check against the fake site', () => {
  it('runs every step, the legacy ones first under one priming, keeps nothing, and finds no drift', async () => {
    const { done, sink, seen, counting, primed } = await check(fakeTransport(fakeMaccabi().routes, { pagePath: '/online/medicalfile/summary/' }));
    expect(done.stopped).toBeNull();
    expect(done.ran).toEqual([...core.STEP_ORDER.filter((s) => core.LEGACY_STEPS.includes(s)), ...core.STEP_ORDER.filter((s) => !core.LEGACY_STEPS.includes(s))]);
    expect(primed).toEqual(['legacy', 'portal']);
    expect(Object.keys(sink.counts()).length).toBeGreaterThan(5);
    // The fake answers within shapes.json (test/shapes.test.ts holds it there), so nothing drifted.
    expect(core.shapeDrift(known, seen)).toEqual([]);
    expect(Object.keys(seen).length).toBeGreaterThan(10);
    expect(Object.values(counting.statuses).flatMap((s) => Object.keys(s))).toContain('200');
    const r = report({ problems: sink.problems.map(problemKey), drift: [], counts: sink.counts(), statuses: counting.statuses });
    expect(r.differs).toBe(sink.problems.length > 0);
    expect(r.state?.problems).toEqual([...new Set(sink.problems.map(problemKey).map((k) => `${k.step} ${k.folder}: ${k.kind}, ${k.detail}`))].sort());
  });

  it('finds a renamed list key as a shape problem and a new field, and names neither value', async () => {
    const { done, sink, seen } = await check(changed(
      (req) => /\/referrals/.test(req.url) && !/\/referrals\/./.test(req.url.split('?')[0]),
      (body) => (body && Array.isArray(body.referrals) ? { referral_list: body.referrals.map(() => ({ title: 'הפניה לרופא' })), member: MID + '99' } : body),
    ), ['referrals']);
    expect(done.stopped).toBeNull();
    const keys = sink.problems.map(problemKey);
    expect(keys).toContainEqual({ step: 'referrals', kind: 'shape', folder: 'referrals', detail: 'expected `referrals`, found referral_list, member' });
    const drift = core.shapeDrift(known, seen);
    expect(drift.some((d: string) => d.includes('$.referral_list: new field'))).toBe(true);
    const r = report({ problems: keys, drift, missing: missingFields(known, seen) });
    expect(r.differs).toBe(true);
    expect(r.text).toContain('Shape problem: referrals referrals: shape, expected `referrals`');
    expect(r.text).not.toContain('הפניה');
    expect(r.text).not.toContain(MID);
    expect(safeToWrite(r.text)).toBe(true);
  });

  it('stops at an ended session, files it against the step, and runs nothing after it', async () => {
    const base = fakeTransport(fakeMaccabi().routes, { pagePath: '/online/medicalfile/summary/' });
    const dying: Transport = { ...base, async fetch() { throw new SessionEndedError('/my.logout.php3'); } };
    const steps = core.STEP_ORDER.filter((s) => s === 'visits' || s === 'referrals');
    const { done, sink, counting } = await check(dying, steps);
    expect(done.stopped).toBe(steps[0]);
    expect(done.ran).toEqual([steps[0]]);
    expect(sink.problems.map(problemKey)).toContainEqual({ step: steps[0], kind: 'failure', folder: steps[0], detail: 'session ended' });
    expect(Object.values(counting.statuses).some((s) => s['no answer'])).toBe(true);
    const r = report({ stopped: done.stopped, problems: sink.problems.map(problemKey) });
    expect(r).toMatchObject({ differs: true, failed: true, state: null });
    expect(r.text).toContain('The run stopped in `' + steps[0] + '`');
  });
});

describe('what the report may name', () => {
  it('a problem by step, folder and kind of failure, never its file name or text', () => {
    const p = { where: 'visits/2026-01-05_A1_דר כהן.json', what: 'HTTP 500 for ' + MID + ' רופא', at: '', step: 'visits' };
    expect(problemKey(p)).toEqual({ step: 'visits', kind: 'failure', folder: 'visits', detail: 'HTTP 500' });
    expect(problemKey({ ...p, what: 'something about רופא' }).detail).toBe('other');
    expect(problemKey({ ...p, where: 'דר כהן' }).folder).toBe('?');
    const shape = problemKey({ ...p, kind: 'shape', what: 'Maccabi answered…: expected a `tests` list, found only רשימה, items, 2026-01-05' });
    expect(shape.detail).toBe('expected `tests`, found <key>, items, <key>');
    expect(problemKey({ ...p, kind: 'shape', what: '…: expected a `tests` list, found `tests` as string' }).detail).toBe('expected `tests`, found tests as string');
  });

  it('counts a problem as a difference only when the last completed check did not have it', () => {
    const k = { step: 'visits', kind: 'failure', folder: 'visits', detail: 'HTTP 500' };
    const first = report({ problems: [k] });
    expect(first.differs).toBe(true);
    const again = report({ problems: [k], before: first.state });
    expect(again.differs).toBe(false);
    expect(again.text).toContain('**No differences**');
    expect(report({ problems: [k, { ...k, detail: 'HTTP 404' }], before: first.state }).text).toContain('New problem: visits visits: failure, HTTP 404');
  });

  it('says a failed sign-in plainly, as a check that did not happen, and leaves the last state alone', () => {
    const r = report({ signIn: 'the sign-in failed: Maccabi refused the password.' });
    expect(r).toMatchObject({ differs: false, failed: true, state: null });
    expect(r.text).toContain('**Could not check: the sign-in failed');
  });

  it('refuses to write Hebrew or a long number', () => {
    expect(safeToWrite('GET /sonline/X/{mid}/visits')).toBe(true);
    expect(safeToWrite('a ' + MID + '7')).toBe(false);
    expect(safeToWrite('רופא')).toBe(false);
  });
});

describe('the site\'s feature flags', () => {
  const answer = (body: unknown, status = 200) => ({ status, redirected: false, bytes: new TextEncoder().encode(JSON.stringify(body)) });
  const flags = [{ feature_id: 'isOpenPdfByLinkHandlerV2', feature_enabled: true }, { feature_id: 'IshurMakdim', feature_enabled: true }, { feature_id: 'showWhatsNew', feature_enabled: false }];

  it('reads each flag by name, and says why when it cannot', () => {
    expect(featureFlags(answer(flags))).toEqual({ flags: { isOpenPdfByLinkHandlerV2: 'true', IshurMakdim: 'true', showWhatsNew: 'false' } });
    expect(featureFlags(answer(flags, 502))).toEqual({ error: 'HTTP 502' });
    expect(featureFlags({ status: 0, redirected: true, bytes: new Uint8Array() })).toEqual({ error: 'session ended' });
    expect(featureFlags(answer({ features: flags }))).toEqual({ error: 'the answer is no longer a list of {feature_id, feature_enabled}' });
    // A name that is not an identifier, or a value that is not a flag's, never reaches a report.
    expect(featureFlags(answer([...flags, { feature_id: 'דגל', feature_enabled: true }]))).toHaveProperty('error');
    expect(featureFlags(answer([...flags, { feature_id: 'x', feature_enabled: MID }]))).toHaveProperty('error');
  });

  it('names each flag that turned, appeared or went, and marks the ones the export depends on', () => {
    expect(flagChanges({ isOpenPdfByLinkHandlerV2: 'true', old: 'true', same: 'false' }, { isOpenPdfByLinkHandlerV2: 'false', same: 'false', fresh: 'true' })).toEqual([
      'fresh: new, true',
      'isOpenPdfByLinkHandlerV2: now false, was true (the export\'s downloads depend on it)',
      'old: gone, was true',
    ]);
  });

  it('keeps the flags for the next check, and counts a change since then as a difference', () => {
    const first = report({ flags: featureFlags(answer(flags)) });
    expect(first.differs).toBe(false);
    expect(first.state?.flags).toEqual({ isOpenPdfByLinkHandlerV2: 'true', IshurMakdim: 'true', showWhatsNew: 'false' });
    expect(first.text).toContain('3 flags; kept for the next check to compare with.');
    expect(first.text).toContain('isOpenPdfByLinkHandlerV2 true, IshurMakdim true');
    expect(report({ flags: featureFlags(answer(flags)), before: first.state }).differs).toBe(false);
    const turned = report({ flags: featureFlags(answer([{ ...flags[0], feature_enabled: false }, flags[1], flags[2]])), before: first.state });
    expect(turned.differs).toBe(true);
    expect(turned.text).toContain('- Feature flag: isOpenPdfByLinkHandlerV2: now false, was true (the export\'s downloads depend on it)');
    expect(safeToWrite(turned.text)).toBe(true);
    // Flags that could not be read are a difference, and the last ones stay for the next check.
    const unread = report({ flags: { error: 'HTTP 502' }, before: first.state });
    expect(unread.differs).toBe(true);
    expect(unread.text).toContain('The feature flags could not be read: HTTP 502');
    expect(unread.state?.flags).toEqual(first.state?.flags);
  });
});

describe('the endpoint scan over the session', () => {
  const ORIGIN = core.MACCABI_ORIGIN;
  const site: Record<string, string> = {
    '/sonline/static/js/main.1.js': 'fetch("x");var p="chunk.2.js";',
    '/sonline/static/js/chunk.2.js': 'rest.get(base, "VisitsAPI/v1/members/{0}/visits")',
    '/sonline/static/js/gone.js': '',
  };
  const get = async (url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith('gone.js')) return { failed: '404' };
    return path in site ? { text: site[path] } : { failed: 'redirect' };
  };

  it('starts from the page\'s script tags and preloads, and follows the chunks they name, on Maccabi\'s servers only', async () => {
    const html = '<script src="/sonline/static/js/main.1.js"></script><script src="https://cdn.example.com/x.js"></script>'
      + '<link rel="modulepreload" href="static/js/gone.js"><link rel="stylesheet" href="/a.css">';
    const start = pageScripts(html, ORIGIN + '/sonline/');
    expect(start).toEqual([ORIGIN + '/sonline/static/js/main.1.js', 'https://cdn.example.com/x.js', ORIGIN + '/sonline/static/js/gone.js']);
    const found = { files: new Map<string, string>(), failed: new Map<string, string>(), capped: false };
    await readScripts(get, start, found);
    expect([...found.files.keys()]).toEqual(['/sonline/static/js/main.1.js', '/sonline/static/js/chunk.2.js']);
    expect(Object.fromEntries(found.failed)).toEqual({ '/sonline/static/js/gone.js': '404' });
    expect(ours('https://cdn.example.com/x.js')).toBe(false);
  });

  it('stops after three redirects in a row, which is a session that ended', async () => {
    const found = { files: new Map<string, string>(), failed: new Map<string, string>(), capped: false };
    let asked = 0;
    await readScripts(async () => { asked++; return { failed: 'redirect' }; }, ['a', 'b', 'c', 'd', 'e'].map((x) => ORIGIN + '/' + x + '.js'), found);
    expect(asked).toBe(3);
  });

  it('reads a script, and no redirect, error page or web page, through the session\'s queue', async () => {
    const answers: Record<string, Response> = {
      '/a.js': new Response('var a', { status: 200 }),
      '/b.js': new Response(null, { status: 302, headers: { location: '/my.logout.php3' } }),
      '/c.js': new Response('<html>', { status: 200 }),
      '/d.js': new Response('nope', { status: 404 }),
    };
    const inits: (RequestInit | undefined)[] = [];
    const session = { request: async (url: string, init?: RequestInit) => { inits.push(init); const r = answers[new URL(url).pathname]; if (!r) throw new SessionEndedError('x'); return r; } };
    const g = sessionGet(session);
    expect(await g(ORIGIN + '/a.js')).toEqual({ text: 'var a' });
    expect(await g(ORIGIN + '/b.js')).toEqual({ failed: 'redirect' });
    expect(await g(ORIGIN + '/c.js')).toEqual({ failed: 'a web page, not a script' });
    expect(await g(ORIGIN + '/d.js')).toEqual({ failed: '404' });
    expect(await g(ORIGIN + '/e.js')).toEqual({ failed: 'redirect' });
    expect(inits.every((i) => i?.redirect === 'manual')).toBe(true);
  });

  it('marks a mapped request the code no longer has, and lists calls the last check had not seen', () => {
    const files = new Map([['/sonline/a.js', 'rest.get(base, "VisitsAPI/v1/members/{0}/visits"); rest.get(b, "NewAPI/v1/members/{0}/thing")']]);
    const f = scanFindings(files, maps, ['GET /sonline/VisitsAPI/v1/members/{}/visits']);
    expect(f.mapped).toBeGreaterThan(30);
    expect(f.absent.length).toBeGreaterThan(20); // a one-file "site" lacks nearly all of them
    expect(f.calls.length).toBeGreaterThan(0);
    expect(f.newCalls.every((c: string) => f.calls.includes(c))).toBe(true);
    expect(f.newCalls.some((c: string) => c.includes('NewAPI'))).toBe(true);
    const r = report({ scan: { ...f, read: 1, failed: {}, capped: false } });
    expect(r.differs).toBe(true);
    expect(r.text).toContain('Gone from the site\'s code: ');
    expect(r.state?.calls).toEqual(f.calls);
    expect(report({ scan: { error: 'the portal page did not open' } })).toMatchObject({ differs: true, failed: true });
  });
});

describe('when a check is due', () => {
  const tue = parseSchedule('tue', '03:30');
  // Local times, as launchd keeps the schedule. 2026-11-10 is a Tuesday.
  const at = (s: string) => new Date(s);

  it('is due from the weekly time until a check begins, whatever its outcome', () => {
    expect(lastSlot(at('2026-11-10T03:30:00'), tue)).toEqual(at('2026-11-10T03:30:00'));
    expect(lastSlot(at('2026-11-10T03:29:30'), tue)).toEqual(at('2026-11-10T03:30:00')); // a moment early is still this week's
    expect(lastSlot(at('2026-11-10T02:00:00'), tue)).toEqual(at('2026-11-03T03:30:00'));
    expect(lastSlot(at('2026-11-15T12:00:00'), tue)).toEqual(at('2026-11-10T03:30:00'));
  });

  it('runs a login after a missed week once, and not at the logins after it', () => {
    const root = mkdtempSync(join(tmpdir(), 'drift-due-'));
    const args = ['--notify', '--due', 'tue@03:30'];
    expect(whenDue(args, root, at('2026-11-10T14:08:00'))).toEqual({ run: true }); // never run: due
    expect(JSON.parse(readFileSync(lastRunFile(root), 'utf8'))).toEqual({ began: at('2026-11-10T14:08:00').toISOString() });
    expect(whenDue(args, root, at('2026-11-10T18:00:00'))).toMatchObject({ run: false, why: expect.stringMatching(/^not due/) });
    expect(whenDue(args, root, at('2026-11-16T09:00:00')).run).toBe(false);
    expect(whenDue(args, root, at('2026-11-17T03:30:00')).run).toBe(true); // the next week's time
    expect(whenDue(['--notify'], root, at('2026-11-17T03:31:00')).run).toBe(true); // from the terminal: always
    expect(withoutDue(args)).toEqual(['--notify']);
    expect(() => whenDue(['--due', 'someday@03:30'], root)).toThrow(/day and a time/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('the weekly schedule', () => {
  const o = { node: '/opt/homebrew/bin/node', script: '/repo/scripts/drift-check.mjs', cwd: '/repo & co', log: '/repo/.cache/drift/launchd.log', path: '/usr/bin:/bin' };

  it('is a launchd agent that runs the check with --notify on the day and time given', () => {
    const plist = launchAgent({ ...o, day: 'Tuesday', time: '03:30' });
    expect(plist).toContain('<integer>2</integer><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer>');
    expect(plist).toContain('<string>/opt/homebrew/bin/node</string><string>/repo/scripts/drift-check.mjs</string><string>--notify</string>');
    expect(plist).toContain('<string>/repo &amp; co</string>');
  });

  it('also starts at login, and says which weekly time it keeps, so a login runs only a missed week', () => {
    const plist = launchAgent({ ...o, day: 'Tuesday', time: '03:30' });
    expect(plist).toContain('<string>--notify</string><string>--due</string><string>tue@03:30</string></array>');
    expect(plist).toContain('<key>RunAtLoad</key><true/>');
  });

  it('puts the folder of the node it runs first on its PATH, once, so npm finds that node', () => {
    expect(launchAgent({ ...o, day: 'tue', time: '03:30' })).toContain('<key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin</string>');
    expect(launchAgent({ ...o, node: '/Users/a/.local/node/bin/node', path: '/opt/homebrew/bin:/Users/a/.local/node/bin:/bin', day: 'tue', time: '03:30' }))
      .toContain('<key>PATH</key><string>/Users/a/.local/node/bin:/opt/homebrew/bin:/bin</string>');
  });

  // It runs before the dependencies it would install, so it may import nothing outside Node.
  it('updates a checkout with an entry point that imports only Node', () => {
    const imports = (f: string) => [...readFileSync(f, 'utf8').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports('scripts/drift-update.mjs').length).toBeGreaterThan(0);
    expect(imports('scripts/drift-update.mjs').filter((m) => !m.startsWith('node:'))).toEqual(['./drift-due.mjs']);
    expect(imports('scripts/drift-due.mjs').filter((m) => !m.startsWith('node:'))).toEqual([]);
  });

  it('refuses a day or a time it cannot read', () => {
    expect(() => launchAgent({ ...o, day: 'someday', time: '03:30' })).toThrow(/day and a time/);
    expect(() => launchAgent({ ...o, day: 'tue', time: '25:00' })).toThrow(/day and a time/);
  });
});
