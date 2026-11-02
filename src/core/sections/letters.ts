import { PACE_MS, type Collector } from '../collector';
import { newCtx, type Ctx, type SaveResult } from '../types';
import { END_DATE, iso, israelTime, israelToday, isPdf, safe, stem, titleOf } from '../util';

// name_document is a storage name with the member's ID number inside it, so it is never a candidate.
const LETTER_TITLE = ['letter_desc', 'subject', 'letter_name', 'letter_type_name', 'title', 'description'];

/**
 * The fields of a letters_for_member entry that the run reads. The entry is saved as the site sent it; this names
 * only what decides a request or a file name, so a misspelt field is a type error rather than a silent undefined.
 * letter_type 1 is a letter with a PDF, 2 the full medical file (status 1 when it is ready).
 */
interface Letter {
  letter_type?: number;
  status?: number;
  reference_id?: string;
  recipient_id_code?: string | number;
  recipient_id?: string | number;
  name_document?: string;
  timestamp?: string | number;
  hash?: string;
  link?: string;
  item_date?: string;
  original_item_date?: string;
  from_date?: string;
  to_date?: string;
  [field: string]: unknown;
}

/** The entries of a list of letters; anything that is not an object is not an entry. */
function entries(list: unknown[]): Letter[] {
  return list.filter((x): x is Letter => !!x && typeof x === 'object');
}

/** The entries of a letters_for_member answer, read without filing anything: the medical file's polls ask it often. */
function lettersOf(data: unknown): Letter[] {
  const list = data && typeof data === 'object' ? (data as { letters?: unknown }).letters : undefined;
  return Array.isArray(list) ? entries(list) : [];
}

/** The order's answer, once its `d` is parsed: Success '1' or '2' ordered, '3' refused. */
interface OrderAnswer {
  Success?: string;
}

export async function letters(c: Collector, ctx: Ctx): Promise<Letter[]> {
  const l = await c.getSave('letters/list.json', 'GET', 'DirectorshipAPI/v1/members/0/{mid}/letters_for_member?from_date=1900-01-01&to_date=' + END_DATE);
  const list = entries(await c.listIn('letters', l.r, 'letters'));
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

/** The order's startDate: the whole history. */
const FULL_HISTORY = '1900-01-01';

/** A 202 is the PDF still being rendered: ask again this often, up to this many times (35 s in all). */
const PDF_READY_WAIT_MS = 5000;
const PDF_READY_TRIES = 8;

// Full medical file (letter_type 2). Maccabi delivers it as a letter, but it is the export's main
// document, so it is saved at the root, beside README.md, not in letters/files/.
// replace=true overwrites a same-day file from an earlier order.
async function medicalFilePdf(c: Collector, x: Letter, replace: boolean): Promise<SaveResult | null | undefined> {
  const rel = iso(x.original_item_date || x.item_date) + '_medical-file.pdf';
  if (!replace && (await c.exists(rel))) return 'kept_existing';
  const url = c.apiUrl('MainAppAPI/v2/members/0/{mid}/pdf') + '?file_path=' + x.link + '&timestamp=' + x.timestamp;
  let b = await c.fetchBin(url);
  for (let tries = 1; tries < PDF_READY_TRIES && b.status === 202; tries++) {
    await c.sleep(PDF_READY_WAIT_MS);
    b = await c.fetchBin(url);
  }
  if (b.status === 200 && isPdf(b.bytes)) return c.saveBin(rel, b.bytes, replace);
  await c.problem(MEDICAL_FILE, b.status === 202 ? 'still being prepared by Maccabi Healthcare Services (202); export again later' : 'HTTP ' + b.status + ' ' + b.type);
  return null;
}

async function medicalFileLetter(c: Collector): Promise<{ http: number; letter: Letter | null }> {
  const r = await c.api('GET', 'DirectorshipAPI/v1/members/0/{mid}/letters_for_member?from_date=1900-01-01&to_date=' + END_DATE);
  if (r.status !== 200) return { http: r.status, letter: null };
  return { http: 200, letter: lettersOf(r.data).find((l) => l.letter_type === 2) || null };
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
  /**
   * Nothing was ordered: an earlier day's order that no export has collected was built since, and its file (to_date
   * that day, over the same range) is used instead. to_date is that day.
   */
  skipped_ready_earlier?: boolean;
  /** The order request went out, whatever came back: Maccabi may have taken it even when no clear answer did. */
  sent?: boolean;
  /**
   * Nothing was sent: an earlier run ordered today, and ordered says whether Maccabi confirmed that order. Or an
   * order Maccabi confirmed yesterday has not been built yet, and is waited for: to_date is then yesterday.
   */
  earlier_order?: boolean;
  /** This order is the day's one retry after a refusal (REFUSAL_RETRY_MS). */
  retry?: boolean;
  /** After a refusal: from when (ISO) a new run may order once more. Missing when the day's retry is used. */
  retry_at?: string;
}

/** The member's last order, as far as the caller remembers it. */
export interface EarlierOrder {
  confirmed: boolean;
  /** Its Success code, when an answer came. */
  code?: string;
  /** The day in Israel it was sent, its to_date; missing is today. */
  day?: string;
  /**
   * Whether an export has its file: only false is carried to a later day. An order stored before this was kept may
   * have been collected, and a member exporting daily would otherwise get the same file twice.
   */
  collected?: boolean;
  /** When it was answered (ISO), which a refusal's cool-down counts from. */
  at?: string;
  /** It was itself the day's retry after a refusal, so no other is sent. */
  retried?: boolean;
}

/**
 * How long after a refusal a new run may order once more. On 2026-10-15 a refused order was still carried out, its SMS
 * coming 21 minutes later, so a retry sooner than that could text the member twice. An hour is about three times that
 * delay and twice the longest wait for a confirmed order's file, and still leaves the member the same day. A refused
 * order that is carried out shows on the list as a ready file, which a new run takes first without ordering.
 */
export const REFUSAL_RETRY_MS = 60 * 60000;

/** When a refused earlier order allows its one retry (ms), or undefined when it does not: not a refusal, or a retry. */
function retryAfter(earlier: EarlierOrder): number | undefined {
  if (earlier.code !== '3' || earlier.confirmed || earlier.retried || !earlier.at) return undefined;
  const at = Date.parse(earlier.at);
  return Number.isNaN(at) ? undefined : at + REFUSAL_RETRY_MS;
}

/**
 * How many days after its order an earlier order's file, once built, is still taken instead of ordering: Maccabi has
 * built one overnight, and an export that gave up on it says to export again when Maccabi texts. Three days covers a
 * weekend, and the file is never more than that behind the rest of the export.
 */
export const EARLIER_FILE_DAYS = 3;

/**
 * How many days after a confirmed order a run still waits for it, unbuilt, instead of ordering again. Builds have
 * taken up to the next day: past that the order is more likely lost than slow, and a second text is better than
 * leaving the member without a fresh file.
 */
const EARLIER_WAIT_DAYS = 1;

/** The last day an export takes the file of an order sent on `day` without ordering again. */
export function earlierFileUntil(day: string): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + EARLIER_FILE_DAYS * 86400000).toISOString().slice(0, 10);
}

/** Whole days from one ISO day to another. */
function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

/**
 * Whether a run holding this result must not order again (a resume or a reconnect rewinds through the order step):
 * Maccabi took the order, or may have, or a ready file was used instead. Only an order that was never sent is tried
 * again. That includes a refusal: on 2026-10-15 one refused at 11:14 was followed by an SMS at 11:35, when nothing
 * else was ordering, so Maccabi may carry out an order it refused, and asking again could text the member twice.
 */
export function orderSettled(o: OrderResult | undefined): boolean {
  if (!o) return false;
  return !!(o.ordered || o.skipped_ready_today || o.skipped_ready_earlier || o.sent || o.earlier_order);
}

/** Maccabi refused the order: Success '3', where the site's own button tells the member to try again later. */
export function orderRefused(o: OrderResult | undefined): boolean {
  return !!o && !o.ordered && o.success_code === '3';
}

// Orders the medical file (Maccabi sends an SMS and replaces the previous file
// on its list). Same endpoint and headers as the site's own order button, but
// startDate 1900-01-01: the whole history, where the site's form offers a
// narrower range. Skipped when a file ordered today over the same range is
// already waiting, so the same file is not built twice, unless `reorder` asks (a development build's
// dev:reorder, to time a real order on a day that already has one). Run from
// /online/medicalfile/summary/ in a tab that has been on /sonline/ (the wait
// needs the SPA token). `beforeSend` runs just before the order goes out, for the caller to record that it is
// about to (and whether it is the day's retry): once it is out, Maccabi may take it whether or not an answer ever
// comes back. `earlier` is the last order an earlier run sent: a new run takes that one instead of ordering (and
// texting) again, since the list shows no pending order to go by. From today, always, but for a refusal: once
// REFUSAL_RETRY_MS has passed with no file on the list, a new run orders once more, and never again that day. From an
// earlier day, only when no export has its file yet: once it is built (EARLIER_FILE_DAYS), whatever its answer was,
// or, if Maccabi confirmed it, still unbuilt the next day (EARLIER_WAIT_DAYS).
export async function placeOrder(c: Collector, opts: { reorder?: boolean; beforeSend?: (o: { retry: boolean }) => Promise<void>; earlier?: EarlierOrder } = {}): Promise<OrderResult> {
  if (!/^\/online\/medicalfile\/summary\/?$/i.test(await c.deps.transport.pagePath())) return { error: 'open /online/medicalfile/summary/ first' };
  if (!c.session.jwt) return { error: 'no SPA token in this tab -- open any /sonline/ page, then /online/medicalfile/summary/, and rerun' };
  const fromDate = FULL_HISTORY;
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
  const earlier = opts.reorder ? undefined : opts.earlier;
  const sameDay = !!earlier && (earlier.day ?? toDate) === toDate;
  // Checked after the list, so a refused order Maccabi carried out after all is taken above, with no order.
  const retryAt = earlier && sameDay ? retryAfter(earlier) : undefined;
  const retry = retryAt !== undefined && c.now() >= retryAt;
  if (earlier && sameDay && !retry) {
    return {
      ordered: earlier.confirmed, earlier_order: true, success_code: earlier.code, from_date: fromDate, to_date: toDate,
      same_day_before: sameDayBefore, same_range_before: sameRangeBefore,
      ...(retryAt !== undefined && { retry_at: new Date(retryAt).toISOString() }),
    };
  }
  if (earlier?.day && !sameDay && earlier.collected === false) {
    const day = earlier.day;
    const age = daysFrom(day, toDate);
    // Built since, whatever its answer said: a refused order has been carried out, with its text (2026-10-15).
    if (age > 0 && age <= EARLIER_FILE_DAYS && before && before.to_date === day && before.status === 1 && coversFrom(before, fromDate)) {
      return { ordered: false, skipped_ready_earlier: true, from_date: fromDate, to_date: day };
    }
    if (age > 0 && age <= EARLIER_WAIT_DAYS && earlier.confirmed) {
      return { ordered: true, earlier_order: true, success_code: earlier.code, from_date: fromDate, to_date: day, same_day_before: false, same_range_before: false };
    }
  }
  // XMLHttpRequest, not fetch: Radware adds the uzlc header only to XHRs.
  let res: { status: number; text: string };
  await opts.beforeSend?.({ retry });
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
  let data: OrderAnswer | null = null;
  try {
    data = JSON.parse(JSON.parse(res.text).d);
  } catch {
    /* reported below */
  }
  await c.sleep(PACE_MS);
  // Success '1' = ordered, SMS sent; '2' = ordered, no SMS: either way Maccabi builds the file, and the run waits
  // for it. '3' is a refusal, reported at the wait with the file the run keeps instead (keepListedMedicalFile); no
  // clear answer is reported here. Neither is waited on or asked again by this run; a later run may retry a refusal once.
  const retried = retry ? { retry: true } : {};
  if (res.status === 200 && data && data.Success === '3') {
    return { ordered: false, sent: true, success_code: '3', ...retried, ...(!retry && { retry_at: new Date(c.now() + REFUSAL_RETRY_MS).toISOString() }) };
  }
  if (res.status !== 200 || !data || (data.Success !== '1' && data.Success !== '2')) {
    await c.problem(MEDICAL_FILE, 'medical file order not confirmed: HTTP ' + res.status + ' Success ' + (data && data.Success));
    return { ordered: false, sent: true, success_code: data ? data.Success : undefined, ...retried };
  }
  return {
    ordered: true, sent: true, success_code: data.Success, from_date: fromDate, to_date: toDate, ...retried,
    same_day_before: sameDayBefore, same_range_before: sameRangeBefore,
  };
}

/**
 * Whether a listed medical file starts at fromDate. Its entry changes nothing else when Maccabi swaps in a new file
 * (timestamp, hash and link change on every read), so the range is all that tells an order's file from an earlier
 * one; an entry without a from_date is taken to match, as before the field was checked.
 */
function coversFrom(letter: Letter, fromDate: string): boolean {
  return !letter.from_date || iso(letter.from_date) === fromDate;
}

/**
 * Saves the medical file Maccabi lists now, with letters/list.json, and says which file the export has, so neither
 * the member nor an assistant reading the export takes an earlier file for today's.
 */
async function keepListed(c: Collector): Promise<{ text: string; kept?: string }> {
  const list = await letters(c, newCtx());
  const x = list.find((l) => l.letter_type === 2 && l.link);
  const day = x ? iso(x.original_item_date || x.item_date) : '';
  const rel = day + '_medical-file.pdf';
  if (!x || !(await c.exists(rel))) return { text: 'this export has no medical file' };
  // Today's file over a narrower range is named for today: its range is what tells it from the whole history.
  const partial = x.from_date && iso(x.from_date) !== FULL_HISTORY ? ', which covers only ' + iso(x.from_date) + ' to ' + iso(x.to_date) : '';
  return { text: 'this export has the earlier medical file, ' + rel + partial, kept: day };
}

/**
 * No new file was ordered: keep the one Maccabi already lists, as a run that orders nothing does. When an order was
 * tried and not taken, say which file the export has instead. Returns the day of the file kept, if there is one.
 */
export async function keepListedMedicalFile(c: Collector, order?: OrderResult): Promise<string | undefined> {
  const { text: kept, kept: day } = await keepListed(c);
  if (!order || order.ordered || order.skipped_ready_today || order.skipped_ready_earlier) return day;
  // A refused order may still be carried out, with its SMS, minutes later: an export after that SMS, the same day,
  // takes the ready file without ordering (placeOrder skipped_ready_today). With no SMS, an export from retry_at orders
  // once more; before it, or after the day's retry, it orders nothing.
  await c.problem(MEDICAL_FILE, orderRefused(order)
    ? 'Maccabi Online asked to try again later, so ' + kept + '. If Maccabi texts you today, export again and it ' +
      'won\'t order. If not, ' + (order.retry_at
      ? 'an export from ' + israelTime(Date.parse(order.retry_at)) + ' orders once more (Success 3)'
      : 'export again tomorrow (Success 3)')
    : order.earlier_order
      ? 'an order already went out today, so none was sent, and ' + kept + '. ' + exportAgain(israelToday(c.now()))
      : 'a new medical file was not ordered, so ' + kept);
  return day;
}

interface WaitOptions {
  toDate?: string;
  /** The order's startDate: a same-day file over another range is an earlier one, and is waited past. */
  fromDate?: string;
  everyMs?: number;
  appearMs?: number;
  timeoutMs?: number;
  /**
   * A ready file over this same day and range existed before the order (only dev:reorder orders then), so the list
   * cannot tell the two apart: wait until it shows the new one pending, or appearMs has passed since the order.
   */
  mustSeePending?: boolean;
  /**
   * When the order was placed (the Clock's time). The rest of the run comes between the order and this wait, so
   * appearMs is usually over before the first check; without it, appearMs counts from the start of the wait.
   */
  orderedAt?: number;
  /** Asked before each wait between checks: the member chose to save the export without waiting any longer. */
  giveUp?: () => boolean;
}

// A confirmed order Maccabi has not finished: an export after its text takes the file without ordering, the same day
// (placeOrder skipped_ready_today) or up to EARLIER_FILE_DAYS later (skipped_ready_earlier). A problem keeps 300
// characters.
function exportAgain(day: string): string {
  return 'When Maccabi texts you, export again by ' + earlierFileUntil(day) + ': that export takes the file ordered ' + day + ' without ordering again';
}

// Waits until the medical file ordered with endDate toDate is ready, then
// saves the PDF and letters/list.json. When it gives up, it keeps the file Maccabi still lists, and says so.
export async function waitMedicalFile(c: Collector, opts: WaitOptions = {}): Promise<{ polls: number; ready: boolean; ready_after_s?: number; kept?: string }> {
  const toDate = opts.toDate || israelToday(c.now());
  const everyMs = opts.everyMs || 15000;
  const appearMs = opts.appearMs || 2 * 60000;
  const timeoutMs = opts.timeoutMs || 30 * 60000;
  const fromDate = opts.fromDate || FULL_HISTORY;
  const started = c.now();
  let polls = 0;
  let sawPending = false;
  let x: Letter | null = null;
  while (true) {
    polls++;
    const m = await medicalFileLetter(c);
    const listed = m.letter;
    const sameDay = listed && listed.to_date === toDate ? listed : null;
    // Maccabi swaps the order's file into the list's one entry in place, so any other file still listed (an earlier
    // day's, or today's over another range, ordered on the site) means it has not swapped this one in yet: being prepared.
    x = sameDay && coversFrom(sameDay, fromDate) ? sameDay : null;
    const waited = c.now() - started;
    c.progress(Math.min(waited, timeoutMs), timeoutMs,
      x ? 'medical file status ' + x.status : listed ? 'medical file status pending' : 'waiting for the medical file to appear');
    if (x && x.status !== 1) sawPending = true;
    if (x && x.status === 1 && x.link && (sawPending || !opts.mustSeePending || c.now() - (opts.orderedAt ?? started) > appearMs)) break;
    // Checked after the look above, so a file that has just become ready is still taken.
    if (opts.giveUp?.()) {
      const { text, kept } = await keepListed(c);
      await c.problem(MEDICAL_FILE, 'saved without waiting for the file ordered ' + toDate + ', so ' + text + '. ' + exportAgain(toDate));
      return { polls, ready: false, kept };
    }
    // No entry at all, where the order should have put one.
    if (m.http === 200 && !listed && waited > appearMs) {
      const { text, kept } = await keepListed(c);
      await c.problem(MEDICAL_FILE, 'no medical file with to_date ' + toDate + ' after ' + Math.round(waited / 1000) + ' s, so ' + text + '. ' + exportAgain(toDate));
      return { polls, ready: false, kept };
    }
    if (waited > timeoutMs) {
      const after = ' after ' + Math.round(waited / 60000) + ' min';
      if (x) {
        await c.problem(MEDICAL_FILE, 'medical file to ' + toDate + ' still status ' + x.status + after + '; export again later');
        return { polls, ready: false };
      }
      const { text, kept } = await keepListed(c);
      await c.problem(MEDICAL_FILE, 'medical file to ' + toDate + ' not listed' + after + ', so ' + text + '. ' + exportAgain(toDate));
      return { polls, ready: false, kept };
    }
    await c.sleep(everyMs);
  }
  const ready = Math.round((c.now() - started) / 1000);
  c.progress(0, 1, 'letters'); // the download is its own part, as in a run that ordered nothing
  await medicalFilePdf(c, x!, true); // the loop leaves only with x ready
  await letters(c, newCtx()); // letters/list.json; the PDF is saved now, so not fetched twice
  return { polls, ready: true, ready_after_s: ready };
}
