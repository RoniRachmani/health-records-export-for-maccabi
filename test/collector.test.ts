import { describe, expect, it } from 'vitest';
import { canon, newCtx, sha256Hex, type HttpResponse } from '../src/core';
import { bytesResp, DICOM_ID, fakeMaccabi, fakeTransport, jsonResp, makeCollector, MemorySink, MID, PDF, pdfOf, PURCHASE_TABLE, runAll, win1255, type Route } from './fakes';

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

describe('fetchBin()', () => {
  const pdf = (): HttpResponse => ({ status: 200, redirected: false, contentType: 'application/pdf', bytes: PDF });

  it('retries a download that failed in passing, and ends the session if it keeps failing', async () => {
    const t = fakeTransport([() => pdf()]);
    const send = t.fetch;
    let n = 0;
    t.fetch = async (req) => { if (++n === 1) throw new Error('Failed to fetch'); return send(req); };
    const { c, clock } = makeCollector(t);
    expect(await c.fetchBin('/sonline/x.pdf')).toMatchObject({ status: 200, bytes: PDF });
    expect(clock.sleeps).toEqual([2500, 300]);

    let m = 0;
    t.fetch = async () => { m++; throw new Error('Failed to fetch'); };
    await expect(c.fetchBin('/sonline/x.pdf')).rejects.toMatchObject({ sessionEnded: true, message: /request failed \(Failed to fetch\)/ });
    expect(m).toBe(4);
  });

  it('retries 500/503, and gives back what is left', async () => {
    let n = 0;
    const { c, clock } = makeCollector(fakeTransport([() => (++n < 3 ? jsonResp({}, 500) : pdf())]));
    expect((await c.fetchBin('/sonline/x.pdf')).status).toBe(200);
    expect(clock.sleeps).toEqual([2500, 2500, 300]);
    n = -10;
    expect((await c.fetchBin('/sonline/x.pdf')).status).toBe(500);
  });

  it('ends the session on a 401 to the token, not to a link signed on its own', async () => {
    const { c } = makeCollector(fakeTransport([() => jsonResp({}, 401)]));
    await expect(c.fetchBin('/sonline/x.pdf')).rejects.toMatchObject({ sessionEnded: true, message: /HTTP 401/ });
    expect((await c.fetchBin('/sonline/x.pdf', {})).status).toBe(401);
  });

  it('waits out one 429, and stops the run if it is asked again', async () => {
    const tooMany: HttpResponse = { status: 429, redirected: false, contentType: 'text/plain', bytes: new Uint8Array(), retryAfter: '5' };
    let n = 0;
    const { c, clock } = makeCollector(fakeTransport([() => (++n === 1 ? tooMany : pdf())]));
    expect((await c.fetchBin('/sonline/x.pdf')).status).toBe(200);
    expect(clock.sleeps[0]).toBe(5000);
    const { c: c2 } = makeCollector(fakeTransport([() => tooMany]));
    await expect(c2.fetchBin('/sonline/x.pdf')).rejects.toMatchObject({ rateLimited: true });
  });

  it('keeps going through a step after one PDF download drops', async () => {
    const site = fakeMaccabi();
    const t = fakeTransport(site.routes);
    const send = t.fetch;
    let dropped = false;
    t.fetch = async (req) => {
      if (!dropped && req.url.includes('getprescriptionpdf')) {
        dropped = true;
        throw new Error('Failed to fetch');
      }
      return send(req);
    };
    const { c, sink } = makeCollector(t);
    const s = await runAll(c, newCtx(), ['medications']);
    expect(s.problems).toEqual([]);
    expect([...(sink as MemorySink).files.keys()].filter((k) => k.endsWith('.pdf'))).toHaveLength(2);
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
    expect([...mem.files.keys()].map((k) => k.replace(/_[0-9a-f]{8}(?=[_.-])/, '_<hash8>')).sort()).toEqual([
      // Kept though the fake has no sensitivities: an empty list is the site saying none are on record.
      'allergies-sensitivity/list.json',
      'approvals/files/2026-03-02_<hash8>_אישור-פיזותרפיה.pdf',
      'approvals/list.json',
      // Named by the kind of form it carries; that form is the referral's own file, saved there only.
      'communication-with-doctor/details/2026-04-02_Q1_הפניה.json',
      // Named by its question; its forms do not pair with the details' ones, so they keep the doctor's name.
      'communication-with-doctor/details/2026-04-05_Q2_שאלה-לרופא.json',
      'communication-with-doctor/files/2026-04-05_Q2-1_ד״ר-ישראלי.pdf',
      'communication-with-doctor/files/2026-04-05_Q2-2_ד״ר-ישראלי.pdf',
      'communication-with-doctor/list.json',
      'my-doctor/assigned-practitioners.json',
      'my-doctor/eligibilities.json',
      'hospital-stays/files/2025-05-10_<hash8>_מרכז-רפואי-לדוגמה.pdf',
      'hospital-stays/list.json',
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
      'test-results/details/2026-01-06_<hash8>-imaging-study.json',
      'test-results/files/2026-01-05_555-lab-result_ספירת-דם.pdf',
      'test-results/followed-counter.json',
      'test-results/history/HGB_המוגלובין.json',
      'test-results/latest-lab-results.json',
      'test-results/list.json',
      'uploads/details/2026-05-01_F1_סיכום-אשפוז.json',
      // The same document uploaded again, untitled: named by its file's name, and not saved twice.
      'uploads/details/2026-05-02_F2_סיכום.json',
      'uploads/files/2026-05-01_F1_סיכום-אשפוז.pdf',
      'vaccinations/details/7_שעלת-צפדת.json',
      'vaccinations/files/vaccination-booklet-report.pdf',
      'vaccinations/flu-eligibility.json',
      'vaccinations/list.json',
      'vaccinations/vaccination-booklet-report.json',
      // Older than the visit list reaches: found through the inquiry it answered.
      'visit-summaries/details/2024-06-01_7001_אורתופדיה.json',
      'visit-summaries/files/2024-06-01_7001_אורתופדיה.pdf',
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
    expect(mem.files.get('uploads/files/2026-05-01_F1_סיכום-אשפוז.pdf')).toEqual(pdfOf('upload'));
    // Hospital stays: every year asked for, not the page's three; saved exactly as sent, padding,
    // blank entries, the repeated stay and ResultMessage included.
    expect(site.calls).toContain('POST /online/webapi/MailingsFromHospitals/GetMailingsFromHospitals/');
    const stays = mem.json('hospital-stays/list.json');
    expect(stays.request_body).toEqual({ isDateSelected: true, fromDate: '01011900', toDate: '31122099' });
    expect(stays.data.ReportHospitalizations).toHaveLength(3);
    expect(stays.data.ReportHospitalizations[0]).toMatchObject({
      NameHospital: 'בית חולים לדוגמה   ',
      DescriptionTreatment: [{ Description: 'HOSPITALIZATION - PER DAY      ' }, { Description: '      ' }],
    });
    expect(stays.data.ResultMessage).toEqual({ Code: 0, Description: '' });
    expect(stays.cleaned).toBeUndefined();
    expect(stays.omitted).toBeUndefined();
    // The discharge letter is asked for as the page's Summary button opens it.
    expect(site.calls).toContain('GET /online/Pages/Popups/MailingsFromHospitals/MailingsFromHospitals.aspx?path=reports/L9.pdf&typeCommitment=2');
    expect(s.results).toEqual({ written: 47, same_as: 3 });

    // No two files hold the same bytes; each record points to where its documents went.
    const digests = await Promise.all([...mem.files].filter(([k]) => !k.endsWith('.json')).map(([, v]) => sha256Hex(v)));
    expect(new Set(digests).size).toBe(digests.length);
    const q1 = mem.json('communication-with-doctor/details/2026-04-02_Q1_הפניה.json');
    expect(q1.files).toEqual([{ same_as: 'referrals/files/2026-03-01_R1_הפניה-לרופא-עור.pdf', description: 'הפניה' }]);
    expect(mem.aliases.get('communication-with-doctor/files/2026-04-02_Q1-1_הפניה.pdf')).toBe('referrals/files/2026-03-01_R1_הפניה-לרופא-עור.pdf');
    expect(mem.json('uploads/details/2026-05-02_F2_סיכום.json').files).toEqual([{ same_as: 'uploads/files/2026-05-01_F1_סיכום-אשפוז.pdf' }]);
    expect(mem.json('uploads/details/2026-05-01_F1_סיכום-אשפוז.json').files).toEqual([{ file: 'uploads/files/2026-05-01_F1_סיכום-אשפוז.pdf' }]);

    // A linked visit the list no longer has is saved and linked both ways; one it has is pointed to, not saved again.
    expect(q1.visit).toBe('visit-summaries/details/2024-06-01_7001_אורתופדיה.json');
    const old = mem.json('visit-summaries/details/2024-06-01_7001_אורתופדיה.json');
    expect(old).toMatchObject({ endpoint: 'GET AppointmentOrderAPI/v1/members/0/{mid}/visits/7001/', linked_from: 'communication-with-doctor/details/2026-04-02_Q1_הפניה.json' });
    expect(old.files).toEqual([{ file: 'visit-summaries/files/2024-06-01_7001_אורתופדיה.pdf' }]);
    expect(site.calls).toContain('GET /sonline/AppointmentOrderAPI/webapi/mac/v1/members/0/' + MID + '/visits/7001/?isOpenMedicalRecordNumber=true');
    expect(mem.json('communication-with-doctor/details/2026-04-05_Q2_שאלה-לרופא.json').visit).toBe('visit-summaries/details/2026-02-01_A1_קרדיולוגיה.json');

    // An imaging study is named by a hash of its DICOM id, which its record keeps.
    const study = [...mem.files.keys()].find((k) => k.endsWith('-imaging-study.json'))!;
    expect(study.split('/').pop()).toHaveLength(38);
    expect(mem.json(study).request_id).toBe(DICOM_ID);
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

  it('asks again for no document it found elsewhere in the export', async () => {
    const sink = new MemorySink();
    await runAll(makeCollector(fakeTransport(fakeMaccabi().routes), sink).c, newCtx());
    const site = fakeMaccabi();
    await runAll(makeCollector(fakeTransport(site.routes), sink).c, newCtx(), ['doctorCommunications', 'savedDocuments']);
    // The form that is the referral, and the linked visit that is a listed one, are not downloaded again.
    expect(site.calls.filter((u) => /\/pdf\?|PHRDownload/.test(u))).toEqual([]);
    expect(site.calls.filter((u) => u.includes('isOpenMedicalRecordNumber'))).toHaveLength(2);
  });

  it('keeps an inquiry whose linked visit has no summary, and says so', async () => {
    const site = fakeMaccabi();
    const t = fakeTransport([(_req, url) => (url.pathname.endsWith('/visits/7001/') ? jsonResp(undefined, 204) : undefined), ...site.routes]);
    const { c, sink } = makeCollector(t);
    const s = await runAll(c, newCtx(), ['doctorCommunications']);
    expect(s.problems).toEqual(['communication-with-doctor/details/2026-04-02_Q1_הפניה.json PROBLEM: linked visit: HTTP 204']);
    const mem = sink as MemorySink;
    expect(mem.json('communication-with-doctor/details/2026-04-02_Q1_הפניה.json').visit).toBeUndefined();
    expect([...mem.files.keys()].some((k) => k.includes('_7001_'))).toBe(false);
  });

  it('names an inquiry by what it is about, and its forms by their kind', async () => {
    const site = fakeMaccabi();
    const details: Route = (_req, url) => (url.pathname.endsWith('/inquiries/Q2/details')
      ? jsonResp({ request_subjects: [{ name: 'חידוש מרשם' }, { name: 'שאלה' }], general_question_subject: 'לא זה',
        medical_forms_details: [{ document_description: 'הוראות לתרופות', link_pdf: 'l' }, { document_description: 'אישור', link_pdf: 'l' }] })
      : undefined);
    const { c, sink } = makeCollector(fakeTransport([details, ...site.routes]));
    await runAll(c, newCtx(), ['doctorCommunications']);
    const mem = sink as MemorySink;
    expect([...mem.files.keys()].filter((k) => k.includes('_Q2')).sort()).toEqual([
      'communication-with-doctor/details/2026-04-05_Q2_חידוש-מרשם-שאלה.json',
      'communication-with-doctor/files/2026-04-05_Q2-1_הוראות-לתרופות.pdf',
      'communication-with-doctor/files/2026-04-05_Q2-2_אישור.pdf',
    ]);
    expect(mem.json('communication-with-doctor/details/2026-04-05_Q2_חידוש-מרשם-שאלה.json').files[1]).toEqual({
      file: 'communication-with-doctor/files/2026-04-05_Q2-2_אישור.pdf', description: 'אישור',
    });
  });

  // general_question_subject can be the opening of the member's own message, so the forms say it better.
  it('names an inquiry by its forms before its question', async () => {
    const site = fakeMaccabi();
    const details: Route = (_req, url) => (url.pathname.endsWith('/inquiries/Q2/details')
      ? jsonResp({ general_question_subject: 'שלום, תוכלי בבקשה להוסיף', medical_forms_details: [{ document_description: 'הפניה', link_pdf: 'l' }] })
      : undefined);
    const { c, sink } = makeCollector(fakeTransport([details, ...site.routes]));
    await runAll(c, newCtx(), ['doctorCommunications']);
    expect((sink as MemorySink).files.has('communication-with-doctor/details/2026-04-05_Q2_הפניה.json')).toBe(true);
  });

  it('reports hospital stays answered with a web page as a problem, and writes nothing', async () => {
    const site = fakeMaccabi();
    const logout: HttpResponse = { status: 200, redirected: false, contentType: 'text/html; charset=utf-8', bytes: new TextEncoder().encode('<html>logged out</html>') };
    const t = fakeTransport([(_req, url) => (url.pathname.includes('MailingsFromHospitals') ? logout : undefined), ...site.routes]);
    const { c, sink } = makeCollector(t);
    const s = await runAll(c, newCtx(), ['hospitalStays']);
    expect(s.problems).toEqual([expect.stringMatching(/^hospital-stays\/list\.json PROBLEM: HTTP 200 text\/html.*logged out\?/)]);
    expect([...(sink as MemorySink).files.keys()]).toEqual([]);
  });

  it('decodes the saved-documents service as the windows-1255 it declares, and records that', async () => {
    const { c, sink } = makeCollector(fakeTransport(fakeMaccabi().routes));
    const s = await runAll(c, newCtx(), ['savedDocuments']);
    expect(s.problems).toEqual([]);
    const details = (sink as MemorySink).json('uploads/details/2026-05-01_F1_סיכום-אשפוז.json');
    expect(details.decoded_from).toBe('windows-1255');
    expect(details.data.d[0].DocumentTitle).toBe('סיכום אשפוז');
  });

  it('falls back to windows-1255 for the saved-documents service when the header names no charset', async () => {
    const site = fakeMaccabi();
    const bare: Route = (req, url) => {
      if (!url.pathname.includes('WsPHRManager')) return undefined;
      const r = site.routes.map((route) => route(req, url)).find(Boolean)!;
      return { ...r, contentType: 'application/json' };
    };
    const { c, sink } = makeCollector(fakeTransport([bare, ...site.routes]));
    const s = await runAll(c, newCtx(), ['savedDocuments']);
    expect(s.problems).toEqual([]);
    expect((sink as MemorySink).json('uploads/details/2026-05-01_F1_סיכום-אשפוז.json').data.d[0].DocumentTitle).toBe('סיכום אשפוז');
  });

  it('reports hospital stays in a charset other than the one declared, instead of saving replacement characters', async () => {
    const site = fakeMaccabi();
    const mislabelled = bytesResp(win1255(JSON.stringify({ ReportHospitalizations: [{ NameHospital: 'בית חולים' }], ResultMessage: { Code: 0 } })), 'application/json; charset=utf-8');
    const t = fakeTransport([(_req, url) => (url.pathname.includes('GetMailingsFromHospitals') ? mislabelled : undefined), ...site.routes]);
    const { c, sink } = makeCollector(t);
    const s = await runAll(c, newCtx(), ['hospitalStays']);
    expect(s.problems).toEqual([expect.stringMatching(/^hospital-stays\/list\.json PROBLEM: response is not valid utf-8 \(application\/json; charset=utf-8\)/)]);
    expect([...(sink as MemorySink).files.keys()]).toEqual([]);
  });

  it('reports a discharge letter that is not a PDF, and keeps the stays', async () => {
    const site = fakeMaccabi();
    const page: HttpResponse = { status: 200, redirected: false, contentType: 'text/html; charset=utf-8', bytes: new TextEncoder().encode('<html>error</html>') };
    const t = fakeTransport([(_req, url) => (url.pathname.endsWith('MailingsFromHospitals.aspx') ? page : undefined), ...site.routes]);
    const { c, sink } = makeCollector(t);
    const s = await runAll(c, newCtx(), ['hospitalStays']);
    expect(s.problems).toEqual([expect.stringMatching(/^hospital-stays\/files\/2025-05-10_[0-9a-f]{8}_מרכז-רפואי-לדוגמה\.pdf PROBLEM: PDF download: HTTP 200 text\/html/)]);
    expect([...(sink as MemorySink).files.keys()]).toEqual(['hospital-stays/list.json']);
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
  });

  // An ended session answers a legacy request with a followed redirect to the gateway's logout page:
  // a 200 web page, which the step would otherwise file as a bad response and carry on past.
  for (const step of ['hospitalStays', 'savedDocuments', 'purchases'] as const) {
    it(`stops ${step} at SESSION ENDED when a legacy request lands on the logout page`, async () => {
      const site = fakeMaccabi();
      const logout: HttpResponse = {
        status: 200, redirected: false, contentType: 'text/html; charset=utf-8', url: 'https://online.maccabi4u.co.il/my.logout.php3',
        bytes: new TextEncoder().encode('<html>logged out</html>'),
      };
      const t = fakeTransport([(_req, url) => (url.pathname.startsWith('/online/') ? logout : undefined), ...site.routes]);
      const { c, sink } = makeCollector(t);
      const s = await runAll(c, newCtx(), [step]);
      expect(s.stoppedAt).toBe(step);
      expect(s.problems).toEqual([expect.stringMatching(new RegExp('^' + step + ' PROBLEM: SESSION ENDED: redirected to online\\.maccabi4u\\.co\\.il/my\\.logout\\.php3'))]);
      expect([...(sink as MemorySink).files.keys()]).toEqual([]);
    });
  }
});
