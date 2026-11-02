import { describe, expect, it, vi } from 'vitest';
import { keepListedMedicalFile, letters, newCtx, orderRefused, orderSettled, placeOrder, REFUSAL_RETRY_MS, waitMedicalFile } from '../src/core';
import type { HttpRequest } from '../src/core/types';
import { fakeMaccabi, fakeTransport, makeCollector, FakeClock, MemorySink, PDF, bytesResp } from './fakes';

const SUMMARY = '/online/medicalfile/summary/';
const ok = (success: string) => ({ status: 200, text: JSON.stringify({ d: JSON.stringify({ Success: success }) }) });

describe('placeOrder', () => {
  it('takes an order an earlier run sent today instead of sending another', async () => {
    const xhr = vi.fn(() => ({ status: 200, text: JSON.stringify({ d: JSON.stringify({ Success: '1' }) }) }));
    const site = fakeMaccabi();
    const { c } = makeCollector(fakeTransport(site.routes, { pagePath: '/online/medicalfile/summary/', xhr }));
    const beforeSend = vi.fn(async () => {});
    const taken = await placeOrder(c, { beforeSend, earlier: { confirmed: true, code: '1' } });
    expect(taken).toMatchObject({ ordered: true, earlier_order: true, success_code: '1', to_date: '2026-09-17' });
    expect(taken.sent).toBeUndefined();
    expect(orderSettled(taken)).toBe(true);
    const lost = await placeOrder(c, { beforeSend, earlier: { confirmed: false } });
    expect(lost).toMatchObject({ ordered: false, earlier_order: true });
    expect(orderSettled(lost)).toBe(true);
    expect(xhr).not.toHaveBeenCalled();
    expect(beforeSend).not.toHaveBeenCalled();
    // dev:reorder times a real order, whatever went before.
    await placeOrder(c, { reorder: true, beforeSend, earlier: { confirmed: true } });
    expect(xhr).toHaveBeenCalledOnce();
  });

  it('still prefers a file that is ready to an earlier order', async () => {
    const site = fakeMaccabi({ medicalFile: { letter_type: 2, status: 1, link: 'x.pdf', to_date: '2026-09-17', from_date: '1900-01-01T00:00:00' } });
    const { c } = makeCollector(fakeTransport(site.routes, { pagePath: '/online/medicalfile/summary/' }));
    expect(await placeOrder(c, { earlier: { confirmed: true } })).toMatchObject({ skipped_ready_today: true });
  });

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

  it('reports a refused or unanswered order as sent, and never sends either again', async () => {
    const site = fakeMaccabi();
    const { c, sink } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => ok('3') }));
    const refused = await placeOrder(c);
    // An hour after the answer (FakeClock's 12:00 in Israel, and the pacing since), a later run may order once more.
    expect(refused).toEqual({ ordered: false, sent: true, success_code: '3', retry_at: expect.stringMatching(/^2026-09-17T10:00:0/) });
    // Reported at the wait, with the file the export keeps instead. Maccabi may still carry it out (2026-10-15: an SMS
    // 21 minutes after a refusal), so a resume does not order again.
    expect((sink as MemorySink).problems).toEqual([]);
    expect(orderSettled(refused)).toBe(true);
    expect(orderRefused(refused)).toBe(true);

    // No answer (the tab's XHR fails or times out) is not a refusal: Maccabi may have taken the order.
    const { c: c2 } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => ({ status: 0, text: '' }) }));
    const lost = await placeOrder(c2);
    expect(lost).toMatchObject({ ordered: false, sent: true });
    expect(orderSettled(lost)).toBe(true);
    expect(orderRefused(lost)).toBe(false);
    const { c: c3 } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => ({ status: 500, text: 'oops' }) }));
    expect(orderSettled(await placeOrder(c3))).toBe(true);
  });

  describe('after a refusal earlier today', () => {
    const refusedAt = '2026-09-17T09:00:00.000Z'; // FakeClock's start, 12:00 in Israel
    const refused = { confirmed: false, code: '3', at: refusedAt };
    function at(t: string, xhr = vi.fn(() => ok('1')), site = fakeMaccabi()) {
      const clock = new FakeClock();
      clock.t = Date.parse(t);
      return { xhr, ...makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr }), new MemorySink(), clock) };
    }

    it('orders nothing before the cool-down, and says when a new run may', async () => {
      const { c, xhr } = at('2026-09-17T09:59:00Z');
      const r = await placeOrder(c, { earlier: refused });
      expect(r).toMatchObject({ ordered: false, earlier_order: true, success_code: '3', retry_at: '2026-09-17T10:00:00.000Z' });
      expect(orderRefused(r)).toBe(true);
      expect(xhr).not.toHaveBeenCalled();
    });

    it('orders once more after it, as the day\'s retry', async () => {
      expect(REFUSAL_RETRY_MS).toBe(60 * 60000);
      const seen: { retry: boolean }[] = [];
      const { c, xhr } = at('2026-09-17T10:00:00Z');
      const r = await placeOrder(c, { earlier: refused, beforeSend: async (o) => void seen.push(o) });
      expect(r).toMatchObject({ ordered: true, sent: true, retry: true, success_code: '1' });
      expect(r.earlier_order).toBeUndefined();
      expect(seen).toEqual([{ retry: true }]);
      expect(xhr).toHaveBeenCalledOnce();

      // Refused again: no retry is offered after the retry.
      const { c: c2 } = at('2026-09-17T10:00:00Z', vi.fn(() => ok('3')));
      const again = await placeOrder(c2, { earlier: refused });
      expect(again).toEqual({ ordered: false, sent: true, success_code: '3', retry: true });
      expect(orderRefused(again)).toBe(true);
    });

    it('still takes a ready file first: the refused order may have been carried out', async () => {
      const ready = { letter_type: 2, status: 1, to_date: '2026-09-17', from_date: '1900-01-01T00:00:00', item_date: '2026-09-17T08:00:00', link: 'mf.pdf', timestamp: 'ts' };
      const { c, xhr } = at('2026-09-17T15:00:00Z', vi.fn(() => ok('1')), fakeMaccabi({ medicalFile: ready }));
      expect(await placeOrder(c, { earlier: refused })).toMatchObject({ skipped_ready_today: true });
      expect(xhr).not.toHaveBeenCalled();
    });

    it('never retries a retry, an unanswered or unconfirmed order, or one with no time', async () => {
      for (const earlier of [{ ...refused, retried: true }, { confirmed: false, at: refusedAt }, { confirmed: false, code: '0', at: refusedAt }, { confirmed: false, code: '3' }, { confirmed: false, code: '3', at: 'x' }]) {
        const { c, xhr } = at('2026-09-17T20:00:00Z');
        const r = await placeOrder(c, { earlier });
        expect(r).toMatchObject({ ordered: false, earlier_order: true });
        expect(r.retry_at).toBeUndefined();
        expect(xhr).not.toHaveBeenCalled();
      }
    });
  });

  it('calls beforeSend just before the order goes out, and only when it does', async () => {
    const site = fakeMaccabi();
    const seen: string[] = [];
    const beforeSend = async () => void seen.push('beforeSend');
    const { c } = makeCollector(fakeTransport(site.routes, { pagePath: SUMMARY, xhr: () => (seen.push('xhr'), ok('1')) }));
    await placeOrder(c, { beforeSend });
    expect(seen).toEqual(['beforeSend', 'xhr']);

    // Nothing goes out from another page, or when today's file is already waiting.
    seen.length = 0;
    const { c: c2 } = makeCollector(fakeTransport(site.routes, { pagePath: '/sonline/', xhr: () => ok('1') }));
    await placeOrder(c2, { beforeSend });
    const ready = { letter_type: 2, status: 1, to_date: '2026-09-17', from_date: '1900-01-01T00:00:00', item_date: '2026-09-17T08:00:00', link: 'mf.pdf', timestamp: 'ts' };
    const { c: c3 } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: ready }).routes, { pagePath: SUMMARY, xhr: () => ok('1') }));
    expect(await placeOrder(c3, { beforeSend })).toMatchObject({ skipped_ready_today: true });
    expect(seen).toEqual([]);
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
    expect((sink as MemorySink).problems[0].what).toMatch(/^no medical file with to_date 2026-09-17 after 1[23]\d s, so this export has no medical file\. When Maccabi texts you today, export again/);
    expect((sink as MemorySink).problems[0].where).toBe('medical-file');
  });

  // 2026-10-26: an order Maccabi confirmed was still not swapped in 2 minutes into the wait, when an earlier day's
  // file in the list made the wait give up at once, and the export had no medical file at all.
  const earlierDay = { letter_type: 2, status: 1, to_date: '2026-09-10', from_date: '1900-01-01T00:00:00', item_date: '2026-09-10T00:00:00', link: 'old.pdf', timestamp: 'a' };

  it('waits past an earlier day\'s file as long as the new one takes', async () => {
    const state = { medicalFile: earlierDay as Record<string, unknown> };
    const clock = new FakeClock();
    const t0 = clock.t;
    clock.onSleep = () => {
      if (clock.t - t0 >= 300_000) state.medicalFile = { ...earlierDay, to_date: '2026-09-17', item_date: '2026-09-17T00:00:00', link: 'mf.pdf', timestamp: 'b' };
    };
    const details: string[] = [];
    const { c, sink } = makeCollector(fakeTransport(fakeMaccabi(state).routes), new MemorySink(), clock, { progress: (ev) => details.push(ev.detail ?? '') });
    const w = await waitMedicalFile(c, { toDate: '2026-09-17', fromDate: '1900-01-01', orderedAt: t0 - 120_000 });
    expect(w.ready).toBe(true);
    expect(w.ready_after_s).toBeGreaterThanOrEqual(300);
    expect(details[0]).toBe('medical file status pending');
    expect((sink as MemorySink).files.has('2026-09-17_medical-file.pdf')).toBe(true);
    expect((sink as MemorySink).files.has('2026-09-10_medical-file.pdf')).toBe(false);
    expect((sink as MemorySink).problems).toEqual([]);
  });

  it('keeps the earlier day\'s file, and names it, when the new one is not listed in 30 minutes', async () => {
    const { c, sink } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: earlierDay }).routes));
    const w = await waitMedicalFile(c, { toDate: '2026-09-17', fromDate: '1900-01-01' });
    expect(w.ready).toBe(false);
    expect(w.polls).toBeGreaterThanOrEqual(60);
    expect((sink as MemorySink).files.get('2026-09-10_medical-file.pdf')).toEqual(PDF);
    expect((sink as MemorySink).files.has('letters/list.json')).toBe(true);
    expect((sink as MemorySink).problems.map((p) => [p.where, p.what])).toEqual([[
      'medical-file',
      'medical file to 2026-09-17 not listed after 30 min, so this export has the earlier medical file, 2026-09-10_medical-file.pdf. ' +
      "When Maccabi texts you today, export again: that export takes today's file without ordering again",
    ]]);
  });

  it('stops waiting when the member saves now, keeps the listed file, and names its day', async () => {
    const { c, sink, clock } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: earlierDay }).routes));
    let polls = 0;
    const w = await waitMedicalFile(c, { toDate: '2026-09-17', fromDate: '1900-01-01', giveUp: () => ++polls >= 2 });
    expect(w).toMatchObject({ ready: false, polls: 2, kept: '2026-09-10' });
    expect(clock.sleeps.filter((ms) => ms === 15000)).toHaveLength(1);
    expect((sink as MemorySink).files.get('2026-09-10_medical-file.pdf')).toEqual(PDF);
    expect((sink as MemorySink).problems.map((p) => p.what)).toEqual([
      'saved without waiting for the file ordered today, so this export has the earlier medical file, 2026-09-10_medical-file.pdf. ' +
      "When Maccabi texts you today, export again: that export takes today's file without ordering again",
    ]);
  });

  it('still takes a file that became ready as the member pressed Save now', async () => {
    const ready = { ...earlierDay, to_date: '2026-09-17', from_date: '1900-01-01T00:00:00', status: 1, item_date: '2026-09-17T00:00:00' };
    const { c, sink } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: ready }).routes));
    expect(await waitMedicalFile(c, { toDate: '2026-09-17', fromDate: '1900-01-01', giveUp: () => true })).toMatchObject({ ready: true });
    expect((sink as MemorySink).problems).toEqual([]);
  });

  it('keeps today\'s file over a narrower range when the new one is not swapped in, and says what it covers', async () => {
    const narrower = { ...earlierDay, to_date: '2026-09-17', from_date: '2023-09-17T00:00:00', item_date: '2026-09-17T00:00:00' };
    const { c, sink } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: narrower }).routes));
    expect(await waitMedicalFile(c, { toDate: '2026-09-17', fromDate: '1900-01-01' })).toMatchObject({ ready: false });
    expect((sink as MemorySink).files.has('2026-09-17_medical-file.pdf')).toBe(true);
    expect((sink as MemorySink).problems.map((p) => p.what)).toEqual([
      'medical file to 2026-09-17 not listed after 30 min, so this export has the earlier medical file, ' +
      "2026-09-17_medical-file.pdf, which covers only 2023-09-17 to 2026-09-17. When Maccabi texts you today, export again: " +
      "that export takes today's file without ordering again",
    ]);
  });

  it('retries a 202 download up to 8 times', async () => {
    const state = { medicalFile: { letter_type: 2, status: 1, to_date: '2026-09-17', item_date: '2026-09-17', link: 'mf.pdf', timestamp: 'ts' } };
    const site = fakeMaccabi(state);
    let n = 0;
    const t = fakeTransport([(_req, url) => (url.pathname.includes('MainAppAPI/webapi/mac/v2') ? (++n < 8 ? bytesResp(new Uint8Array(), 'text/plain', 202) : undefined) : undefined), ...site.routes]);
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

describe('keepListedMedicalFile', () => {
  const earlier = { letter_type: 2, status: 1, to_date: '2026-10-14', item_date: '2026-10-14T09:00:00', link: 'old.pdf', timestamp: 'ts' };

  it('keeps the listed file and names it when Maccabi refused the order', async () => {
    const { c, sink } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: earlier }).routes));
    await keepListedMedicalFile(c, { ordered: false, sent: true, success_code: '3', retry_at: '2026-10-15T09:14:00.000Z' });
    expect((sink as MemorySink).files.get('2026-10-14_medical-file.pdf')).toEqual(PDF);
    expect((sink as MemorySink).problems.map((p) => [p.where, p.what])).toEqual([[
      'medical-file',
      'Maccabi Online asked to try again later, so this export has the earlier medical file, 2026-10-14_medical-file.pdf. ' +
      "If Maccabi texts you today, export again and it won't order. If not, an export from 12:14 orders once more (Success 3)",
    ]]);
  });

  it('says to try tomorrow once the day\'s retry is used, and fits a problem\'s 300 characters', async () => {
    const narrow = { ...earlier, to_date: '2026-10-15', item_date: '2026-10-15T09:00:00', from_date: '2023-10-15T00:00:00' };
    for (const retry_at of [undefined, '2026-10-15T09:14:00.000Z']) {
      const { c, sink } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: narrow }).routes));
      await keepListedMedicalFile(c, { ordered: false, earlier_order: true, success_code: '3', retry_at });
      const what = (sink as MemorySink).problems[0].what;
      expect(what).toMatch(/\(Success 3\)$/);
      expect(what).toContain(retry_at ? 'an export from 12:14 orders once more' : 'If not, export again tomorrow');
    }
  });

  it('says so when there is no earlier file, or the order was not taken for another reason', async () => {
    const { c, sink } = makeCollector(fakeTransport(fakeMaccabi().routes));
    await keepListedMedicalFile(c, { ordered: false, sent: true, success_code: '3' });
    expect((sink as MemorySink).problems[0].what).toMatch(/^Maccabi Online asked to try again later, so this export has no medical file\. /);

    const { c: c2, sink: sink2 } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: earlier }).routes));
    await keepListedMedicalFile(c2, { ordered: false, sent: true });
    expect((sink2 as MemorySink).problems[0].what).toBe('a new medical file was not ordered, so this export has the earlier medical file, 2026-10-14_medical-file.pdf');
  });

  it('reports nothing when no order was tried, or a ready file from today was used', async () => {
    for (const order of [undefined, { ordered: false, skipped_ready_today: true }]) {
      const { c, sink } = makeCollector(fakeTransport(fakeMaccabi({ medicalFile: earlier }).routes));
      await keepListedMedicalFile(c, order);
      expect((sink as MemorySink).files.has('2026-10-14_medical-file.pdf')).toBe(true);
      expect((sink as MemorySink).problems).toEqual([]);
    }
  });
});
