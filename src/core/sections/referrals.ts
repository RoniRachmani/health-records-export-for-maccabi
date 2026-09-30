import type { Collector } from '../collector';
import type { Ctx, Json } from '../types';
import { END_DATE, iso, safe, shortHash, stem, title, titleOf } from '../util';

// Three separate API resources (/referrals, /approvals, /tutorials), so three sibling folders and
// three steps: each holds one kind of record, and no file needs a type prefix to say which kind it
// is. Nothing is shared between them but the date range, so the popup can show three sections.
const REFERRAL_TITLE = ['referral_type_name', 'specialization_description', 'title_name', 'practitioner_full_name', 'description'];

/**
 * A referral's title: its kind, made specific by displaying_name where that is the kind and more.
 * title_name says only "התייעצות מומחה" (a specialist consultation) for every specialist, and
 * displaying_name "התייעצות מומחה- אורולוגיה" (measured 2026-09-30); but displaying_name can also be
 * vaguer ("בדיקות מעבדה" for a "בדיקה מיקולוגית"), and then the kind stays.
 */
export function referralTitle(x: Json): string {
  const kind = titleOf(x, REFERRAL_TITLE);
  const shown = title(x && x.displaying_name);
  return kind && shown.length > kind.length && shown.startsWith(kind) ? shown : kind;
}
const APPROVAL_TITLE = ['title_name', 'specialization_description', 'practitioner_full_name'];
const INFO_TITLE = ['display_text', 'specialization', 'practitioner_name'];
const RANGE = '?from_date=1900-01-01&to_date=' + END_DATE;

export async function referrals(c: Collector, _ctx: Ctx): Promise<void> {
  const ref = await c.getSave('referrals/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/referrals' + RANGE);
  const pdfBase = c.apiUrl('MedicalFileAPI/v1/members/0/{mid}/pdf');
  const list: Json[] = (ref.r.data && ref.r.data.referrals) || [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    c.progress(i, list.length, 'referrals', { done: i, total: list.length });
    if (!x.pdf_link) continue;
    await c.pdfIfMissing('referrals/files/' + stem(iso(x.referral_date), safe(x.referral_id), referralTitle(x)) + '.pdf',
      pdfBase + '?path=' + x.pdf_link + '&timestamp=' + x.timestamp + '&hash=' + x.hash);
  }
}

export async function approvals(c: Collector, _ctx: Ctx): Promise<void> {
  const ap = await c.getSave('approvals/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/approvals' + RANGE);
  const pdfBase = c.apiUrl('MedicalFileAPI/v1/members/0/{mid}/pdf');
  const list: Json[] = (ap.r.data && ap.r.data.approval) || [];
  // Two approvals can agree on every field but the signed pdf_link: a consultant's answers to two
  // referring doctors on one day, two documents (measured 2026-09-30). The second of a kind is -2.
  const seen: Record<string, number> = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    c.progress(i, list.length, 'approvals', { done: i, total: list.length });
    if (!a.pdf_link) continue;
    let ak = await shortHash([a.title_name, a.practitioner_full_name, a.specialization_description, a.approval_date, a.approval_date_from, a.approval_date_to, a.approval_type_code]);
    seen[ak] = (seen[ak] || 0) + 1;
    if (seen[ak] > 1) ak += '-' + seen[ak];
    await c.pdfIfMissing('approvals/files/' + stem(iso(a.approval_date), ak, titleOf(a, APPROVAL_TITLE)) + '.pdf',
      pdfBase + '?path=' + a.pdf_link + '&timestamp=' + a.timestamp + '&hash=' + a.hash);
  }
}

export async function infoPages(c: Collector, _ctx: Ctx): Promise<void> {
  const tu = await c.getSave('info-pages/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/tutorials' + RANGE);
  const list: Json[] = (tu.r.data && tu.r.data.tutorials) || [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    c.progress(i, list.length, 'information pages', { done: i, total: list.length });
    if (!t.url) continue;
    const tk = await shortHash([t.session_datetime, t.practitioner_name, t.specialization, t.type_id, t.display_text]);
    await c.pdfIfMissing('info-pages/files/' + stem(iso(t.session_datetime), tk, titleOf(t, INFO_TITLE)) + '.pdf',
      c.apiUrl('MedicalFileAPI/v2/members/0/{mid}/pdf') + '?url=' + t.url + '&timestamp=' + t.timestamp + '&hash=' + t.hash);
  }
}
