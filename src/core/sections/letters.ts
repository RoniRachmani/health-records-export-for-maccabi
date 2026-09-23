import { PACE_MS, type Collector } from '../collector';
import { newCtx, type Ctx, type Json, type SaveResult } from '../types';
import { END_DATE, iso, israelToday, isPdf, safe, stem, titleOf } from '../util';

// name_document is a storage name with the member's ID number inside it, so it is never a candidate.
const LETTER_TITLE = ['letter_desc', 'subject', 'letter_name', 'letter_type_name', 'title', 'description'];

export async function letters(c: Collector, ctx: Ctx): Promise<Json[]> {
  const l = await c.getSave('letters/list.json', 'GET', 'DirectorshipAPI/v1/members/0/{mid}/letters_for_member?from_date=1900-01-01&to_date=' + END_DATE);
  const list: Json[] = (l.r.data && l.r.data.letters) || [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    c.progress(i, list.length, 'letters');
    if (x.letter_type === 1 && x.reference_id) {
      await c.pdfIfMissing('letters/files/' + stem(iso(x.original_item_date || x.item_date), safe(x.reference_id), titleOf(x, LETTER_TITLE)) + '.pdf',
        '/sonline/DirectorshipAPI/webapi/mac/v1/members/' + x.recipient_id_code + '/' + x.recipient_id + '/letters_for_member/' +
        x.reference_id + '/' + x.name_document + '/pdf?timestamp=' + x.timestamp + '&hash=' + x.hash);
    } else if (x.letter_type === 2 && x.link && !ctx.skipExistingMedicalFile) {
      await medicalFilePdf(c, x, false);
    }
  }
  return list;
}

/** Where problems with the full medical file are reported. Its PDF sits at the root of the export, in no folder. */
export const MEDICAL_FILE = 'medical-file';

// Full medical file (letter_type 2). Maccabi delivers it as a letter, but it is the export's main
// document, so it is saved at the root, beside README.md, not in letters/files/.
// replace=true overwrites a same-day file from an earlier order.
async function medicalFilePdf(c: Collector, x: Json, replace: boolean): Promise<SaveResult | null | undefined> {
  const rel = iso(x.original_item_date || x.item_date) + '_medical-file.pdf';
  if (!replace && (await c.exists(rel))) return 'kept_existing';
  const url = c.apiUrl('MainAppAPI/v2/members/0/{mid}/pdf') + '?file_path=' + x.link + '&timestamp=' + x.timestamp;
  let b = await c.fetchBin(url);
  for (let tries = 1; tries < 8 && b.status === 202; tries++) {
    await c.sleep(5000);
    b = await c.fetchBin(url);
  }
  if (b.status === 200 && isPdf(b.bytes)) return c.saveBin(rel, b.bytes, replace);
  await c.problem(MEDICAL_FILE, b.status === 202 ? 'still being prepared by Maccabi Healthcare Services (202); export again later' : 'HTTP ' + b.status + ' ' + b.type);
  return null;
}

async function medicalFileLetter(c: Collector): Promise<{ http: number; letter: Json }> {
  const r = await c.api('GET', 'DirectorshipAPI/v1/members/0/{mid}/letters_for_member?from_date=1900-01-01&to_date=' + END_DATE);
  if (r.status !== 200) return { http: r.status, letter: null };
  const list: Json[] = (r.data && r.data.letters) || [];
  return { http: 200, letter: list.find((l) => l.letter_type === 2) || null };
}

export interface OrderResult {
  error?: string;
  ordered?: boolean;
  success_code?: string;
  from_date?: string;
  to_date?: string;
  /** A ready medical file with the same to_date existed before this order. */
  same_day_before?: boolean;
  /** Nothing was ordered: a file from today over the same range was already waiting, and is used instead. */
  skipped_ready_today?: boolean;
}

// Orders the medical file (Maccabi sends an SMS and replaces the previous file
// on its list). Same endpoint and headers as the site's own order button, but
// startDate 1900-01-01: the whole history, where the site's form offers a
// narrower range. Skipped when a file ordered today over the same range is
// already waiting, so the same file is not built twice. Run from
// /online/medicalfile/summary/ in a tab that has been on /sonline/ (the wait
// needs the SPA token).
export async function placeOrder(c: Collector): Promise<OrderResult> {
  if (!/^\/online\/medicalfile\/summary\/?$/i.test(await c.deps.transport.pagePath())) return { error: 'open /online/medicalfile/summary/ first' };
  if (!c.session.jwt) return { error: 'no SPA token in this tab -- open any /sonline/ page, then /online/medicalfile/summary/, and rerun' };
  const fromDate = '1900-01-01';
  const toDate = israelToday(c.now());
  const pre = await medicalFileLetter(c);
  // Without the current list, a ready same-day file could be mistaken for the new order.
  if (pre.http !== 200) {
    await c.problem(MEDICAL_FILE, 'letters list HTTP ' + pre.http + ' before ordering; not ordered');
    return { ordered: false };
  }
  const before = pre.letter;
  const sameDayBefore = !!(before && before.to_date === toDate && before.status === 1);
  // A ready file from today over the same range is what this order would produce: take that one
  // instead of making Maccabi build it again (and text you again).
  if (sameDayBefore && (!before.from_date || iso(before.from_date) === fromDate)) {
    return { ordered: false, skipped_ready_today: true, from_date: fromDate, to_date: toDate, same_day_before: true };
  }
  // XMLHttpRequest, not fetch: Radware adds the uzlc header only to XHRs.
  let res: { status: number; text: string };
  try {
    res = await c.deps.transport.xhr({
      url: '/online/Ajax/Summary/WsSummaryPage.asmx/MedicalFileOrderAjax',
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: "{'startDate':'" + fromDate + "','endDate':'" + toDate + "'}",
    });
  } catch {
    res = { status: 0, text: '' };
  }
  let data: Json = null;
  try {
    data = JSON.parse(JSON.parse(res.text).d);
  } catch {
    /* reported below */
  }
  await c.sleep(PACE_MS);
  // Success '1' = ordered, SMS sent. '2' (ordered, no SMS) or '3' (failed) is reported, not waited on.
  if (res.status !== 200 || !data || data.Success !== '1') {
    await c.problem(MEDICAL_FILE, 'medical file order not confirmed: HTTP ' + res.status + ' Success ' + (data && data.Success) +
      (data && data.Success === '2' ? ' (ordered without SMS)' : ''));
    return { ordered: false, success_code: data ? data.Success : undefined };
  }
  return { ordered: true, success_code: data.Success, from_date: fromDate, to_date: toDate, same_day_before: sameDayBefore };
}

export interface WaitOptions {
  toDate?: string;
  everyMs?: number;
  appearMs?: number;
  timeoutMs?: number;
  /** A ready same-day file existed before the order: wait until the list shows the new one pending (or appearMs passes). */
  mustSeePending?: boolean;
}

// Waits until the medical file ordered with endDate toDate is ready, then
// saves the PDF and letters/list.json.
export async function waitMedicalFile(c: Collector, opts: WaitOptions = {}): Promise<{ polls: number; ready: boolean; ready_after_s?: number }> {
  const toDate = opts.toDate || israelToday(c.now());
  const everyMs = opts.everyMs || 15000;
  const appearMs = opts.appearMs || 2 * 60000;
  const timeoutMs = opts.timeoutMs || 15 * 60000;
  const started = c.now();
  let polls = 0;
  let sawPending = false;
  let x: Json = null;
  while (true) {
    polls++;
    const m = await medicalFileLetter(c);
    x = m.letter && m.letter.to_date === toDate ? m.letter : null;
    const waited = c.now() - started;
    c.progress(Math.min(waited, timeoutMs), timeoutMs, x ? 'medical file status ' + x.status : 'waiting for the medical file to appear');
    if (x && x.status !== 1) sawPending = true;
    if (x && x.status === 1 && x.link && (sawPending || !opts.mustSeePending || waited > appearMs)) break;
    if (!x && waited > appearMs) {
      await c.problem(MEDICAL_FILE, 'no medical file with to_date ' + toDate + ' after ' + Math.round(waited / 1000) + ' s');
      return { polls, ready: false };
    }
    if (waited > timeoutMs) {
      await c.problem(MEDICAL_FILE, 'medical file to ' + toDate + ' still status ' + (x && x.status) + ' after ' + Math.round(waited / 60000) + ' min; export again later');
      return { polls, ready: false };
    }
    await c.sleep(everyMs);
  }
  const ready = Math.round((c.now() - started) / 1000);
  await medicalFilePdf(c, x, true);
  await letters(c, newCtx()); // letters/list.json; the PDF is saved now, so not fetched twice
  return { polls, ready: true, ready_after_s: ready };
}
