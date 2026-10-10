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
    c.progress(i, list.length, 'letters', { done: i, total: list.length });
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
  /** ...and over the same range, so the list cannot tell it from the new one (dev:reorder orders anyway). */
  same_range_before?: boolean;
  /** Nothing was ordered: a file from today over the same range was already waiting, and is used instead. */
  skipped_ready_today?: boolean;
  /** The order request went out, whatever came back: Maccabi may have taken it even when no clear answer did. */
  sent?: boolean;
}

/**
 * Whether a run holding this result must not order again (a resume or a reconnect rewinds through the order step):
 * Maccabi took the order, or may have, or a ready file was used instead. Only an order that was never sent, or that
 * Maccabi plainly refused (Success '3'), is tried again: anything else could build the file and text the member twice.
 */
export function orderSettled(o: OrderResult | undefined): boolean {
  if (!o) return false;
  if (o.ordered || o.skipped_ready_today) return true;
  return !!o.sent && o.success_code !== '3';
}

// Orders the medical file (Maccabi sends an SMS and replaces the previous file
// on its list). Same endpoint and headers as the site's own order button, but
// startDate 1900-01-01: the whole history, where the site's form offers a
// narrower range. Skipped when a file ordered today over the same range is
// already waiting, so the same file is not built twice, unless `reorder` asks (a development build's
// dev:reorder, to time a real order on a day that already has one). Run from
// /online/medicalfile/summary/ in a tab that has been on /sonline/ (the wait
// needs the SPA token).
export async function placeOrder(c: Collector, opts: { reorder?: boolean } = {}): Promise<OrderResult> {
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
  const sameRangeBefore = sameDayBefore && coversFrom(before, fromDate);
  // A ready file from today over the same range is what this order would produce: take that one
  // instead of making Maccabi build it again (and text you again).
  if (sameRangeBefore && !opts.reorder) {
    return { ordered: false, skipped_ready_today: true, from_date: fromDate, to_date: toDate, same_day_before: true, same_range_before: true };
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
  // Success '1' = ordered, SMS sent; '2' = ordered, no SMS: either way Maccabi builds the file, and the run waits
  // for it. '3' (failed) or no clear answer is reported, not waited on.
  if (res.status !== 200 || !data || (data.Success !== '1' && data.Success !== '2')) {
    await c.problem(MEDICAL_FILE, 'medical file order not confirmed: HTTP ' + res.status + ' Success ' + (data && data.Success));
    return { ordered: false, sent: true, success_code: data ? data.Success : undefined };
  }
  return {
    ordered: true, sent: true, success_code: data.Success, from_date: fromDate, to_date: toDate,
    same_day_before: sameDayBefore, same_range_before: sameRangeBefore,
  };
}

/**
 * Whether a listed medical file starts at fromDate. Its entry changes nothing else when Maccabi swaps in a new file
 * (timestamp, hash and link change on every read), so the range is all that tells an order's file from an earlier
 * one; an entry without a from_date is taken to match, as before the field was checked.
 */
function coversFrom(letter: Json, fromDate: string): boolean {
  return !letter.from_date || iso(letter.from_date) === fromDate;
}

export interface WaitOptions {
  toDate?: string;
  /** The order's startDate: a same-day file over another range is an earlier one, and is waited past. */
  fromDate?: string;
  everyMs?: number;
  appearMs?: number;
  timeoutMs?: number;
  /**
   * A ready file over this same day and range existed before the order (only dev:reorder orders then), so the list
   * cannot tell the two apart: wait until it shows the new one pending, or appearMs passes.
   */
  mustSeePending?: boolean;
}

// Waits until the medical file ordered with endDate toDate is ready, then
// saves the PDF and letters/list.json.
export async function waitMedicalFile(c: Collector, opts: WaitOptions = {}): Promise<{ polls: number; ready: boolean; ready_after_s?: number }> {
  const toDate = opts.toDate || israelToday(c.now());
  const everyMs = opts.everyMs || 15000;
  const appearMs = opts.appearMs || 2 * 60000;
  const timeoutMs = opts.timeoutMs || 15 * 60000;
  const fromDate = opts.fromDate || '1900-01-01';
  const started = c.now();
  let polls = 0;
  let sawPending = false;
  let x: Json = null;
  while (true) {
    polls++;
    const m = await medicalFileLetter(c);
    const sameDay: Json = m.letter && m.letter.to_date === toDate ? m.letter : null;
    // Today's file over another range was ordered before this one (on the site, say): it is still listed because
    // Maccabi has not swapped in this order's file yet, so it is being prepared.
    x = sameDay && coversFrom(sameDay, fromDate) ? sameDay : null;
    const waited = c.now() - started;
    c.progress(Math.min(waited, timeoutMs), timeoutMs,
      x ? 'medical file status ' + x.status : sameDay ? 'medical file status pending' : 'waiting for the medical file to appear');
    if (x && x.status !== 1) sawPending = true;
    if (x && x.status === 1 && x.link && (sawPending || !opts.mustSeePending || waited > appearMs)) break;
    if (!sameDay && waited > appearMs) {
      await c.problem(MEDICAL_FILE, 'no medical file with to_date ' + toDate + ' after ' + Math.round(waited / 1000) + ' s');
      return { polls, ready: false };
    }
    if (waited > timeoutMs) {
      const what = x ? 'still status ' + x.status : 'still not swapped for an earlier file over another range';
      await c.problem(MEDICAL_FILE, 'medical file to ' + toDate + ' ' + what + ' after ' + Math.round(waited / 60000) + ' min; export again later');
      return { polls, ready: false };
    }
    await c.sleep(everyMs);
  }
  const ready = Math.round((c.now() - started) / 1000);
  c.progress(0, 1, 'letters'); // the download is its own part, as in a run that ordered nothing
  await medicalFilePdf(c, x, true);
  await letters(c, newCtx()); // letters/list.json; the PDF is saved now, so not fetched twice
  return { polls, ready: true, ready_after_s: ready };
}
