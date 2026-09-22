import { describe, expect, it } from 'vitest';
import { canon, newCtx, STEP_ORDER, type HttpResponse } from '../src/core';
import { fakeMaccabi, fakeTransport, jsonResp, makeCollector, MemorySink, MID, PDF, PURCHASE_TABLE, runAll } from './fakes';

describe('api()', () => {
  it('stops with SESSION ENDED on a redirect or 401', async () => {
    const redirect: HttpResponse = { status: 0, redirected: true, contentType: '', bytes: new Uint8Array() };
    const { c } = makeCollector(fakeTransport([() => redirect]));
    await expect(c.api('GET', 'MainAppAPI/v1/members/0/{mid}')).rejects.toMatchObject({ sessionEnded: true, message: /redirect to login/ });
    const { c: c2 } = makeCollector(fakeTransport([() => jsonResp({}, 401)]));
    await expect(c2.api('GET', 'X/v1')).rejects.toMatchObject({ sessionEnded: true, message: /HTTP 401/ });
  });

  it('waits as long as a 429 asks, then stops the run if it keeps asking', async () => {
    const tooMany = (retryAfter?: string): HttpResponse => ({ status: 429, redirected: false, contentType: 'text/plain', bytes: new Uint8Array(), retryAfter });
    // Honoured once: wait the 5 s it asks for, then the retry succeeds.
    let n = 0;
    const { c, clock } = makeCollector(fakeTransport([() => (++n === 1 ? tooMany('5') : jsonResp({ ok: true }))]));
    expect(await c.api('GET', 'X/v1')).toMatchObject({ status: 200, data: { ok: true } });
    expect(clock.sleeps[0]).toBe(5000);

    // Still 429 after the retries: the run stops instead of knocking again.
    const { c: c2, clock: clock2 } = makeCollector(fakeTransport([() => tooMany()]));
    await expect(c2.api('GET', 'X/v1')).rejects.toMatchObject({ rateLimited: true, message: /RATE LIMITED/ });
    expect(clock2.sleeps.filter((s) => s === 30_000)).toHaveLength(3); // the default wait, no Retry-After

    // A wait longer than the run sits through stops it at once, without sleeping.
    const { c: c3, clock: clock3 } = makeCollector(fakeTransport([() => tooMany('3600')]));
    await expect(c3.api('GET', 'X/v1')).rejects.toMatchObject({ rateLimited: true, message: /pause of 3600 s/ });
    expect(clock3.sleeps).toEqual([]);
  });

  it('stops with SESSION ENDED after a network error persists, or without a token', async () => {
    const t = fakeTransport([]);
    let n = 0;
    t.fetch = async () => { n++; throw new Error('Failed to fetch'); };
    const { c, clock } = makeCollector(t);
    await expect(c.api('GET', 'X/v1')).rejects.toMatchObject({ sessionEnded: true, message: /request failed \(Failed to fetch\)/ });
    expect(n).toBe(4);
    expect(clock.sleeps).toEqual([2500, 2500, 2500]);
    c.session.jwt = null;
    await expect(c.api('GET', 'X/v1')).rejects.toMatchObject({ sessionEnded: true });
  });

  it('retries a request that failed in passing', async () => {
    const t = fakeTransport([() => jsonResp({ ok: 1 })]);
    const send = t.fetch;
    let n = 0;
    t.fetch = async (req) => { if (++n === 1) throw new Error('Failed to fetch'); return send(req); };
    const { c } = makeCollector(t);
    expect(await c.api('GET', 'X/v1')).toEqual({ status: 200, data: { ok: 1 } });
  });

  it('retries 500/503 three times, 2.5 s apart, and paces 300 ms', async () => {
    let n = 0;
    const { c, clock } = makeCollector(fakeTransport([() => (++n < 3 ? jsonResp({}, 503) : jsonResp({ ok: 1 }))]));
    expect(await c.api('GET', 'X/v1')).toEqual({ status: 200, data: { ok: 1 } });
    expect(clock.sleeps).toEqual([2500, 2500, 300]);
    n = -10;
    expect((await c.api('GET', 'X/v1')).status).toBe(503);
  });

  it('builds /sonline/ URLs and sends the Bearer token', async () => {
    const seen: string[] = [];
    const { c } = makeCollector(fakeTransport([(req) => { seen.push(req.url + ' ' + req.headers?.Authorization?.slice(0, 7) + ' ' + req.redirect); return jsonResp('x'); }]));
    await c.api('GET', 'MedicalFileAPI/v1/members/0/{mid}/sensitivity');
    expect(seen).toEqual(['/sonline/MedicalFileAPI/webapi/mac/v1/members/0/' + MID + '/sensitivity Bearer  manual']);
  });

  it('can be cancelled between requests', async () => {
    let stop = false;
    const { c } = makeCollector(fakeTransport([() => jsonResp({})]), undefined, undefined, { shouldStop: () => stop });
    await c.api('GET', 'X/v1');
    stop = true;
    await expect(c.api('GET', 'X/v1')).rejects.toMatchObject({ cancelled: true });
  });
});

describe('full run against the fake site', () => {
  it('writes today\'s layout with the right URL encodings', async () => {
    const site = fakeMaccabi();
    const { c, sink } = makeCollector(fakeTransport(site.routes));
    const s = await runAll(c, newCtx());
    const mem = sink as MemorySink;
    expect(mem.problems).toEqual([]);
    // <section>/list.json, then details/ and files/ sharing one <date>_<id>_<title> stem.
    expect([...mem.files.keys()].map((k) => k.replace(/_[0-9a-f]{8}(?=[_.])/, '_<hash8>')).sort()).toEqual([
      'approvals/files/2026-03-02_<hash8>_אישור-פיזותרפיה.pdf',
      'approvals/list.json',
      'communication-with-doctor/details/2026-04-02_Q1_ד-ר-ישראלי.json',
      'communication-with-doctor/files/2026-04-02_Q1-1_ד-ר-ישראלי.pdf',
      'communication-with-doctor/list.json',
      'my-doctor/assigned-practitioners.json',
      'my-doctor/eligibilities.json',
      'info-pages/list.json',
      'letters/files/2026-04-01_L1_מכתב-שיחרור.pdf',
      'letters/list.json',
      'medications-and-prescriptions/files/2026-03-01_P-1_אקמול-500.pdf',
      'medications-and-prescriptions/files/2026-03-02_<hash8>_נורופן.pdf',
      'medications-and-prescriptions/files/purchased-report.pdf',
      'medications-and-prescriptions/list.json',
      'medications-and-prescriptions/purchased-history.html',
      'medications-and-prescriptions/purchased-report.json',
      'profile/entitlement.json',
      'profile/insurance-seniority.json',
      'profile/member.json',
      'profile/providers.json',
      'referrals/files/2026-03-01_R1_הפניה-לרופא-עור.pdf',
      'referrals/list.json',
      'test-results/details/2026-01-05_555-lab-result_ספירת-דם.json',
      'test-results/details/2026-01-06_9-imaging-study.json',
      'test-results/files/2026-01-05_555-lab-result_ספירת-דם.pdf',
      'test-results/followed-counter.json',
      'test-results/history/HGB_המוגלובין.json',
      'test-results/latest-lab-results.json',
      'test-results/list.json',
      'uploads/details/2026-05-01_F1_סיכום-אשפוז.json',
      'uploads/files/2026-05-01_F1_סיכום-אשפוז.pdf',
      'vaccinations/details/7_שעלת-צפדת.json',
      'vaccinations/files/vaccination-booklet-report.pdf',
      'vaccinations/flu-eligibility.json',
      'vaccinations/list.json',
      'vaccinations/vaccination-booklet-report.json',
      'visit-summaries/details/2026-02-01_A1_קרדיולוגיה.json',
      'visit-summaries/files/2026-02-01_A1_קרדיולוגיה.pdf',
      'visit-summaries/list.json',
    ].sort());

    // The member id is in no file name, even where the site builds it into a record's own fields.
    for (const rel of mem.files.keys()) expect(rel).not.toContain(MID);

    // The member id stays a placeholder in stored endpoints and request bodies (response data is kept as sent).
    for (const [rel] of mem.files) {
      if (!rel.endsWith('.json')) continue;
      const r = mem.json(rel);
      expect(JSON.stringify([r.endpoint, r.request_body ?? null])).not.toContain(MID);
    }
    expect(mem.json('visit-summaries/list.json').request_body.members[0].member_id).toBe('{mid}');

    // Encodings: test PDF doc_id encoded + hash verbatim; visit path encoded; referral pdf_link verbatim; history date encoded.
    expect(site.calls).toContain('GET /sonline/TestResultsAPI/webapi/mac/pdf/openfile?memberidcode=0&memberid=' + MID + '&data=D%2F1%20x&t=T1&hash=h%2B1&memberIdForHeader=' + MID + '&memberIdCodeForHeader=0');
    expect(site.calls).toContain('GET /sonline/AppointmentOrderAPI/webapi/mac/v1/members/0/' + MID + '/pdf?path=dir%2Fa%20b.pdf&timestamp=TS&hash=HH');
    expect(site.calls).toContain('GET /sonline/MedicalFileAPI/webapi/mac/v1/members/0/' + MID + '/pdf?path=r%2F1.pdf&timestamp=t&hash=h');
    expect(site.calls).toContain('GET /sonline/TestResultsAPI/webapi/mac/v1/compare/0/' + MID + '/compare?test_id=HGB&date_of_result=2026-01-05');
    expect(site.calls).toContain('GET /sonline/MedicalFileAPI/webapi/mac/v1/members/0/' + MID + '/vaccinations?vaccine_group_code=7&birth_date=1980-01-02T00:00:00');
    // No imaging-study PDF.
    expect(site.calls.some((u) => u.includes('data=D9'))).toBe(false);

    // Purchase table bytes are kept exactly (windows-1255, not re-encoded).
    expect(mem.files.get('medications-and-prescriptions/purchased-history.html')).toEqual(PURCHASE_TABLE);
    // Report JSON without base64 -- said by the record, not by its extension; PDF decoded.
    expect(mem.json('medications-and-prescriptions/purchased-report.json').data).toEqual({ type: 'pdf' });
    expect(mem.json('medications-and-prescriptions/purchased-report.json').omitted).toEqual(['data.base64']);
    expect(new TextDecoder().decode(mem.files.get('medications-and-prescriptions/files/purchased-report.pdf'))).toBe('%PDF-1.4 report');
    expect(mem.files.get('uploads/files/2026-05-01_F1_סיכום-אשפוז.pdf')).toEqual(PDF);
    expect(s.results).toEqual({ written: 39 });
  });

  it('a second run into the same files changes nothing and skips unchanged work', async () => {
    const sink = new MemorySink();
    const site1 = fakeMaccabi();
    await runAll(makeCollector(fakeTransport(site1.routes), sink).c, newCtx());
    const before = new Map([...sink.files].map(([k, v]) => [k, canon(k.endsWith('.json') ? JSON.parse(new TextDecoder().decode(v)) : Array.from(v))]));

    const site2 = fakeMaccabi();
    const s = await runAll(makeCollector(fakeTransport(site2.routes), sink).c, newCtx());
    // Existing PDFs are skipped before any request, so only 'unchanged' is logged (as in the original collector).
    expect(Object.keys(s.results)).toEqual(['unchanged']);
    for (const [k, v] of sink.files) expect(canon(k.endsWith('.json') ? JSON.parse(new TextDecoder().decode(v)) : Array.from(v))).toBe(before.get(k));
    // Existing PDFs and unchanged histories/reports are not fetched again.
    expect(site2.calls.filter((u) => /pdf|compare\?|report/.test(u))).toEqual([]);
  });

  it('runs only the named steps and stops at SESSION ENDED', async () => {
    const site = fakeMaccabi();
    let n = 0;
    const redirect: HttpResponse = { status: 0, redirected: true, contentType: '', bytes: new Uint8Array() };
    const t = fakeTransport([(req, url) => (url.pathname.includes('/visits/') && ++n > 0 ? redirect : undefined), ...site.routes]);
    const { c, sink } = makeCollector(t);
    const s = await runAll(c, newCtx(), ['visits', 'letters']);
    expect(s.stoppedAt).toBe('visits');
    expect(s.problems[0]).toMatch(/^visits PROBLEM: SESSION ENDED/);
    expect([...(sink as MemorySink).files.keys()]).toEqual([]);
    expect(STEP_ORDER).toHaveLength(13);
  });
});
