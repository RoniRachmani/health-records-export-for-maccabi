import { describe, expect, it } from 'vitest';
import { letters, newCtx, placeOrder, waitMedicalFile } from '../src/core';
import { fakeMaccabi, fakeTransport, makeCollector, FakeClock, MemorySink, PDF, bytesResp } from './fakes';

const SUMMARY = '/online/medicalfile/summary/';
const ok = (success: string) => ({ status: 200, text: JSON.stringify({ d: JSON.stringify({ Success: success }) }) });

describe('placeOrder', () => {
  it('refuses to order from any other page', async () => {
    const site = fakeMaccabi();
    let xhrs = 0;
    const { c } = makeCollector(fakeTransport(site.routes, { pagePath: '/online/medicalfile/patientdrugs/', xhr: () => { xhrs++; return ok('1'); } }));
    expect(await placeOrder(c)).toEqual({ error: 'open /online/medicalfile/summary/ first' });
    expect(xhrs).toBe(0);
  });

  it('sends the site\'s request with the Israel date and counts only Success 1', async () => {
    const site = fakeMaccabi();
    const sent: string[] = [];
    const clock = new FakeClock();
    clock.t = Date.parse('2026-09-16T22:30:00Z'); // 01:30 in Israel on the 17th
    const t = fakeTransport(site.routes, { pagePath: SUMMARY, xhr: (req) => { sent.push(req.url + ' ' + JSON.stringify(req.headers) + ' ' + req.body); return ok('1'); } });
    const { c } = makeCollector(t, new MemorySink(), clock);
    expect(await placeOrder(c)).toMatchObject({ ordered: true, success_code: '1', to_date: '2026-09-17', same_day_before: false });
    expect(sent).toEqual([
      '/online/Ajax/Summary/WsSummaryPage.asmx/MedicalFileOrderAjax {"Content-Type":"application/json; charset=UTF-8","X-Requested-With":"XMLHttpRequest"} ' +
      "{'startDate':'1900-01-01','endDate':'2026-09-17'}",
    ]);

    const { c: c2, sink } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => ok('2') }));
    expect(await placeOrder(c2)).toMatchObject({ ordered: false, success_code: '2' });
    expect((sink as MemorySink).problems[0].what).toMatch(/not confirmed: HTTP 200 Success 2/);
  });

  it('orders nothing when a file from today over the same range is already waiting', async () => {
    const ready = { letter_type: 2, status: 1, to_date: '2026-09-17', from_date: '1900-01-01T00:00:00', item_date: '2026-09-17T08:00:00', link: 'mf.pdf', timestamp: 'ts' };
    const site = fakeMaccabi({ medicalFile: ready });
    let xhrs = 0;
    const { c } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => { xhrs++; return ok('1'); } }));
    expect(await placeOrder(c)).toMatchObject({ ordered: false, skipped_ready_today: true, same_day_before: true, to_date: '2026-09-17' });
    expect(xhrs).toBe(0);

    // A same-day file over a narrower range isn't what this export asks for, so it does order.
    const narrower = fakeMaccabi({ medicalFile: { ...ready, from_date: '2023-09-17T00:00:00' } });
    const { c: c2 } = makeCollector(fakeTransport(narrower.routes, { pagePath: SUMMARY, xhr: () => { xhrs++; return ok('1'); } }));
    expect(await placeOrder(c2)).toMatchObject({ ordered: true, same_day_before: true });
    expect(xhrs).toBe(1);
  });
});

describe('waitMedicalFile', () => {
  it('waits for the pending file, downloads it replacing a same-day file, and refreshes the letters list', async () => {
    const state = { medicalFile: null as null | Record<string, unknown> };
    const site = fakeMaccabi(state);
    const clock = new FakeClock();
    const sink = new MemorySink();
    sink.files.set('2026-09-17_medical-file.pdf', new Uint8Array([1]));
    let polls = 0;
    clock.onSleep = () => {
      polls++;
      if (polls === 2) state.medicalFile = { letter_type: 2, status: 0, to_date: '2026-09-17', item_date: '2026-09-17T12:00:00' };
      if (polls === 4) state.medicalFile = { letter_type: 2, status: 1, to_date: '2026-09-17', item_date: '2026-09-17T12:00:00', link: 'mf.pdf', timestamp: 'ts' };
    };
    const { c } = makeCollector(fakeTransport(site.routes), sink, clock);
    const w = await waitMedicalFile(c, { toDate: '2026-09-17', mustSeePending: true });
    expect(w).toMatchObject({ ready: true });
    expect(sink.files.get('2026-09-17_medical-file.pdf')).toEqual(PDF);
    expect(sink.files.has('letters/list.json')).toBe(true);
    expect(sink.problems).toEqual([]);
  });

  it('gives up when no letter appears within 2 minutes', async () => {
    const site = fakeMaccabi();
    const { c, sink } = makeCollector(fakeTransport(site.routes));
    expect(await waitMedicalFile(c, { toDate: '2026-09-17' })).toMatchObject({ ready: false });
    expect((sink as MemorySink).problems[0].what).toMatch(/no medical file with to_date 2026-09-17 after 1[23]\d s/);
    expect((sink as MemorySink).problems[0].where).toBe('medical-file');
  });

  it('retries a 202 download up to 8 times', async () => {
    const state = { medicalFile: { letter_type: 2, status: 1, to_date: '2026-09-17', item_date: '2026-09-17', link: 'mf.pdf', timestamp: 'ts' } };
    const site = fakeMaccabi(state);
    let n = 0;
    const t = fakeTransport([(req, url) => (url.pathname.includes('MainAppAPI/webapi/mac/v2') ? (++n < 8 ? bytesResp(new Uint8Array(), 'text/plain', 202) : undefined) : undefined), ...site.routes]);
    const { c, sink } = makeCollector(t);
    expect(await waitMedicalFile(c, { toDate: '2026-09-17' })).toMatchObject({ ready: true });
    expect(n).toBe(8);
    expect((sink as MemorySink).files.get('2026-09-17_medical-file.pdf')).toEqual(PDF);
  });
});

describe('letters', () => {
  it('leaves the existing medical file alone when a new one will be ordered', async () => {
    const state = { medicalFile: { letter_type: 2, status: 1, to_date: '2026-01-01', item_date: '2026-01-01', link: 'old.pdf', timestamp: 'ts' } };
    const site = fakeMaccabi(state);
    const { c, sink } = makeCollector(fakeTransport(site.routes));
    await letters(c, { ...newCtx(), skipExistingMedicalFile: true });
    expect([...(sink as MemorySink).files.keys()].sort()).toEqual(['letters/files/2026-04-01_L1_מכתב-שיחרור.pdf', 'letters/list.json']);
    await letters(c, newCtx());
    expect((sink as MemorySink).files.has('2026-01-01_medical-file.pdf')).toBe(true);
  });
});
