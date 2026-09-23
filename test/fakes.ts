/* Test doubles: a fake Maccabi site (synthetic data only -- never paste real
   responses here), an in-memory sink with the export's write rules, a fake
   clock, and a run of every collection step. */
import { Window } from 'happy-dom';
import {
  badPath, binResult, domHtmlParser, errMessage, jsonBytes, jsonResult, runStep, Collector, STEP_ORDER,
  type Clock, type Ctx, type Deps, type HttpRequest, type HttpResponse, type Json, type Problem, type Sink, type StepName, type Transport,
} from '../src/core';

export const MID = '123456';
export const PDF = new TextEncoder().encode('%PDF-1.4 synthetic');

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
        { type: 'lab_result', request_id: 555, test_name: 'ספירת דם', doc_id: 'D/1 x', time_stamp: 'T1', hash: 'h%2B1', result_files: true, execute_date: '2026-01-05T00:00:00' },
        { type: 'imaging_study', request_id: 9, doc_id: 'D9', result_files: true, execute_date: '2026-01-06T00:00:00' },
      ],
    })],
    ['GET', api('TestResultsAPI/v1/members/0/{mid}/getlatestlabresults'), () => jsonResp({})],
    ['GET', api('TestResultsAPI/v1/members/0/{mid}/followed/counter'), () => jsonResp({ count: 0 })],
    ['POST', api('TestResultsAPI/v1/members/0/{mid}/getresultsbyid'), () => jsonResp({ results: [{ group_values: [{ test_id: 'HGB', lab_date: '2026-01-05', test_desc: 'המוגלובין' }] }], hash: Math.random() })],
    ['GET', api('TestResultsAPI/v1/compare/0/{mid}/compare'), () => jsonResp({ series: [13.1, 13.4] })],
    ['GET', api('TestResultsAPI/pdf/openfile'), () => bytesResp(PDF)],
    ['POST', api('AppointmentOrderAPI/v1/members/0/{mid}/visits/history'), () => jsonResp({ results: [{ appointment_id: 'A1', appointment_date: '2026-02-01T10:00:00', has_summery_file: true, service_name: 'קרדיולוגיה', service_provider_name: 'ד"ר ישראלי' }] })],
    ['GET', api('AppointmentOrderAPI/v1/members/0/{mid}/visits/A1'), () => jsonResp({ visit_summary_pdf_link: 'dir/a b.pdf', timestamp: 'TS', hash: 'HH', text: 'synthetic' })],
    ['GET', api('AppointmentOrderAPI/v1/members/0/{mid}/pdf'), () => bytesResp(PDF)],
    ['POST', api('MedicalFileAPI/v1/members/0/{mid}/prescriptions'), () => jsonResp({ results: [{ file_link: 'rx/1.pdf', from_date: '01/03/26', prescription_number: 'P 1', drug_name: 'אקמול 500', doc_id: 'd', timestamp: 1, hash: 2 },
      { file_link: 'rx/2.pdf', from_date: '02/03/26', drug_name: 'נורופן', doc_id: '2::medication::' + MID + '::0::9', timestamp: 1, hash: 2 }] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/getprescriptionpdf'), () => bytesResp(PDF)],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/prescriptions/purchased/report'), () => jsonResp({ type: 'pdf', base64: btoa('%PDF-1.4 report') })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/referrals'), () => jsonResp({ referrals: [{ pdf_link: 'r%2F1.pdf', referral_date: '2026-03-01', referral_id: 'R1', referral_type_name: 'הפניה לרופא עור', timestamp: 't', hash: 'h' }] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/approvals'), () => jsonResp({ approval: [{ pdf_link: 'ap.pdf', approval_date: '2026-03-02', title_name: 'אישור פיזותרפיה', timestamp: 't', hash: 'h' }] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/tutorials'), () => jsonResp({ tutorials: [] })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/pdf'), () => bytesResp(PDF)],
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
      inquiries: [{ request_id: 'Q1', creation_date: '2026-04-02T09:00:00', service_provider_name: 'ד"ר ישראלי', medical_forms_documents: [{ result_file: 'f/1.pdf', timestamp: 't', hash: 'h' }] }],
    })],
    ['GET', api('CommunicationWithDoctorAPI/v1/members/0/{mid}/inquiries/Q1/details'), () => jsonResp({ doctor_remark: 'synthetic' })],
    ['GET', api('MedicalFileAPI/v1/members/0/{mid}/sensitivity'), () => jsonResp({ intolerance: [] })],
    ['POST', api('AppointmentOrderAPI/v2/members/0/{mid}/appointments/future'), () => jsonResp([])],
    ['POST', api('RequestsAndApprovalsAPI/v1/members/0/{mid}/requests_and_cases'), () => jsonResp([])],
    ['POST', '/online/handlers/ajax.ashx', () => bytesResp(latin1('<table>page 1</table>'), 'text/html; charset=windows-1255')],
    ['POST', '/online/Ajax/DrugsManager/WsPurchasedDrugsManager.asmx/GetAllPurchasedPrescription', () =>
      bytesResp(latin1('{"d":' + JSON.stringify(Array.from(PURCHASE_TABLE, (b) => String.fromCharCode(b)).join('')) + '}'), 'application/json; charset=windows-1255')],
    ['POST', '/online/Ajax/PHR/WsPHRManager.asmx/SearchByDate', () => jsonResp({ d: '<div fileid="F1"><a onclick="PHR.OpenFile(\'SYS1.pdf\')">x</a></div>' })],
    ['POST', '/online/Ajax/PHR/WsPHRManager.asmx/GetFileDetails', () => jsonResp({ d: [{ DocumentSystemName: 'SYS1', DocumentName: 'סיכום אשפוז', DocumentDate: '2026-05-01T00:00:00' }] })],
    ['GET', '/online/Pages/Popups/PHR/PHRDownloadDocument.aspx', () => bytesResp(PDF)],
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
    ['GET', '/online/Pages/Popups/MailingsFromHospitals/MailingsFromHospitals.aspx', () => bytesResp(PDF)],
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
    if (result === 'written' || result === 'updated') this.files.set(rel, bytes);
    return { result };
  }
  async problem(p: Problem) {
    this.problems.push(p);
  }
  json(rel: string): Json {
    return JSON.parse(new TextDecoder().decode(this.files.get(rel)));
  }
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
