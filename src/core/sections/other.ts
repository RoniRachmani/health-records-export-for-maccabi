import { errMessage, isControl, PACE_MS, type Collector } from '../collector';
import type { Ctx, DocRef, Json } from '../types';
import { iso, safe, shortHash, stem, title, titleOf } from '../util';
import { VISIT_TITLE, visitPdfUrl } from './visits';

// The list names no subject, only the doctor: the last resort, after what the details say.
const INQUIRY_TITLE = ['service_provider_name', 'practitioner_name'];
// The PHR grid's DocumentSystemName is a storage name, not a title, so it is not a candidate.
// DocumentOriginName, the name of the file the member uploaded, comes after these (see uploadName).
const UPLOAD_TITLE = ['DocumentTitle', 'DocumentDescription', 'Description'];

export async function doctorCommunications(c: Collector, _ctx: Ctx): Promise<void> {
  const q = await c.getSave('communication-with-doctor/list.json', 'GET', 'CommunicationWithDoctorAPI/v1/members/0/{mid}/inquiries');
  const list: Json[] = (q.r.data && q.r.data.inquiries) || [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    c.progress(i, list.length, 'doctor inquiries');
    const date = iso(x.creation_date);
    const byDoctor = titleOf(x, INQUIRY_TITLE);
    // The name comes from the details, so they are asked for first and saved last, once they can
    // point to the forms and the visit that are saved beside them.
    const path = 'CommunicationWithDoctorAPI/v1/members/0/{mid}/inquiries/' + x.request_id + '/details';
    const d = await c.fetchRec('communication-with-doctor/details/' + stem(date, safe(x.request_id), byDoctor) + '.json', 'GET', path);
    const details: Json = d.ok ? d.r.data : null;
    const rel = 'communication-with-doctor/details/' + stem(date, safe(x.request_id), inquiryTitle(details) || byDoctor) + '.json';

    const docs: Json[] = x.medical_forms_documents || [];
    const names = formNames(docs, details, byDoctor);
    const files: Json[] = [];
    for (let j = 0; j < docs.length; j++) {
      const f = docs[j];
      if (!f.result_file) continue;
      // One inquiry can carry several forms; the ordinal binds to the id, keeping three segments.
      // A form is often the very file of a referral or a prescription saved earlier: it is then kept once, there.
      const ref = await c.pdfOnce('communication-with-doctor/files/' + stem(date, safe(x.request_id) + '-' + (j + 1), names[j].title) + '.pdf',
        c.apiUrl('AppointmentOrderAPI/v1/members/0/{mid}/pdf') + '?path=' + encodeURIComponent(f.result_file) + '&timestamp=' + f.timestamp + '&hash=' + f.hash);
      if (ref) files.push(names[j].description ? { ...ref, description: names[j].description } : ref);
    }

    const visit = details && details.open_medical_record_number ? await linkedVisit(c, details.open_medical_record_number, rel) : null;
    if (!d.ok) continue;
    const extra: Record<string, Json> = {};
    if (files.length) extra.files = files;
    if (visit) extra.visit = visit;
    await c.saveRec(rel, 'GET', path, d.r, undefined, extra);
  }
}

/**
 * What an inquiry is about: the subjects the member picked, the kinds of form the doctor sent back, or
 * the question's own subject -- last, because it can be the opening of the member's message rather
 * than a subject (seen 2026-09-28). '' when the details name none of them, and the doctor names it.
 */
function inquiryTitle(details: Json): string {
  if (!details) return '';
  const subjects: Json[] = (details.request_subjects || []).map((s: Json) => s && s.name).filter((n: Json) => typeof n === 'string' && n.trim());
  const kinds: string[] = [];
  for (const f of details.medical_forms_details || []) {
    const k = typeof f.document_description === 'string' ? f.document_description.trim() : '';
    if (k && !kinds.includes(k)) kinds.push(k);
  }
  return title(subjects.join('-')) || title(kinds.join('-')) || title(details.general_question_subject);
}

/**
 * Each listed form's title: the kind of document it is (הפניה, אישור, ...). That is in the details'
 * medical_forms_details, but the file is the list's medical_forms_documents, and the two share no key.
 * The details' forms with a PDF have always matched the list's documents in number (14 inquiries,
 * 2026-09-27), so they are paired by position; when the counts differ, the forms keep the doctor's name.
 */
function formNames(docs: Json[], details: Json, fallback: string): { title: string; description?: string }[] {
  const forms: Json[] = ((details && details.medical_forms_details) || []).filter((f: Json) => f && f.link_pdf);
  return docs.map((_, j) => {
    const description = forms.length === docs.length ? forms[j].document_description : undefined;
    const t = title(description);
    return t ? { title: t, description } : { title: fallback };
  });
}

/**
 * The visit a doctor's reply belongs to, when the inquiry was answered as one: readable by its
 * open_medical_record_number even after it has left the 12-month visit list. Its summary is compared
 * with the files already saved, so a visit the visits step has is not saved twice. The path of the
 * visit's record, or null when there is none to point to.
 */
async function linkedVisit(c: Collector, number: Json, from: string): Promise<string | null> {
  const path = 'AppointmentOrderAPI/v1/members/0/{mid}/visits/' + encodeURIComponent(number) + '/?isOpenMedicalRecordNumber=true';
  const r = await c.api('GET', path);
  const v: Json = r.data;
  if (r.status !== 200 || !v || typeof v !== 'object') {
    await c.problem(from, 'linked visit: HTTP ' + r.status + (r.status === 200 ? ', no visit in it' : ''));
    return null;
  }
  const name = stem(iso(v.visit_summary_date), safe(number), titleOf(v, VISIT_TITLE));
  let ref: DocRef | null = null;
  if (v.visit_summary_pdf_link) {
    ref = await c.pdfOnce('visit-summaries/files/' + name + '.pdf', visitPdfUrl(c, v), {});
    // Its summary is one the visits step saved: the visit is listed, and its record is already there.
    if (ref && 'same_as' in ref && /^visit-summaries\/files\/[^/]+\.pdf$/.test(ref.same_as)) {
      return ref.same_as.replace('/files/', '/details/').replace(/\.pdf$/, '.json');
    }
  }
  const rel = 'visit-summaries/details/' + name + '.json';
  await c.saveRec(rel, 'GET', path, r, undefined, ref ? { linked_from: from, files: [ref] } : { linked_from: from });
  return rel;
}

export async function savedDocuments(c: Collector, _ctx: Ctx): Promise<void> {
  const base = '/online/Ajax/PHR/WsPHRManager.asmx/';
  async function post(method: string, body: string): Promise<{ status: number; charset: string; data: Json }> {
    const r = await c.legacy(base + method, 'POST', { 'Content-Type': 'application/json; charset=utf-8' }, body);
    await c.sleep(PACE_MS);
    const { text, charset } = c.legacyText(r, 'windows-1255');
    return { status: r.status, charset, data: JSON.parse(text) };
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
      const files: DocRef[] = [];
      if (arg) {
        const ext = (arg.match(/\.([A-Za-z0-9]+)$/) || [undefined, 'bin'])[1].toLowerCase();
        const rel = 'uploads/files/' + uploadName(info, ids[i]) + '.' + ext;
        // An upload can be the same file as one uploaded before, or as one saved from elsewhere: it is kept once.
        let ref = await c.docAlready(rel);
        if (!ref) {
          const f = await c.fetchBin('/online/Pages/Popups/PHR/PHRDownloadDocument.aspx?fileid=' + encodeURIComponent(arg), {});
          if (f.status === 200 && !/text\/html/.test(f.type) && f.bytes.length) ref = await c.saveOnce(rel, f.bytes);
          else await c.problem(rel, 'attachment download: HTTP ' + f.status + ' ' + f.type);
        }
        if (ref) files.push(ref);
      } else {
        await c.problem('uploads/details/' + uploadName(info, ids[i]) + '.json', 'no attachment link found in the documents grid');
      }
      await c.save('uploads/details/' + uploadName(info, ids[i]) + '.json', {
        endpoint: 'POST /online/Ajax/PHR/WsPHRManager.asmx/GetFileDetails',
        request_body: { fileId: ids[i] },
        ...(files.length ? { files } : {}),
        fetched_at: new Date(c.now()).toISOString(),
        status: d.status,
        content_type: 'application/json',
        decoded_from: d.charset,
        data: d.data,
      });
    }
  } catch (e) {
    if (isControl(e)) throw e;
    await c.problem('uploads', errMessage(e));
  }
}

function uploadName(info: Json, id: Json): string {
  // The uploaded file's own name, without its extension, which would otherwise end every such title.
  const origin = typeof info.DocumentOriginName === 'string' ? info.DocumentOriginName.replace(/\.[A-Za-z0-9]+$/, '') : undefined;
  return stem(iso(info.DocumentDate), safe(id), titleOf(info, UPLOAD_TITLE) || title(origin));
}

const HOSPITAL_URL = '/online/webapi/MailingsFromHospitals/GetMailingsFromHospitals/';
// The page's Summary button (openPdf in app_js/components/MailingsFromHospital/BaseModule.js) opens
// this with both values appended as they are, unencoded; they are sent here the same way.
const HOSPITAL_LETTER_URL = '/online/Pages/Popups/MailingsFromHospitals/MailingsFromHospitals.aspx?path=';
// DDMMYYYY, as the page's own date picker sends them. The page asks for its last YearsBack (3) years
// only, but the service takes any range and returns older stays too (seen 2026-09-23: four from 2001,
// none of them within three years), so it is asked for everything.
const HOSPITAL_BODY = { isDateSelected: true, fromDate: '01011900', toDate: '31122099' };

// Hospital stays exist only on the legacy site, as a JSON service behind its hospital-reports page;
// any legacy page opened in the session is enough for it to answer.
export async function hospitalStays(c: Collector, _ctx: Ctx): Promise<void> {
  const REL = 'hospital-stays/list.json';
  try {
    c.progress(0, 1, 'hospital stays');
    const r = await c.legacy(HOSPITAL_URL, 'POST', { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify(HOSPITAL_BODY));
    await c.sleep(PACE_MS);
    // Requests from the tab follow redirects, so a logged-out session answers with a web page.
    if (!/json/.test(r.contentType)) {
      await c.problem(REL, 'HTTP ' + r.status + ' ' + (r.contentType || 'no content type') + ', not data -- was the session logged out?');
      return;
    }
    const data = JSON.parse(c.legacyText(r, 'utf-8').text);
    const code = data && data.ResultMessage && data.ResultMessage.Code;
    if (r.status !== 200 || code !== 0) {
      await c.problem(REL, 'HTTP ' + r.status + ', result code ' + code);
      return;
    }
    const stays: Json[] = data.ReportHospitalizations || [];
    // Most members have none; like the sections in emptySections, the folder appears only with data.
    if (!stays.length) return;
    // Saved as the service sent it: padded strings, blank Description entries, repeats and all.
    await c.save(REL, {
      endpoint: 'POST ' + HOSPITAL_URL,
      request_body: HOSPITAL_BODY,
      fetched_at: new Date(c.now()).toISOString(),
      status: r.status,
      data,
    });
    // A stay with HasLink has a discharge letter: the one document here that says what happened.
    // The service pads every string and can list a stay twice, so the letter's name and request use
    // trimmed values, and a repeated stay's letter is asked for once.
    const letters = stays.filter((s) => s.HasLink === true);
    const done = new Set<string>();
    for (let i = 0; i < letters.length; i++) {
      const s = trimmed(letters[i]);
      c.progress(i, letters.length, 'hospital letters');
      // A stay has no id of its own; these four fields are what the site lists it by.
      const name = stem(iso(s.Date), await shortHash([s.Date, s.NameHospital, s.Department, s.TypeCommitmentEgenKey]), titleOf(s, ['NameHospital']));
      if (done.has(name)) continue;
      done.add(name);
      if (!s.LinkPDF || !s.TypeCommitmentEgenKey) {
        await c.problem('hospital-stays/files/' + name + '.pdf', 'HasLink is true but LinkPDF or TypeCommitmentEgenKey is empty');
        continue;
      }
      await c.pdfIfMissing('hospital-stays/files/' + name + '.pdf', HOSPITAL_LETTER_URL + s.LinkPDF + '&typeCommitment=' + s.TypeCommitmentEgenKey, {});
    }
  } catch (e) {
    if (isControl(e)) throw e;
    await c.problem(REL, errMessage(e));
  }
}

/** A stay's string fields without the service's fixed-width padding. */
function trimmed(row: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(row as Record<string, Json>)) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}

export async function emptySections(c: Collector, _ctx: Ctx): Promise<void> {
  const member = [{ member_id_code: '0', member_id: c.session.mid }];
  // The first entry is the part's name in the progress detail: the popup gives allergies a line of their own.
  // Allergies are kept even when the list is empty: "none on record" is itself an answer, and without the
  // file the export's README could not tell it from a request that failed.
  const checks: [string, string, string, string, Json, (d: Json) => unknown][] = [
    ['allergies', 'allergies-sensitivity/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/sensitivity', undefined, (d) => d && Array.isArray(d.intolerance)],
    ['appointments', 'appointments/list.json', 'POST', 'AppointmentOrderAPI/v2/members/0/{mid}/appointments/future', { members: member, is_with_ascribed_doctor: false }, (d) => Array.isArray(d) && d.length],
    ['requests', 'requests-approvals/list.json', 'POST', 'RequestsAndApprovalsAPI/v1/members/0/{mid}/requests_and_cases', { members: member }, (d) => (Array.isArray(d) ? d.length : d && Object.keys(d).length)],
  ];
  for (let i = 0; i < checks.length; i++) {
    const [part, rel, method, path, body, hasData] = checks[i];
    c.progress(i, checks.length, part);
    const r = await c.api(method, path, body);
    if (r.status === 200 && hasData(r.data)) await c.save(rel, c.rec(method, path, r));
  }
}
