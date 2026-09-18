import { errMessage, isControl, PACE_MS, type Collector } from '../collector';
import type { Ctx, Json } from '../types';
import { iso, safe, stem, titleOf } from '../util';

const INQUIRY_TITLE = ['subject', 'inquiry_subject', 'title', 'service_provider_name', 'practitioner_name', 'description'];
// The PHR grid's DocumentSystemName is a storage name, not a title, so it is not a candidate.
const UPLOAD_TITLE = ['DocumentName', 'DocumentTitle', 'DocumentDescription', 'CategoryName', 'Description'];

export async function doctorCommunications(c: Collector, _ctx: Ctx): Promise<void> {
  const q = await c.getSave('communication-with-doctor/list.json', 'GET', 'CommunicationWithDoctorAPI/v1/members/0/{mid}/inquiries');
  const list: Json[] = (q.r.data && q.r.data.inquiries) || [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    c.progress(i, list.length, 'doctor inquiries');
    const name = stem(iso(x.creation_date), safe(x.request_id), titleOf(x, INQUIRY_TITLE));
    await c.getSave('communication-with-doctor/details/' + name + '.json', 'GET',
      'CommunicationWithDoctorAPI/v1/members/0/{mid}/inquiries/' + x.request_id + '/details');
    const docs: Json[] = x.medical_forms_documents || [];
    for (let j = 0; j < docs.length; j++) {
      const f = docs[j];
      if (!f.result_file) continue;
      // One inquiry can carry several forms; the ordinal binds to the id, keeping three segments.
      await c.pdfIfMissing('communication-with-doctor/files/' +
        stem(iso(x.creation_date), safe(x.request_id) + '-' + (j + 1), titleOf(x, INQUIRY_TITLE)) + '.pdf',
        c.apiUrl('AppointmentOrderAPI/v1/members/0/{mid}/pdf') + '?path=' + encodeURIComponent(f.result_file) + '&timestamp=' + f.timestamp + '&hash=' + f.hash);
    }
  }
}

export async function savedDocuments(c: Collector, _ctx: Ctx): Promise<void> {
  const base = '/online/Ajax/PHR/WsPHRManager.asmx/';
  async function post(method: string, body: string): Promise<{ status: number; data: Json }> {
    const r = await c.legacy(base + method, 'POST', { 'Content-Type': 'application/json; charset=utf-8' }, body);
    const text = c.legacyText(r);
    await c.sleep(PACE_MS);
    return { status: r.status, data: JSON.parse(text) };
  }
  try {
    const s = await post('SearchByDate', "{'categoryId':'','dateFrom':'1/1/1900','dateTo':'1/1/2050'}");
    // The download handler wants the stored file name exactly as the grid's
    // PHR.OpenFile('<name>') passes it (DocumentSystemName plus extension).
    const { ids, openArgs } = await c.deps.html.phrGrid(s.data.d || '');
    for (let i = 0; i < ids.length; i++) {
      c.progress(i, ids.length, 'saved documents');
      const d = await post('GetFileDetails', JSON.stringify({ fileId: ids[i] }));
      const info: Json = (d.data.d || [])[0] || {};
      const arg = info.DocumentSystemName && openArgs.find((a) => a.indexOf(info.DocumentSystemName) === 0);
      if (arg) {
        const ext = (arg.match(/\.([A-Za-z0-9]+)$/) || [undefined, 'bin'])[1].toLowerCase();
        const rel = 'uploads/files/' + uploadName(info, ids[i]) + '.' + ext;
        if (!(await c.exists(rel))) {
          const f = await c.fetchBin('/online/Pages/Popups/PHR/PHRDownloadDocument.aspx?fileid=' + encodeURIComponent(arg), {});
          if (f.status === 200 && !/text\/html/.test(f.type) && f.bytes.length) await c.saveBin(rel, f.bytes);
          else await c.problem(rel, 'attachment download: HTTP ' + f.status + ' ' + f.type);
        }
      } else {
        await c.problem('uploads/details/' + uploadName(info, ids[i]) + '.json', 'no attachment link found in the documents grid');
      }
      await c.save('uploads/details/' + uploadName(info, ids[i]) + '.json', {
        endpoint: 'POST /online/Ajax/PHR/WsPHRManager.asmx/GetFileDetails',
        request_body: { fileId: ids[i] },
        fetched_at: new Date(c.now()).toISOString(),
        status: d.status,
        content_type: 'application/json',
        decoded_from: 'windows-1255',
        data: d.data,
      });
    }
  } catch (e) {
    if (isControl(e)) throw e;
    await c.problem('uploads', errMessage(e));
  }
}

function uploadName(info: Json, id: Json): string {
  return stem(iso(info.DocumentDate), safe(id), titleOf(info, UPLOAD_TITLE));
}

export async function emptySections(c: Collector, _ctx: Ctx): Promise<void> {
  const member = [{ member_id_code: '0', member_id: c.session.mid }];
  const checks: [string, string, string, Json, (d: Json) => unknown][] = [
    ['allergies-sensitivity/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/sensitivity', undefined, (d) => d && d.intolerance && d.intolerance.length],
    ['appointments/list.json', 'POST', 'AppointmentOrderAPI/v2/members/0/{mid}/appointments/future', { members: member, is_with_ascribed_doctor: false }, (d) => Array.isArray(d) && d.length],
    ['requests-approvals/list.json', 'POST', 'RequestsAndApprovalsAPI/v1/members/0/{mid}/requests_and_cases', { members: member }, (d) => (Array.isArray(d) ? d.length : d && Object.keys(d).length)],
  ];
  for (let i = 0; i < checks.length; i++) {
    const [rel, method, path, body, hasData] = checks[i];
    c.progress(i, checks.length, 'other sections');
    const r = await c.api(method, path, body);
    if (r.status === 200 && hasData(r.data)) await c.save(rel, c.rec(method, path, r));
  }
}
