import type { Collector } from '../collector';
import type { Ctx, Json } from '../types';
import { END_DATE, iso, safe, shortHash, stem, titleOf } from '../util';

// Three separate API resources (/referrals, /approvals, /tutorials), so three sibling folders:
// each holds one kind of record, and no file needs a type prefix to say which kind it is.
const REFERRAL_TITLE = ['referral_type_name', 'specialization_description', 'title_name', 'practitioner_full_name', 'description'];
const APPROVAL_TITLE = ['title_name', 'specialization_description', 'practitioner_full_name'];
const INFO_TITLE = ['display_text', 'specialization', 'practitioner_name'];

export async function referrals(c: Collector, _ctx: Ctx): Promise<void> {
  const range = '?from_date=1900-01-01&to_date=' + END_DATE;
  const ref = await c.getSave('referrals/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/referrals' + range);
  const pdfBase = c.apiUrl('MedicalFileAPI/v1/members/0/{mid}/pdf');
  const list: Json[] = (ref.r.data && ref.r.data.referrals) || [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    c.progress(i, list.length * 3, 'referrals');
    if (!x.pdf_link) continue;
    await c.pdfIfMissing('referrals/files/' + stem(iso(x.referral_date), safe(x.referral_id), titleOf(x, REFERRAL_TITLE)) + '.pdf',
      pdfBase + '?path=' + x.pdf_link + '&timestamp=' + x.timestamp + '&hash=' + x.hash);
  }
  const ap = await c.getSave('approvals/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/approvals' + range);
  const alist: Json[] = (ap.r.data && ap.r.data.approval) || [];
  for (let j = 0; j < alist.length; j++) {
    const a = alist[j];
    c.progress(list.length + Math.round((j * list.length) / alist.length), list.length * 3, 'approvals');
    if (!a.pdf_link) continue;
    const ak = await shortHash([a.title_name, a.practitioner_full_name, a.specialization_description, a.approval_date, a.approval_date_from, a.approval_date_to, a.approval_type_code]);
    await c.pdfIfMissing('approvals/files/' + stem(iso(a.approval_date), ak, titleOf(a, APPROVAL_TITLE)) + '.pdf',
      pdfBase + '?path=' + a.pdf_link + '&timestamp=' + a.timestamp + '&hash=' + a.hash);
  }
  const tu = await c.getSave('info-pages/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/tutorials' + range);
  const tlist: Json[] = (tu.r.data && tu.r.data.tutorials) || [];
  for (let k = 0; k < tlist.length; k++) {
    const t = tlist[k];
    c.progress(list.length * 2 + Math.round((k * list.length) / tlist.length), list.length * 3, 'information pages');
    if (!t.url) continue;
    const tk = await shortHash([t.session_datetime, t.practitioner_name, t.specialization, t.type_id, t.display_text]);
    await c.pdfIfMissing('info-pages/files/' + stem(iso(t.session_datetime), tk, titleOf(t, INFO_TITLE)) + '.pdf',
      c.apiUrl('MedicalFileAPI/v2/members/0/{mid}/pdf') + '?url=' + t.url + '&timestamp=' + t.timestamp + '&hash=' + t.hash);
  }
}
