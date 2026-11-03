import { describe, expect, it } from 'vitest';
import { measureQuality, NO_QUALITY, qualitySection, readForQuality } from '../src/extension/shared/quality';
import { exportReadme } from '../src/extension/shared/readme';

const lab = (lab_date: string, more: object) => ({ lab_date, result: 5, message: '', is_messages: '0', min_lim: 1, max_lim: 9, units: 'mg/dl', ...more });
const RELS = [
  'test-results/history/1_a.json',
  'test-results/history/2_b.json',
  'test-results/files/2024-01-05_T1_x.pdf',
  'visit-summaries/details/2025-03-01_V1_y.json',
  'visit-summaries/details/2026-02-01_V2_y.json',
  'visit-summaries/details/2026-03-01_V3_y.json',
  'visit-summaries/list.json',
  'approvals/files/0001-01-01_A1.pdf',
  'referrals/files/undated_R1.pdf',
  'vaccinations/details/12_tetanus.json',
  'README.md',
];
const DOCS = new Map<string, unknown>([
  // The current result is also in other_results: one value.
  ['test-results/history/1_a.json', { data: {
    current_result: lab('2026-01-01', { units: 'mg/dl' }),
    other_results: [lab('2026-01-01', {}), lab('2024-01-01', { units: 'g/l', min_lim: 2, max_lim: 8 }), lab('2023-01-01', { units: ' ' })],
  } }],
  ['test-results/history/2_b.json', { data: {
    current_result: lab('2026-01-01', { result: 0, message: 'NEGATIVE', min_lim: 0, max_lim: 0 }),
    other_results: [lab('2025-01-01', { is_messages: '2', result: 3 }), lab('2024-06-01', { min_lim: 0, max_lim: 0 })],
  } }],
  ['visit-summaries/details/2025-03-01_V1_y.json', { data: { diagnosis: [{ diagnosis_description: null, diagnosis_property1: '0' }] } }],
  ['visit-summaries/details/2026-02-01_V2_y.json', { data: { diagnosis: [{ diagnosis_description: 'ASTHMA' }] } }],
  ['visit-summaries/details/2026-03-01_V3_y.json', { status: 204, data: null }],
]);
const quality = measureQuality(RELS, DOCS);

describe('measureQuality', () => {
  it('reads only the files whose content it counts', () => {
    expect(RELS.filter(readForQuality)).toEqual(RELS.filter((r) => DOCS.has(r)));
  });

  it('counts each lab value once, and what makes one misleading', () => {
    expect(quality.labs).toEqual({ values: 6, measurements: 2, textOnly: 2, noRange: 1, unitsChange: 1, rangeChanges: 1, from: '2023-01-01', to: '2026-01-01' });
  });

  it('counts visits with a summary that names no diagnosis, and those with no summary', () => {
    expect(quality.visits).toEqual({ summaries: 2, noDiagnosis: 1, noSummary: 1 });
  });

  it('takes reach from file names, a placeholder date as no date, and vaccination details as named without one', () => {
    expect(quality.reach).toEqual({
      'test-results': { from: '2024-01-05', to: '2024-01-05' },
      'visit-summaries': { from: '2025-03-01', to: '2026-03-01' },
    });
    expect(quality.undated).toBe(2);
  });

  it('survives a file that did not parse or a series with nothing in it', () => {
    const q = measureQuality(RELS, new Map([['test-results/history/1_a.json', undefined], ['test-results/history/2_b.json', { data: null }]]));
    expect(q.labs).toEqual(NO_QUALITY.labs);
    expect(q.labs.values).toBe(0);
  });
});

describe('qualitySection', () => {
  it('says what it found, and that it does not judge the records', () => {
    const md = qualitySection(quality);
    expect(md).toContain('not whether they are right');
    expect(md).toContain('6 values of 2 measurements, 2023-01-01 to 2026-01-01, 2 answered only in text and 1 with no range in `min_lim`–`max_lim`.');
    expect(md).toContain('1 measurement changes units over time, and 1 measurement changes range over time.');
    expect(md).toContain('1 of 2 with a summary name no diagnosis in `diagnosis[]`, and 1 visit has no summary.');
    expect(md).toContain('`test-results/` 2024-01-05 to 2024-01-05; `visit-summaries/` 2025-03-01 to 2026-03-01.');
    expect(md).toContain('With no date in the file name: 2 files.');
  });

  it('leaves out what it did not find', () => {
    const md = qualitySection({ ...NO_QUALITY, reach: { letters: { from: '2020-01-01', to: '2021-01-01' } } });
    expect(md).not.toContain('Lab values');
    expect(md).not.toContain('Visits');
    expect(qualitySection(NO_QUALITY)).toBe('Nothing to count: no lab values, visits or dated records.');
  });

  it('is a section of the README, after what failed and before the lab fields', () => {
    const md = exportReadme('2026-09-18', { 'test-results': 1 }, null, [], { version: '1', layout: 1, startedAt: '2026-09-18T06:00:00.000Z', dev: false }, [], quality);
    expect(md).toContain('6 values of 2 measurements');
    expect(md.indexOf('## What this export failed')).toBeLessThan(md.indexOf("## This export's records in numbers"));
    expect(md.indexOf("## This export's records in numbers")).toBeLessThan(md.indexOf('## Lab values'));
  });
});
