import { changed, errMessage, isControl, PACE_MS, type Collector } from '../collector';
import type { Ctx, Json } from '../types';
import { b64bytes, charset, END_DATE, iso, safe, shortHash, stem, title, titleOf } from '../util';

const DRUG_TITLE = ['drug_name', 'medicine_name', 'drug_description', 'description', 'trade_name', 'title'];

export async function medications(c: Collector, _ctx: Ctx): Promise<void> {
  const body = { members: [{ member_id_code: '0', member_id: c.session.mid }] };
  const r = await c.api('POST', 'MedicalFileAPI/v1/members/0/{mid}/prescriptions', body);
  if (r.status !== 200) await c.problem('medications-and-prescriptions/list.json', 'HTTP ' + r.status);
  else await c.save('medications-and-prescriptions/list.json', c.rec('POST', 'MedicalFileAPI/v1/members/0/{mid}/prescriptions', r, { request_body: { members: [{ member_id_code: '0', member_id: '{mid}' }] } }));
  const items: Json[] = (r.data && r.data.results) || [];
  // A prescription's PDF is its visit's page: every drug prescribed at that visit, with each monthly
  // part's dates ("דף זה אינו מרשם", this page is not a prescription). Every entry of one visit
  // (clicks_visit_number) returned the same bytes: 31 entries, 8 visits (measured 2026-09-30). So a
  // visit's PDF is fetched once, from its first entry, and named by the visit and its drugs. An
  // entry with no visit number keeps a file of its own, named by the prescription.
  const visits: Json[][] = [];
  const byVisit: Record<string, Json[]> = {};
  for (const p of items) {
    if (!p.file_link) continue;
    const v = p.clicks_visit_number ? String(p.clicks_visit_number) : '';
    if (v && byVisit[v]) byVisit[v].push(p);
    else {
      visits.push([p]);
      if (v) byVisit[v] = visits[visits.length - 1];
    }
  }
  for (let i = 0; i < visits.length; i++) {
    const entries = visits[i];
    const p = entries[0];
    c.progress(i, visits.length, 'prescriptions', { done: i, total: visits.length });
    // doc_id carries the member's ID number, so it is used only hashed.
    const id = p.clicks_visit_number ? safe(p.clicks_visit_number) : p.prescription_number ? safe(p.prescription_number) : await shortHash([p.doc_id]);
    const date = entries.map((x) => iso(x.from_date)).sort()[0];
    await c.pdfIfMissing('medications-and-prescriptions/files/' + stem(date, id, drugsTitle(entries)) + '.pdf',
      c.apiUrl('MedicalFileAPI/v1/members/0/{mid}/getprescriptionpdf') + '?timestamp=' + p.timestamp + '&hash=' + p.hash +
      '&data=' + encodeURIComponent(p.doc_id) + '&path=' + encodeURIComponent(p.file_link));
  }
}

/** A visit's drugs as a title: one drug by its whole name, several by the first word of each ("XATRAL-SIMVASTATIN"). */
export function drugsTitle(entries: Json[]): string {
  const names: string[] = [];
  for (const x of entries) {
    const t = titleOf(x, DRUG_TITLE);
    if (t && !names.includes(t)) names.push(t);
  }
  if (names.length < 2) return names[0] || '';
  const words: string[] = [];
  for (const n of names) {
    const w = n.split('-')[0];
    if (!words.includes(w)) words.push(w);
  }
  return title(words.join(' '));
}

// Legacy /online/ services need a legacy page to have been opened in this
// session; otherwise they return empty. Any of them registers the session: the
// extension opens /online/medicalfile/summary/, which the order step needs anyway.
export async function purchases(c: Collector, _ctx: Ctx): Promise<void> {
  // Purchase history exists only as a legacy HTML table. It is kept as the
  // server sent it: the table from GetAllPurchasedPrescription's {d: ...},
  // byte for byte in its original windows-1255 encoding.
  const params = { StartDate: '1900-01-01', EndDate: END_DATE, IsByDoctor: 'false', ControlPath: 'DrugsManager/WcPurchasedDrugs', controller: 'userControlFactory', action: 'getControl' };
  const REL = 'medications-and-prescriptions/purchased-history.html';
  let purchasesChanged = false;
  try {
    c.progress(0, 3, 'purchase history');
    const hr = await c.legacy('/online/handlers/ajax.ashx', 'POST',
      { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      new URLSearchParams(params).toString());
    // ajax.ashx sets the date range in the session and returns only page 1
    // (8 rows); the page's "show all" link fetches every row in one call.
    const all = await c.legacy('/online/Ajax/DrugsManager/WsPurchasedDrugsManager.asmx/GetAllPurchasedPrescription', 'POST',
      { 'Content-Type': 'application/json; charset=utf-8' }, '{}');
    const raw = all.bytes;
    await c.sleep(PACE_MS);
    // Unwrap {d: "..."} without re-encoding: read each byte as one char, let
    // JSON.parse undo the JSON escapes, then write the chars back as bytes. The
    // Hebrew arrives as raw windows-1255 bytes, not \u escapes (measured 2026-09-27),
    // so each survives as one char in 0x80-0xFF.
    let d = '';
    try {
      d = JSON.parse(Array.from(raw, (b) => String.fromCharCode(b)).join('')).d || '';
    } catch {
      /* not JSON: reported below as an unexpected table */
    }
    const bytes = new Uint8Array(d.length);
    let wide = false;
    for (let i = 0; i < d.length; i++) {
      const code = d.charCodeAt(i);
      if (code > 255) wide = true;
      bytes[i] = code;
    }
    // Sanity check only (nothing parsed is saved): 7 columns.
    const cs = charset(all.contentType, 'windows-1255');
    const { cols } = await c.deps.html.purchaseTable(new TextDecoder(cs).decode(bytes));
    if (hr.status !== 200 || all.status !== 200 || wide || cols !== 7) {
      await c.problem(REL, 'unexpected purchase table (HTTP ' + hr.status + '/' + all.status + ', ' + cols + ' columns' + (wide ? ', non-byte escape' : '') + ') -- open a legacy /online/ page and run the purchases step');
    } else {
      purchasesChanged = changed(await c.saveBin(REL, bytes, true));
    }
  } catch (e) {
    if (isControl(e)) throw e;
    await c.problem(REL, errMessage(e));
  }

  // Last-2-years purchase report. Regenerated bytes differ on every call, so
  // it is refreshed only when missing or when purchases changed.
  c.progress(2, 3, 'purchase report');
  if (purchasesChanged || !(await c.exists('medications-and-prescriptions/purchased-report.json'))) {
    await reportPdf(c, 'medications-and-prescriptions/purchased-report.json', 'MedicalFileAPI/v1/members/0/{mid}/prescriptions/purchased/report', 'medications-and-prescriptions/files/purchased-report.pdf');
  }
}

// Report endpoints return {type:'pdf', base64}. The PDF goes to files/; the JSON is kept
// without the base64 field, which the record's own `omitted` says rather than its extension.
export async function reportPdf(c: Collector, rel: string, path: string, pdfRel: string): Promise<void> {
  const r = await c.api('GET', path);
  if (r.status !== 200 || !r.data) {
    await c.problem(rel, 'HTTP ' + r.status);
    return;
  }
  const b64 = r.data.base64;
  const data = Object.assign({}, r.data);
  delete data.base64;
  await c.save(rel, c.rec('GET', path, { status: r.status, data }, b64 ? { omitted: ['data.base64'] } : undefined));
  if (b64) await c.saveBin(pdfRel, b64bytes(b64), true);
  else await c.problem(pdfRel, 'report had no base64 PDF');
}
