import type { Collector } from '../collector';
import type { Ctx, Json } from '../types';
import { iso, safe, stem, titleOf } from '../util';

// The visits list names the speciality (service_name) and the practitioner; the speciality says more.
const VISIT_TITLE = ['service_name', 'service_provider_name', 'provider_name', 'practitioner_name', 'specialization', 'specialization_description', 'clinic_name', 'visit_type_name', 'department_name'];

export async function visits(c: Collector, _ctx: Ctx): Promise<void> {
  // Server returns the last 12 months only; older visit files stay on disk.
  const real = await c.api('POST', 'AppointmentOrderAPI/v1/members/0/{mid}/visits/history', { members: [{ member_id_code: '0', member_id: c.session.mid }] });
  if (real.status !== 200) {
    await c.problem('visit-summaries/list.json', 'HTTP ' + real.status);
    return;
  }
  await c.save('visit-summaries/list.json', c.rec('POST', 'AppointmentOrderAPI/v1/members/0/{mid}/visits/history', real, { request_body: { members: [{ member_id_code: '0', member_id: '{mid}' }] } }));
  const results: Json[] = (real.data && real.data.results) || [];
  for (let i = 0; i < results.length; i++) {
    const v = results[i];
    c.progress(i, results.length, 'visits');
    const name = stem(iso(v.appointment_date), safe(v.appointment_id), titleOf(v, VISIT_TITLE));
    const d = await c.getSave('visit-summaries/details/' + name + '.json', 'GET',
      'AppointmentOrderAPI/v1/members/0/{mid}/visits/' + v.appointment_id, undefined, { appointment_date: v.appointment_date });
    if (v.has_summery_file) {
      const rel = 'visit-summaries/files/' + name + '.pdf';
      // The summary button opens this link from the details response; the
      // path must be URL-encoded (raw it returns 400), the hash already is.
      const dd = d.r.data;
      if (!dd || !dd.visit_summary_pdf_link) {
        if (!(await c.exists(rel))) await c.problem(rel, 'visit details have no visit_summary_pdf_link');
      } else {
        await c.pdfIfMissing(rel, c.apiUrl('AppointmentOrderAPI/v1/members/0/{mid}/pdf') + '?path=' + encodeURIComponent(dd.visit_summary_pdf_link) +
          '&timestamp=' + dd.timestamp + '&hash=' + dd.hash, {});
      }
    }
  }
}
