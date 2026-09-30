/* Test doubles: a fake Maccabi site (synthetic data only -- never paste real
   responses here), an in-memory sink with the export's write rules, a fake
   clock, and a run of every collection step. */
import { Window } from 'happy-dom';
import {
  badPath, binResult, domHtmlParser, errMessage, jsonBytes, jsonResult, runStep, sha256Hex, Collector, STEP_ORDER,
  type Clock, type Ctx, type Deps, type HttpRequest, type HttpResponse, type Json, type Problem, type Sink, type StepName, type Transport,
} from '../src/core';

export const MID = '123456';
export const PDF = new TextEncoder().encode('%PDF-1.4 synthetic');
/** A PDF of its own: the export keeps one file per distinct content, so documents that differ must differ in bytes. */
export function pdfOf(key: string): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4 ' + key);
}
/** Documents the fake serves under one path that are the very file served under another. */
const SAME_FILE: Record<string, string> = {
  'f/1.pdf': 'r/1.pdf', // an inquiry's form that is the referral itself
  'v/again.pdf': 'dir/a b.pdf', // a linked visit that is a listed one
};
/** An imaging study's request_id: its DICOM id, 55 characters. */
export const DICOM_ID = '1.2.840.113619.2.182.10808615331248.1619.98765432109870';

export function jsonResp(obj: Json, status = 200): HttpResponse {
  return { status, redirected: false, contentType: 'application/json; charset=utf-8', bytes: obj === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(obj)) };
}
export function bytesResp(bytes: Uint8Array, contentType = 'application/pdf', status = 200): HttpResponse {
  return { status, redirected: false, contentType, bytes };
}

export type Route = (req: HttpRequest, url: URL) => HttpResponse | undefined;

/** Latin-1 view of a byte string: each char is one byte. */
export function latin1(s: string): Uint8Array {
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}

/** A string as windows-1255 bytes: ASCII as is, the Hebrew letters א-ת as 0xE0-0xFA. */
export function win1255(s: string): Uint8Array {
  return Uint8Array.from(s, (ch) => {
    const code = ch.charCodeAt(0);
    if (code < 0x80) return code;
    if (code >= 0x5d0 && code <= 0x5ea) return code - 0x5d0 + 0xe0;
    throw new Error('not in the fake windows-1255 range: ' + ch);
  });
}

/** JSON the way the legacy .asmx services send it: windows-1255 bytes, declared in the header. */
export function win1255JsonResp(obj: Json): HttpResponse {
  return bytesResp(win1255(JSON.stringify(obj)), 'application/json; charset=windows-1255');
}

// A purchase table as windows-1255 bytes: 0xF9 0xE5 0xED is "shalom" in Hebrew.
export const PURCHASE_TABLE = latin1(
  '<table><tr><th>a</th><th>b</th><th>c</th><th>d</th><th>e</th><th>f</th><th>g</th></tr>' +
  '<tr><td>\xf9\xe5\xed</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr></table>',
);

export interface LetterState {
  medicalFile: Json | null;
}

export function fakeMaccabi(letterState: LetterState = { medicalFile: null }): { routes: Route[]; calls: string[]; xhrCalls: HttpRequest[] } {
  const calls: string[] = [];
  const xhrCalls: HttpRequest[] = [];
  const api = (svcPath: string) => '/sonline/' + svcPath.split('/')[0] + '/webapi/mac/' + svcPath.split('/').slice(1).join('/').replace('{mid}', MID);
  const table: [string, string, (req: HttpRequest, url: URL) => HttpResponse][] = [
    ['GET', api('MainAppAPI/v1/members/0/{mid}'), () => jsonResp({ birth_date: '1980-01-02T00:00:00', first_name_english: 'SYNTHETIC', first_name_hebrew: 'סינתטי' })],
    ['GET', api('DirectorshipAPI/v1/members/0/{mid}/entitlement'), () => jsonResp({ ok: true })],
    ['GET', api('DirectorshipAPI/v1/members/0/{mid}/insurance/seniority'), () => jsonResp({ years: 1 })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/assigned_practitioners'), () => jsonResp([{ employee_id: 11, position_id: 22 }])],
    ['GET', api('MedicalFileAPI/v1/practitioner_affiliation/0/{mid}/eligibilities'), () => jsonResp([])],
    ['POST', api('MainAppAPI/v1/members/0/{mid}/providers'), () => jsonResp({ providers: [] })],
    ['GET', api('AppointmentOrderAPI/v1/members/0/{mid}/providers/ascribed'), () => jsonResp(undefined, 204)],
    ['POST', api('TestResultsAPI/v1/members/0/{mid}/tests'), () => jsonResp({
      tests: [
        { type: 'lab_result', request_id: 555, test_name: ['מעבדה'], test_category: [], doc_id: 'D/1 x', time_stamp: 'T1', hash: 'h%2B1', result_files: true, execute_date: '2026-01-05T00:00:00' },
        { type: 'imaging_study', request_id: DICOM_ID, doc_id: 'D9', result_files: true, execute_date: '2026-01-06T00:00:00' },
        { type: 'external_test_result', request_id: 'AS1', test_name: ['ממוגרפיה'], test_category: ['ממוגרפיה סקר'], doc_id: 'D7', time_stamp: 'T7', hash: 'h7', result_files: true, execute_date: '2026-01-07T00:00:00' },
        // Another account's shape: no test_category, the procedure named only in procedures[].
        { type: 'imaging_result', request_id: 'IM1', test_name: ['(M.R.I) תהודה מגנטית'], test_category: [], procedures: [{ test_name: 'MRI ערמונית', test_id: '9' }], doc_id: 'D8', time_stamp: 'T8', hash: 'h8', result_files: true, execute_date: '2026-01-08T00:00:00' },
      ],
    })],
    ['GET', api('TestResultsAPI/v1/members/0/{mid}/getlatestlabresults'), () => jsonResp({})],
    ['GET', api('TestResultsAPI/v1/members/0/{mid}/followed/counter'), () => jsonResp({ count: 0 })],
    ['POST', api('TestResultsAPI/v1/members/0/{mid}/getresultsbyid'), () => jsonResp({ results: [{ group_values: [{ test_id: 'HGB', lab_date: '2026-01-05', test_desc: 'המוגלובין' }] }], hash: Math.random() })],
    ['GET', api('TestResultsAPI/v1/compare/0/{mid}/compare'), () => jsonResp({ series: [13.1, 13.4] })],
    ['GET', api('TestResultsAPI/pdf/openfile'), (_r, url) => bytesResp(pdfOf(url.search))],
    ['POST', api('AppointmentOrderAPI/v1/members/0/{mid}/visits/history'), () => jsonResp({ results: [{ appointment_id: 'A1', appointment_date: '2026-02-01T10:00:00', has_summery_file: true, service_name: 'קרדיולוגיה', service_provider_name: 'ד"ר ישראלי' }] })],
    ['GET', api('AppointmentOrderAPI/v1/members/0/{mid}/visits/A1'), () => jsonResp({ visit_summary_pdf_link: 'dir/a b.pdf', timestamp: 'TS', hash: 'HH', text: 'synthetic' })],
    ['GET', api('AppointmentOrderAPI/v1/members/0/{mid}/pdf'), (_r, url) => bytesResp(pdfOf(SAME_FILE[url.searchParams.get('path')!] ?? url.searchParams.get('path')!))],
    // Visits a doctor's reply links to: one older than the visit list reaches, one the list has.
    ['GET', api('AppointmentOrderAPI/v1/members/0/{mid}/visits/7001/'), () => jsonResp({ visit_summary_date: '2024-06-01T08:00:00', service_provider_name: 'ד"ר כהן', service_provider_specialization: 'אורתופדיה', visit_summary_pdf_link: 'old/v.pdf', timestamp: 'TS', hash: 'HH' })],
    ['GET', api('AppointmentOrderAPI/v1/members/0/{mid}/visits/7002/'), () => jsonResp({ visit_summary_date: '2026-02-01T10:00:00', service_provider_name: 'ד"ר ישראלי', service_provider_specialization: 'קרדיולוגיה', visit_summary_pdf_link: 'v/again.pdf', timestamp: 'TS', hash: 'HH' })],
    ['POST', api('MedicalFileAPI/v1/members/0/{mid}/prescriptions'), () => jsonResp({ results: [{ file_link: 'rx/1.pdf', from_date: '01/03/26', prescription_number: 'P 1', drug_name: 'אקמול 500', doc_id: 'd', timestamp: 1, hash: 2 },
      { file_link: 'rx/2.pdf', from_date: '02/03/26', drug_name: 'נורופן', doc_id: '2::medication::' + MID + '::0::9', timestamp: 1, hash: 2 },
      // One visit's prescriptions, a monthly part among them: they share one PDF, the visit's page.
      { file_link: 'rx/3.pdf', clicks_visit_number: '9001', from_date: '2026-03-05T00:00:00', prescription_number: '3', drug_name: 'XATRAL XL  10MG 30TAB', doc_id: 'd3', timestamp: 1, hash: 2 },
      { file_link: 'rx/4.pdf', clicks_visit_number: '9001', from_date: '2026-03-05T00:00:00', prescription_number: '4', drug_name: 'SIMVASTATIN TEVA 10MG 30TAB', doc_id: 'd4', timestamp: 1, hash: 2 },
      { file_link: 'rx/5.pdf', clicks_visit_number: '9001', from_date: '2026-04-05T00:00:00', prescription_number: '5', drug_name: 'XATRAL XL  10MG 30TAB', doc_id: 'd5', timestamp: 1, hash: 2 }] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/getprescriptionpdf'), (_r, url) => bytesResp(pdfOf(url.search))],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/prescriptions/purchased/report'), () => jsonResp({ type: 'pdf', base64: btoa('%PDF-1.4 report') })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/referrals'), () => jsonResp({ referrals: [{ pdf_link: 'r%2F1.pdf', referral_date: '2026-03-01', referral_id: 'R1', referral_type_name: 'הפניה לרופא עור', timestamp: 't', hash: 'h' },
      // The kind says only "a specialist consultation"; displaying_name says which specialist.
      { pdf_link: 'r%2F2.pdf', referral_date: '2026-03-03', referral_id: 'R2', title_name: 'התייעצות מומחה', displaying_name: 'התייעצות מומחה- אורולוגיה', timestamp: 't', hash: 'h' },
      // displaying_name vaguer than the kind: the kind stays.
      { pdf_link: 'r%2F3.pdf', referral_date: '2026-03-04', referral_id: 'R3', title_name: 'בדיקה מיקולוגית', displaying_name: 'בדיקות מעבדה', timestamp: 't', hash: 'h' }] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/approvals'), () => jsonResp({ approval: [{ pdf_link: 'ap.pdf', approval_date: '2026-03-02', title_name: 'אישור פיזותרפיה', timestamp: 't', hash: 'h' }] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/tutorials'), () => jsonResp({ tutorials: [] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/pdf'), (_r, url) => bytesResp(pdfOf(url.searchParams.get('path')!))],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/vaccinations_grouped'), () => jsonResp({ timeline: [{ vaccine_group_code: 7, vaccine_group_name: 'שעלת צפדת' }] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/vaccinations'), (_r, url) => jsonResp({ asked: url.search })],
    ['GET', api('AppointmentOrderAPI/v1/members/0/{mid}/eligibility/vaccines/flu'), () => jsonResp({ eligible: false })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/vaccination/certificates/report'), () => jsonResp({ type: 'pdf', base64: btoa('%PDF-1.4 booklet') })],
    ['GET', api('DirectorshipAPI/v1/members/0/{mid}/letters_for_member'), () => jsonResp({
      letters: [
        { letter_type: 1, reference_id: 'L1', letter_desc: 'מכתב שיחרור', recipient_id_code: 0, recipient_id: MID, name_document: 'm80188' + MID + '01', timestamp: 't', hash: 'h', item_date: '2026-04-01T00:00:00' },
        ...(letterState.medicalFile ? [letterState.medicalFile] : []),
      ],
    })],
    ['GET', '/sonline/DirectorshipAPI/webapi/mac/v1/members/0/' + MID + '/letters_for_member/L1/m80188' + MID + '01/pdf', () => bytesResp(PDF)],
    ['GET', api('MainAppAPI/v2/members/0/{mid}/pdf'), () => bytesResp(PDF)],
    ['GET', api('CommunicationWithDoctorAPI/v1/members/0/{mid}/inquiries'), () => jsonResp({
      inquiries: [
        { request_id: 'Q1', creation_date: '2026-04-02T09:00:00', service_provider_name: 'ד"ר ישראלי', medical_forms_documents: [{ result_file: 'f/1.pdf', timestamp: 't', hash: 'h' }] },
        { request_id: 'Q2', creation_date: '2026-04-05T09:00:00', service_provider_name: 'ד"ר ישראלי',
          medical_forms_documents: [{ result_file: 'f/2.pdf', timestamp: 't', hash: 'h' }, { result_file: 'f/3.pdf', timestamp: 't', hash: 'h' }] },
      ],
    })],
    // Q1 names no subject, so its forms name it; Q2's forms say no kind, so its question names it, and they do not pair with the list's.
    ['GET', api('CommunicationWithDoctorAPI/v1/members/0/{mid}/inquiries/Q1/details'), () => jsonResp({
      doctor_remark: 'synthetic', request_subjects: [], open_medical_record_number: 7001,
      medical_forms_details: [{ document_description: 'הפניה', link_pdf: 'l/1.pdf' }],
    })],
    ['GET', api('CommunicationWithDoctorAPI/v1/members/0/{mid}/inquiries/Q2/details'), () => jsonResp({
      doctor_remark: 'synthetic', general_question_subject: 'שאלה לרופא', open_medical_record_number: 7002,
      medical_forms_details: [{ link_pdf: 'l/2.pdf' }, {}],
    })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/sensitivity'), () => jsonResp({ intolerance: [] })],
    ['POST', api('AppointmentOrderAPI/v2/members/0/{mid}/appointments/future'), () => jsonResp([])],
    ['POST', api('RequestsAndApprovalsAPI/v1/members/0/{mid}/requests_and_cases'), () => jsonResp([])],
    ['POST', '/online/handlers/ajax.ashx', () => bytesResp(latin1('<table>page 1</table>'), 'text/html; charset=windows-1255')],
    ['POST', '/online/Ajax/DrugsManager/WsPurchasedDrugsManager.asmx/GetAllPurchasedPrescription', () =>
      bytesResp(latin1('{"d":' + JSON.stringify(Array.from(PURCHASE_TABLE, (b) => String.fromCharCode(b)).join('')) + '}'), 'application/json; charset=windows-1255')],
    // The .asmx services answer windows-1255 and say so; the /online/webapi/ one below answers utf-8.
    ['POST', '/online/Ajax/PHR/WsPHRManager.asmx/SearchByDate', () => win1255JsonResp({
      d: '<div fileid="F1"><a onclick="PHR.OpenFile(\'SYS1.pdf\')">x</a></div><div fileid="F2"><a onclick="PHR.OpenFile(\'SYS2.pdf\')">x</a></div>',
    })],
    // F2 is the same document uploaded again, with no title of its own.
    ['POST', '/online/Ajax/PHR/WsPHRManager.asmx/GetFileDetails', (req) => win1255JsonResp({
      d: [req.body!.includes('F1')
        ? { DocumentSystemName: 'SYS1', DocumentTitle: 'סיכום אשפוז', DocumentOriginName: 'scan.pdf', DocumentDate: '2026-05-01T00:00:00' }
        : { DocumentSystemName: 'SYS2', DocumentTitle: '', DocumentDescription: '', DocumentOriginName: 'סיכום.pdf', DocumentDate: '2026-05-02T00:00:00' }],
    })],
    ['GET', '/online/Pages/Popups/PHR/PHRDownloadDocument.aspx', () => bytesResp(pdfOf('upload'))],
    // Padded strings, blank Description entries and one stay listed twice, as the service sends them.
    ['POST', '/online/webapi/MailingsFromHospitals/GetMailingsFromHospitals/', () => {
      const stay = {
        NameHospital: 'בית חולים לדוגמה   ', Department: 'פנימית א', DateHospitalization: '3032024', Date: '2024-03-03T00:00:00',
        DurationHospitalization: '2', QuantityTreatments: '2', TypeCommitment: 'אשפוז', TypeCommitmentEgenKey: '1', LinkPDF: '', HasLink: false,
        DescriptionTreatment: [{ Description: 'HOSPITALIZATION - PER DAY      ' }, { Description: '      ' }],
        DescriptionDistinction: [{ Description: '      ' }],
      };
      // A second stay, with a discharge letter.
      const letter = { ...stay, NameHospital: 'מרכז רפואי לדוגמה', Date: '2025-05-10T00:00:00', DateHospitalization: '10052025', HasLink: true, LinkPDF: 'reports/L9.pdf', TypeCommitmentEgenKey: '2' };
      return jsonResp({ ReportHospitalizations: [stay, stay, letter], ResultMessage: { Code: 0, Description: '' } });
    }],
    ['GET', '/online/Pages/Popups/MailingsFromHospitals/MailingsFromHospitals.aspx', (_r, url) => bytesResp(pdfOf(url.search))],
  ];
  const route: Route = (req, url) => {
    calls.push(req.method + ' ' + url.pathname + url.search);
    const hit = table.find(([m, p]) => m === req.method && p === url.pathname);
    return hit ? hit[2](req, url) : undefined;
  };
  return { routes: [route], calls, xhrCalls };
}

export function fakeTransport(routes: Route[], opts: { pagePath?: string; xhr?: (req: HttpRequest) => { status: number; text: string } } = {}): Transport {
  return {
    async fetch(req) {
      const url = new URL(req.url, 'https://online.maccabi4u.co.il');
      for (const r of routes) {
        const res = r(req, url);
        if (res) return res;
      }
      return { status: 404, redirected: false, contentType: 'text/html', bytes: latin1('not found ' + url.pathname) };
    },
    async xhr(req) {
      return opts.xhr ? opts.xhr(req) : { status: 0, text: '' };
    },
    async pagePath() {
      return opts.pagePath ?? '/sonline/';
    },
  };
}

export class MemorySink implements Sink {
  files = new Map<string, Uint8Array>();
  problems: Problem[] = [];
  /** putBin's content index: sha256 -> path. */
  shas = new Map<string, string>();
  aliases = new Map<string, string>();
  async exists(rel: string) {
    return this.files.has(rel);
  }
  async putJson(rel: string, obj: Json) {
    const bad = badPath(rel);
    if (bad) return { error: bad };
    const result = jsonResult(this.files.get(rel), obj);
    if (result !== 'unchanged') this.files.set(rel, jsonBytes(obj));
    return { result };
  }
  async putBin(rel: string, bytes: Uint8Array, replace: boolean) {
    const bad = badPath(rel);
    if (bad) return { error: bad };
    const result = binResult(this.files.get(rel), bytes, replace);
    if (result === 'written' || result === 'updated') {
      for (const [sha, at] of this.shas) if (at === rel) this.shas.delete(sha);
      this.files.set(rel, bytes);
      this.shas.set(await sha256Hex(bytes), rel);
    }
    return { result };
  }
  async findBySha256(sha: string) {
    return this.shas.get(sha) ?? null;
  }
  async putAlias(rel: string, existing: string) {
    this.aliases.set(rel, existing);
  }
  async aliasOf(rel: string) {
    return this.aliases.get(rel) ?? null;
  }
  async problem(p: Problem) {
    this.problems.push(p);
  }
  json(rel: string): Json {
    return JSON.parse(new TextDecoder().decode(this.files.get(rel)));
  }
}

/**
 * The fields of an exported record that name another file in the export, by its export-relative path.
 * A new field that points to a file has to be added here, or the check below cannot see it.
 */
const REFERENCE_FIELDS = ['file', 'same_as', 'visit', 'linked_from'];

/** What the site sent or was sent, kept as it was: its keys are the site's, not the export's references. */
const AS_SENT = ['data', 'request_body'];

/**
 * Every reference in the sink's JSON records that names a file the sink does not hold, as
 * "<record> -> <path>". Walks each record's wrapper at any depth, so a reference is found wherever it sits.
 */
export function danglingRefs(sink: MemorySink): string[] {
  const out: string[] = [];
  const walk = (rel: string, v: Json, top: boolean): void => {
    if (Array.isArray(v)) v.forEach((x) => walk(rel, x, false));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, Json>)) {
        if (top && AS_SENT.includes(k)) continue;
        if (REFERENCE_FIELDS.includes(k) && typeof x === 'string') {
          if (!sink.files.has(x)) out.push(rel + ' -> ' + x);
        } else walk(rel, x, false);
      }
    }
  };
  for (const rel of sink.files.keys()) if (rel.endsWith('.json')) walk(rel, sink.json(rel), true);
  return out;
}

export class FakeClock implements Clock {
  t = Date.parse('2026-09-17T09:00:00Z');
  sleeps: number[] = [];
  onSleep?: (t: number) => void;
  now() {
    return this.t;
  }
  async sleep(ms: number) {
    this.sleeps.push(ms);
    this.t += ms;
    this.onSleep?.(this.t);
  }
}

export function htmlParser() {
  const win = new Window();
  return domHtmlParser(win.DOMParser as unknown as { new (): DOMParser });
}

export function makeCollector(transport: Transport, sink: Sink = new MemorySink(), clock = new FakeClock(), extra: Partial<Deps> = {}) {
  const jwtPayload = btoa(JSON.stringify({ mem_id: MID, gender: 'F' })).replace(/=+$/, '');
  const c = new Collector(
    { transport, sink, clock, html: htmlParser(), ...extra },
    { mid: MID, jwt: 'h.' + jwtPayload + '.s', gender: 'F' },
  );
  return { c, sink, clock };
}

/**
 * Every collection step (or the named ones), in order, stopping at SESSION ENDED or a cancel as
 * the extension's run does. results tallies what each save amounted to.
 */
export async function runAll(c: Collector, ctx: Ctx, only?: StepName[]) {
  let stoppedAt: StepName | undefined;
  for (const name of only ? STEP_ORDER.filter((n) => only.includes(n)) : STEP_ORDER) {
    try {
      await runStep(c, ctx, name);
    } catch (e) {
      // runStep records everything else itself, so what reaches here ends the run.
      await c.problem(name, errMessage(e));
      stoppedAt = name;
      break;
    }
  }
  const results: Record<string, number> = {};
  for (const [, r] of c.log) {
    const k = r.startsWith('PROBLEM') ? 'problem' : r;
    results[k] = (results[k] || 0) + 1;
  }
  const problems = c.log.filter(([, r]) => r.startsWith('PROBLEM')).map(([where, r]) => where + ' ' + r);
  return { results, problems, stoppedAt };
}
