import { changed, type Collector } from '../collector';
import type { Ctx, Json } from '../types';
import { safe, stem, titleOf } from '../util';
import { reportPdf } from './medications';

const GROUP_TITLE = ['vaccine_group_name', 'vaccine_group_description', 'group_name', 'description', 'name'];

export async function vaccinations(c: Collector, ctx: Ctx): Promise<void> {
  let changedAny = false;
  const g = await c.getSave('vaccinations/list.json', 'GET', 'MedicalFileAPI/v1/members/0/{mid}/vaccinations_grouped');
  changedAny = changed(g.result);
  const groups: Json[] = (g.r.data && g.r.data.timeline) || [];
  if (!ctx.birthDate && groups.length) await c.problem('vaccinations/details', 'no birth date from profile; per-group details skipped');
  for (let i = 0; ctx.birthDate && i < groups.length; i++) {
    c.progress(i, groups.length + 1, 'vaccinations');
    const code = groups[i].vaccine_group_code;
    const d = await c.getSave('vaccinations/details/' + stem(safe(code), titleOf(groups[i], GROUP_TITLE)) + '.json', 'GET',
      'MedicalFileAPI/v1/members/0/{mid}/vaccinations?vaccine_group_code=' + code + '&birth_date=' + ctx.birthDate + 'T00:00:00',
      undefined, { vaccine_group_code: code });
    changedAny = changedAny || changed(d.result);
  }
  await c.getSave('vaccinations/flu-eligibility.json', 'GET', 'AppointmentOrderAPI/v1/members/0/{mid}/eligibility/vaccines/flu');
  if (changedAny || !(await c.exists('vaccinations/vaccination-booklet-report.json'))) {
    await reportPdf(c, 'vaccinations/vaccination-booklet-report.json', 'MedicalFileAPI/v1/members/0/{mid}/vaccination/certificates/report', 'vaccinations/files/vaccination-booklet-report.pdf');
  }
}
