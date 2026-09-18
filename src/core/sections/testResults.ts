import { changed, type Collector } from '../collector';
import type { Ctx, Json } from '../types';
import { iso, safe, shortHash, stem, title, titleOf } from '../util';

// A test's readable name. The list item's own type (lab_result, imaging_study, ...) is part of
// the id, not the title, so it is not repeated here.
const TEST_TITLE = ['test_name', 'test_desc', 'test_description', 'title', 'description', 'name'];

export async function testResults(c: Collector, _ctx: Ctx): Promise<void> {
  const list = await c.getSave('test-results/list.json', 'POST', 'TestResultsAPI/v1/members/0/{mid}/tests', { members: [], categories: [] });
  await c.getSave('test-results/latest-lab-results.json', 'GET', 'TestResultsAPI/v1/members/0/{mid}/getlatestlabresults');
  await c.getSave('test-results/followed-counter.json', 'GET', 'TestResultsAPI/v1/members/0/{mid}/followed/counter');
  const tests: Json[] = (list.r.data && list.r.data.tests) || [];
  const latestDate: Record<string, string> = {};
  const desc: Record<string, Json> = {};
  const seen: Record<string, boolean> = {};
  const touched: Record<string, boolean> = {};
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    c.progress(i, tests.length * 2, 'test results');
    // The API gives a test no single id: the pair (request_id, type) is what identifies it.
    let name = stem(iso(t.execute_date), safe(t.request_id) + '-' + safe(t.type), titleOf(t, TEST_TITLE));
    if (seen[name]) name += '-' + (await shortHash([t.doc_id, t.execute_date, t.request_id, t.type]));
    seen[name] = true;
    const d = await c.getSave('test-results/details/' + name + '.json', 'POST', 'TestResultsAPI/v1/members/0/{mid}/getresultsbyid',
      { request_id: String(t.request_id), doc_id: t.doc_id, logged_user_gender: c.session.gender, current_user_gender: c.session.gender },
      { request_id: String(t.request_id), type: t.type });
    const groups: Json[] = (d.r.data && d.r.data.results) || [];
    groups.forEach((g) => {
      (g.group_values || []).forEach((v: Json) => {
        if (!v.test_id || !v.lab_date) return;
        if (!latestDate[v.test_id] || v.lab_date > latestDate[v.test_id]) latestDate[v.test_id] = v.lab_date;
        desc[v.test_id] = v.test_desc;
        if (changed(d.result)) touched[v.test_id] = true;
      });
    });
    // The lobby's view button opens this link from the list item's own
    // time_stamp/hash (hash already URL-encoded); no click is needed.
    if (t.result_files && t.type !== 'imaging_study') {
      const mid = c.session.mid;
      await c.pdfIfMissing('test-results/files/' + name + '.pdf',
        c.apiUrl('TestResultsAPI/pdf/openfile') + '?memberidcode=0&memberid=' + mid + '&data=' + encodeURIComponent(t.doc_id) +
        '&t=' + t.time_stamp + '&hash=' + t.hash + '&memberIdForHeader=' + mid + '&memberIdCodeForHeader=0', {});
    }
  }
  // One history per measurement type. The server returns the whole series
  // whichever date is asked for; asking for the latest keeps the file stable.
  // A series only changes when a visit carrying that test changed, so the
  // rest are skipped (this also makes an interrupted run resume cheaply).
  const ids = Object.keys(latestDate).sort();
  for (let j = 0; j < ids.length; j++) {
    const tid = ids[j];
    c.progress(tests.length + Math.round((j * tests.length) / ids.length), tests.length * 2, 'lab histories');
    const rel = 'test-results/history/' + stem(safe(tid), title(desc[tid])) + '.json';
    if (!touched[tid] && (await c.exists(rel))) continue;
    await c.getSave(rel, 'GET',
      'TestResultsAPI/v1/compare/0/{mid}/compare?test_id=' + encodeURIComponent(tid) + '&date_of_result=' + encodeURIComponent(latestDate[tid]),
      undefined, { test_id: tid, test_desc: desc[tid], date_of_result: latestDate[tid] });
  }
}
