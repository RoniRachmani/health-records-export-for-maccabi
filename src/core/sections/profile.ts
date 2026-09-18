import type { Collector } from '../collector';
import type { Ctx, Json } from '../types';
import { iso, today } from '../util';

export async function profileAndDoctors(c: Collector, ctx: Ctx): Promise<void> {
  const m = await c.getSave('profile/member.json', 'GET', 'MainAppAPI/v1/members/0/{mid}');
  ctx.birthDate = m.r.data && m.r.data.birth_date ? iso(m.r.data.birth_date) : null;
  c.progress(1, 6);
  await c.getSave('profile/entitlement.json', 'GET', 'DirectorshipAPI/v1/members/0/{mid}/entitlement');
  await c.getSave('profile/insurance-seniority.json', 'GET', 'DirectorshipAPI/v1/members/0/{mid}/insurance/seniority');
  c.progress(3, 6);
  const ap = await c.getSave('my-doctor/assigned-practitioners.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/assigned_practitioners');
  await c.getSave('my-doctor/eligibilities.json', 'GET', 'MedicalFileAPI/v1/practitioner_affiliation/0/{mid}/eligibilities');
  c.progress(5, 6);
  const practitioners: Json[] = Array.isArray(ap.r.data) ? ap.r.data : [];
  if (practitioners.length) {
    await c.getSave('profile/providers.json', 'POST', 'MainAppAPI/v1/members/0/{mid}/providers', {
      retrieval_type: 5,
      service_providers: practitioners.map((p) => ({ object_type: 'S', employee_id: p.employee_id, object_id: p.position_id })),
    });
  }
  // Needs a full timestamp; an empty or date-only value returns 204.
  const asc = await c.api('GET', 'AppointmentOrderAPI/v1/members/0/{mid}/providers/ascribed?requested_association_date=' + today(c.now()) + 'T00:00:00');
  if (asc.status === 200 && asc.data) {
    await c.save('my-doctor/ascribed.json', c.rec('GET', 'AppointmentOrderAPI/v1/members/0/{mid}/providers/ascribed', asc, { query: 'requested_association_date=<today>T00:00:00' }));
  }
  c.progress(6, 6);
}
