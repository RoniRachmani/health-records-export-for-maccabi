/* What the export's README says of this export's own records: how much of them is in the form a reader would
   assume. The README's fixed text says what a misleading value means; these counts say how much of it this member
   has, so an assistant knows whether a caveat touches one result or half of them. They measure a record's form,
   never whether it is right, and read only what was already collected. */
import { countOf } from '../../core/util';
import type { Json } from '../../core/types';

const HISTORY = /^test-results\/history\/[^/]+\.json$/;
const VISIT = /^visit-summaries\/details\/[^/]+\.json$/;
const RECORD = /^([^/]+)\/(?:files|details)\/([^/]+)$/;
const DATED = /^(\d{4}-\d{2}-\d{2})_/;
const DAY = /^\d{4}-\d{2}-\d{2}/;
// Named by what they hold, by design: no date is missing from them.
const BY_NAME = /^vaccinations\/details\//;
// A date that was never set is not how far back a section reaches.
const PLACEHOLDER = /^(?:0001|1900)-/;

export interface Quality {
  labs: { values: number; measurements: number; textOnly: number; noRange: number; unitsChange: number; rangeChanges: number; from: string; to: string };
  visits: { summaries: number; noDiagnosis: number; noSummary: number };
  /** The earliest and latest record date in each folder's file names, by folder. Lab values carry their own: history files have no date. */
  reach: Record<string, { from: string; to: string }>;
  undated: number;
}

export const NO_QUALITY: Quality = {
  labs: { values: 0, measurements: 0, textOnly: 0, noRange: 0, unitsChange: 0, rangeChanges: 0, from: '', to: '' },
  visits: { summaries: 0, noDiagnosis: 0, noSummary: 0 },
  reach: {},
  undated: 0,
};

/** The files measureQuality reads. Everything else it needs is in the file names. */
export function readForQuality(rel: string): boolean {
  return HISTORY.test(rel) || VISIT.test(rel);
}

const blank = (v: unknown) => v === null || v === undefined || ['', '0'].includes(String(v).trim());

function measureLabs(q: Quality, doc: Json): void {
  const data = doc.data || {};
  // One measurement's series: a date that is both current and in other_results is one value.
  const byDate = new Map<string, Json>();
  for (const v of [data.current_result, ...(Array.isArray(data.other_results) ? data.other_results : [])]) {
    if (v && typeof v === 'object') byDate.set(String(v.lab_date), v);
  }
  if (!byDate.size) return;
  const units = new Set<string>();
  const ranges = new Set<string>();
  q.labs.measurements++;
  for (const v of byDate.values()) {
    q.labs.values++;
    const day = String(v.lab_date).match(DAY)?.[0];
    if (day && !PLACEHOLDER.test(day)) {
      if (!q.labs.from || day < q.labs.from) q.labs.from = day;
      if (day > q.labs.to) q.labs.to = day;
    }
    const text = v.is_messages === '2' || (Number(v.result) === 0 && !blank(v.message));
    const ranged = Number(v.min_lim) !== 0 || Number(v.max_lim) !== 0;
    if (text) q.labs.textOnly++;
    else if (!ranged) q.labs.noRange++;
    if (!blank(v.units)) units.add(String(v.units).trim());
    if (ranged) ranges.add(v.min_lim + '-' + v.max_lim);
  }
  if (units.size > 1) q.labs.unitsChange++;
  if (ranges.size > 1) q.labs.rangeChanges++;
}

function measureVisit(q: Quality, doc: Json): void {
  if (!doc.data) {
    q.visits.noSummary++;
    return;
  }
  q.visits.summaries++;
  const diagnoses = Array.isArray(doc.data.diagnosis) ? doc.data.diagnosis : [];
  if (!diagnoses.some((d: Json) => d && Object.values(d).some((v) => !blank(v)))) q.visits.noDiagnosis++;
}

/** The counts for one export: every file's path, and the parsed files readForQuality names. */
export function measureQuality(rels: readonly string[], docs: ReadonlyMap<string, Json | undefined>): Quality {
  const q = structuredClone(NO_QUALITY);
  for (const rel of rels) {
    const doc = docs.get(rel);
    if (doc && HISTORY.test(rel)) measureLabs(q, doc);
    if (doc && VISIT.test(rel)) measureVisit(q, doc);
    const [, folder, name] = rel.match(RECORD) ?? [];
    if (!folder || BY_NAME.test(rel)) continue;
    const date = name.match(DATED)?.[1];
    if (!date || PLACEHOLDER.test(date)) {
      q.undated++;
      continue;
    }
    const seen = q.reach[folder];
    q.reach[folder] = { from: !seen || date < seen.from ? date : seen.from, to: !seen || date > seen.to ? date : seen.to };
  }
  return q;
}

/** The README's section on this export's own records. Only what it found: a count of nothing is left out. */
export function qualitySection({ labs, visits, reach, undated }: Quality): string {
  const lines: string[] = [];
  if (labs.values) {
    const notes = [
      labs.textOnly && labs.textOnly + ' answered only in text',
      labs.noRange && labs.noRange + ' with no range in `min_lim`–`max_lim`',
    ].filter(Boolean);
    const changes = [
      labs.unitsChange && countOf(labs.unitsChange, 'measurement changes', 'measurements change') + ' units over time',
      labs.rangeChanges && countOf(labs.rangeChanges, 'measurement changes', 'measurements change') + ' range over time',
    ].filter(Boolean);
    lines.push('- Lab values in `test-results/history/`: ' + countOf(labs.values, 'value', 'values') + ' of ' +
      countOf(labs.measurements, 'measurement', 'measurements') +
      (labs.from ? ', ' + labs.from + ' to ' + labs.to : '') + (notes.length ? ', ' + notes.join(' and ') : '') + '.' +
      (changes.length ? ' ' + changes.join(', and ') + '.' : ''));
  }
  if (visits.summaries || visits.noSummary) {
    lines.push('- Visits in `visit-summaries/details/`: ' + visits.noDiagnosis + ' of ' + visits.summaries +
      ' with a summary name no diagnosis in `diagnosis[]`' +
      (visits.noSummary ? ', and ' + countOf(visits.noSummary, 'visit has', 'visits have') + ' no summary' : '') + '.');
  }
  const dated = Object.keys(reach).sort().map((f) => '`' + f + '/` ' + reach[f].from + ' to ' + reach[f].to);
  if (dated.length) lines.push('- Dated records, by file name: ' + dated.join('; ') + '.');
  if (undated) lines.push('- With no date in the file name: ' + countOf(undated, 'file', 'files') + '.');
  if (!lines.length) return 'Nothing to count: no lab values, visits or dated records.';
  return 'Counted from these files. This says how readable the records are, not whether they are right.\n\n' + lines.join('\n');
}
