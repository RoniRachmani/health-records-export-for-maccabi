import { describe, expect, it } from 'vitest';
import { letters, newCtx, orderSettled, placeOrder, waitMedicalFile } from '../src/core';
import type { HttpRequest } from '../src/core/types';
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

  it('sends the site\'s request with the Israel date and counts Success 1 and 2 as ordered', async () => {
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

    // '2' is an order Maccabi took without texting: the file is built all the same, and waited for.
    const { c: c2, sink } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => ok('2') }));
    expect(await placeOrder(c2)).toMatchObject({ ordered: true, sent: true, success_code: '2', to_date: '2026-09-17' });
    expect((sink as MemorySink).problems).toEqual([]);
  });

  it('reports a refused or unanswered order as sent, and only a refusal may be sent again', async () => {
    const site = fakeMaccabi();
    const { c, sink } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => ok('3') }));
    const refused = await placeOrder(c);
    expect(refused).toMatchObject({ ordered: false, sent: true, success_code: '3' });
    expect((sink as MemorySink).problems[0].what).toMatch(/not confirmed: HTTP 200 Success 3/);
    expect(orderSettled(refused)).toBe(false);

    // No answer (the tab's XHR fails or times out) is not a refusal: Maccabi may have taken the order.
    const { c: c2 } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => ({ status: 0, text: '' }) }));
    const lost = await placeOrder(c2);
    expect(lost).toMatchObject({ ordered: false, sent: true });
    expect(orderSettled(lost)).toBe(true);
    const { c: c3 } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => ({ status: 500, text: 'oops' }) }));
    expect(orderSettled(await placeOrder(c3))).toBe(true);
  });

  it('settles an order once it was placed, skipped or possibly taken, and not before', () => {
    expect(orderSettled(undefined)).toBe(false);
    expect(orderSettled({ error: 'open /online/medicalfile/summary/ first' })).toBe(false);
    expect(orderSettled({ ordered: false })).toBe(false); // the letters list failed: nothing was sent
    expect(orderSettled({ ordered: true, sent: true, success_code: '1' })).toBe(true);
    expect(orderSettled({ ordered: false, skipped_ready_today: true })).toBe(true);
    // A run stored by an earlier version has no sent: it goes by ordered, as it did.
    expect(orderSettled({ ordered: true, success_code: '1' })).toBe(true);
  });

  it('orders nothing when a file from today over the same range is already waiting', async () => {
    const ready = { letter_type: 2, status: 1, to_date: '2026-09-17', from_date: '1900-01-01T00:00:00', item_date: '2026-09-17T08:00:00', link: 'mf.pdf', timestamp: 'ts' };
    const site = fakeMaccabi({ medicalFile: ready });
    let xhrs = 0;
    const { c } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => { xhrs++; return ok('1'); } }));
    expect(await placeOrder(c)).toMatchObject({ ordered: false, skipped_ready_today: true, same_day_before: true, same_range_before: true, to_date: '2026-09-17' });
    expect(xhrs).toBe(0);

    // A same-day file over a narrower range isn't what this export asks for, so it does order.
    const narrower = fakeMaccabi({ medicalFile: { ...ready, from_date: '2023-09-17T00:00:00' } });
    const { c: c2 } = makeCollector(fakeTransport(narrower.routes, { pagePath: SUMMARY, xhr: () => { xhrs++; return ok('1'); } }));
    expect(await placeOrder(c2)).toMatchObject({ ordered: true, same_day_before: true, same_range_before: false });
    expect(xhrs).toBe(1);

    // reorder (dev:reorder) orders anyway, and the wait then looks for the new file, not the ready one.
    const { c: c3 } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => { xhrs++; return ok('1'); } }));
    expect(await placeOrder(c3, { reorder: true })).toMatchObject({ ordered: true, same_day_before: true, same_range_before: true });
    expect(xhrs).toBe(2);
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

  it('takes a ready same-range file as the new one 2 minutes after the order, not after the wait began', async () => {
    // Maccabi never lists the new file pending, and the rest of the run has usually used up the 2 minutes already.
    const ready = { letter_type: 2, status: 1, to_date: '2026-09-17', from_date: '1900-01-01T00:00:00', item_date: '2026-09-17T12:00:00', link: 'mf.pdf', timestamp: 'ts' };
    const wait = async (sinceOrderMs: number) => {
      const clock = new FakeClock();
      const { c } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: ready }).routes), new MemorySink(), clock);
      return waitMedicalFile(c, { toDate: '2026-09-17', fromDate: '1900-01-01', mustSeePending: true, orderedAt: clock.t - sinceOrderMs });
    };
    expect(await wait(150_000)).toMatchObject({ ready: true, polls: 1 });
    // Ordered a minute ago: the other minute is waited here.
    const w = await wait(60_000);
    expect(w.ready).toBe(true);
    expect(w.ready_after_s).toBeGreaterThanOrEqual(60);
    expect(w.ready_after_s).toBeLessThan(120);
  });

  it('waits past today\'s file over a narrower range, however long the new one takes', async () => {
    // Maccabi swaps the file in place and never lists it pending: only the range tells the new one from the old.
    const narrower = { letter_type: 2, status: 1, to_date: '2026-09-17', from_date: '2023-09-17T00:00:00', item_date: '2026', link: 'old.pdf', timestamp: 'a' };
    const state = { medicalFile: narrower as Record<string, unknown> };
    const site = fakeMaccabi(state);
    const clock = new FakeClock();
    const t0 = clock.t;
    clock.onSleep = () => {
      // 3 minutes in: past the 2 after which a same-range file is taken without seeing it pending.
      if (clock.t - t0 >= 180_000) state.medicalFile = { ...narrower, from_date: '1900-01-01T00:00:00', link: 'mf.pdf', timestamp: 'b' };
    };
    const details: string[] = [];
    const transport = fakeTransport(site.routes);
    const partAtDownload: string[] = [];
    const watched = { ...transport, fetch: (req: HttpRequest) => (req.url.includes('mf.pdf') && partAtDownload.push(details[details.length - 1]), transport.fetch(req)) };
    const { c, sink } = makeCollector(watched, new MemorySink(), clock, { progress: (ev) => details.push(ev.detail ?? '') });
    const w = await waitMedicalFile(c, { toDate: '2026-09-17', fromDate: '1900-01-01', mustSeePending: false });
    // The download is timed and described as the `letters` part, not as the last status the wait saw.
    expect(partAtDownload).toEqual(['letters']);
    // Taking the narrower file would have been immediate: nothing about it is pending.
    expect(w.ready).toBe(true);
    expect(w.ready_after_s).toBeGreaterThanOrEqual(180);
    expect(details[0]).toBe('medical file status pending');
    expect((sink as MemorySink).problems).toEqual([]);
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
