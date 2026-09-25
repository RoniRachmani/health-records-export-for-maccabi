import { describe, expect, it } from 'vitest';
import { DESCRIPTIONS, formatBytes, formatDuration, groupProblems, STAGES, stageStates, statsText, stepText, viewKey, type UiFlags } from '../src/extension/popup/model';
import { LABELS, PLAN, type RunState, type StateReply } from '../src/extension/shared/state';

describe('STAGES', () => {
  it('covers every plan step, in plan order, each step’s lines together', () => {
    const steps = STAGES.flatMap((s) => s.steps).filter((step, i, all) => step !== all[i - 1]);
    expect(steps).toEqual([...PLAN]);
  });

  it('labels each line with one of its steps’ LABELS entries, so errors and problems name it the same way', () => {
    for (const stage of STAGES.filter((s) => !s.parts)) expect(stage.steps.map((step) => LABELS[step])).toContain(stage.label);
  });

  it('splits a step only into single-step lines that name its parts', () => {
    for (const stage of STAGES.filter((s) => s.parts)) expect(stage.steps).toHaveLength(1);
  });
});

describe('stageStates', () => {
  const at = (step: (typeof PLAN)[number], part?: string) =>
    ({ next: PLAN.indexOf(step), detail: part === undefined ? undefined : LABELS[step] + ': ' + part });

  it('starts with the first stage current', () => {
    const s = stageStates({ next: 0 });
    expect(s[0]).toBe('current');
    expect(s.slice(1).every((x) => x === 'pending')).toBe(true);
  });

  it('keeps a grouped stage current through all its steps', () => {
    const order = STAGES.findIndex((s) => s.label === 'Ordering your medical file');
    for (const step of ['openLegacyPage', 'orderMedicalFile'] as const) {
      const s = stageStates(at(step));
      expect(s[order]).toBe('current');
      expect(s.slice(order + 1).every((x) => x === 'pending')).toBe(true);
    }
  });

  it('moves along a split step’s lines as its parts run', () => {
    const tests = STAGES.findIndex((s) => s.label === 'Test results');
    const histories = STAGES.findIndex((s) => s.label === 'Lab histories');
    expect(stageStates(at('testResults'))[tests]).toBe('current');
    expect(stageStates(at('testResults', 'test results'))[tests]).toBe('current');
    const later = stageStates(at('testResults', 'lab histories'));
    expect([later[tests], later[histories]]).toEqual(['done', 'current']);
    // A part no line names stays on the step's first line.
    expect(stageStates(at('testResults', 'imaging reports'))[tests]).toBe('current');
    const details = STAGES.findIndex((s) => s.label === 'Your details and doctor');
    for (const part of [undefined, 'allergies', 'appointments', 'requests']) expect(stageStates(at('emptySections', part))[details]).toBe('current');
  });

  it('marks everything but saving done at the save step, and everything done after it', () => {
    expect(stageStates(at('save'))).toEqual([...Array(STAGES.length - 1).fill('done'), 'current']);
    expect(stageStates({ next: PLAN.length }).every((x) => x === 'done')).toBe(true);
  });
});

describe('formatDuration', () => {
  it('rounds to minutes and hours', () => {
    expect(formatDuration(0)).toBe('under a minute');
    expect(formatDuration(59_999)).toBe('under a minute');
    expect(formatDuration(NaN)).toBe('under a minute');
    expect(formatDuration(60_000)).toBe('1 min');
    expect(formatDuration(6.4 * 60_000)).toBe('6 min');
    expect(formatDuration(59.6 * 60_000)).toBe('1 h');
    expect(formatDuration(72 * 60_000)).toBe('1 h 12 min');
  });
});

describe('formatBytes', () => {
  it('uses decimal units, with one decimal below 10', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1000)).toBe('1.0 KB');
    expect(formatBytes(227_400)).toBe('227 KB');
    expect(formatBytes(999_960)).toBe('1.0 MB');
    expect(formatBytes(3_240_000)).toBe('3.2 MB');
    expect(formatBytes(9_960_000)).toBe('10 MB');
    expect(formatBytes(1_500_000_000)).toBe('1.5 GB');
  });
});

describe('statsText and stepText', () => {
  const base: RunState = {
    id: 'r1', status: 'running', tabId: 1, startedAt: '2026-01-01T00:00:00Z', next: PLAN.indexOf('testResults'),
    ctx: {} as RunState['ctx'], stepDone: 0, stepTotal: 0, percent: 10,
  };
  const start = Date.parse(base.startedAt);

  it('shows files, size and elapsed time once known', () => {
    expect(statsText(base, start + 20_000)).toBe('just started');
    expect(statsText({ ...base, fileCount: 1, byteCount: 512 }, start + 20_000)).toBe('1 file · 512 B · just started');
    expect(statsText({ ...base, fileCount: 1234, byteCount: 3_240_000 }, start + 72 * 60_000)).toBe('1,234 files · 3.2 MB · 1 h 12 min elapsed');
  });

  it('describes what the current part of the step collects', () => {
    expect(stepText({ ...base, detail: 'Test results' })).toEqual({ title: 'Test results', detail: 'Reading your list of tests' });
    expect(stepText({ ...base, detail: 'Test results: test results' })).toEqual({ title: 'Test results', detail: 'Downloading each test result and its PDF' });
    expect(stepText({ ...base, detail: 'Test results: lab histories' })).toEqual({ title: 'Lab histories', detail: 'Saving how each lab value changed over time' });
    expect(stepText({ ...base, next: PLAN.indexOf('referrals'), detail: 'Referrals: referrals' }))
      .toEqual({ title: 'Referrals', detail: 'Downloading each referral as a PDF' });
    expect(stepText({ ...base, next: PLAN.indexOf('approvals'), detail: 'Approvals: approvals' }).detail).toBe('Downloading each approval as a PDF');
    expect(stepText({ ...base, next: PLAN.indexOf('infoPages'), detail: 'Information pages: information pages' }).detail).toBe('Downloading each page as a PDF');
    const waiting = { ...base, next: PLAN.indexOf('waitMedicalFile') };
    expect(stepText({ ...waiting, detail: 'Collecting your medical file: medical file status 2' }).detail).toBe('Your medical file is being prepared');
    expect(stepText({ ...base, next: PLAN.length })).toEqual({ title: '', detail: '' });
  });

  it('falls back to the collector\'s own name for a part it has no description for', () => {
    expect(stepText({ ...base, detail: 'Test results: imaging reports' }).detail).toBe('Imaging reports');
    expect(stepText({ ...base, detail: 'Test results: Test results' }).detail).toBe('');
  });

  it('has a one-line description for the start of every step', () => {
    for (const step of PLAN) {
      expect(DESCRIPTIONS[step]['']).toBeTruthy();
      for (const text of Object.values(DESCRIPTIONS[step])) expect(text.length).toBeLessThanOrEqual(48);
    }
  });
});

describe('groupProblems', () => {
  const p = (where: string, what = 'HTTP 500') => ({ where, what, at: '2026-01-01T00:00:00Z' });

  it('groups by folder with friendly names, in first-seen order', () => {
    const groups = groupProblems([p('visit-summaries/details/1.json'), p('test-results/files/a.pdf'), p('visit-summaries/files/2.pdf')]);
    expect(groups.map((g) => g.label)).toEqual(['Visit summaries', 'Test results']);
    expect(groups[0].items.map((x) => x.where)).toEqual(['visit-summaries/details/1.json', 'visit-summaries/files/2.pdf']);
  });

  it('names failed steps and keeps unknown folders as they are', () => {
    const groups = groupProblems([p('purchases', 'boom'), p('something-new/x.json'), p('letters/files/a.pdf'), p('letters'), p('medical-file')]);
    expect(groups.map((g) => g.label)).toEqual(['Medication purchases', 'something-new', 'Letters', 'Full medical file']);
    expect(groups[2].items).toHaveLength(2);
  });
});

describe('viewKey', () => {
  const ui: UiFlags = { busy: null, confirm: null, stopping: false, error: '' };
  const run: RunState = {
    id: 'r1', status: 'running', tabId: 1, startedAt: '2026-01-01T00:00:00Z', next: 1,
    ctx: {} as RunState['ctx'], stepDone: 1, stepTotal: 10, percent: 10, detail: 'Test results',
  };
  const st: StateReply = { run, noticeAccepted: true, tab: { onMaccabi: true, loggedIn: true, tabId: 1 } };

  it('ignores progress', () => {
    const later = { ...st, run: { ...run, next: 5, stepDone: 7, stepTotal: 9, percent: 55, detail: 'Referrals: approvals' } };
    expect(viewKey(later, ui)).toBe(viewKey(st, ui));
  });

  it('changes with status, run, confirm, busy, stopping and error', () => {
    const k = viewKey(st, ui);
    expect(viewKey({ ...st, run: { ...run, status: 'paused_hidden' } }, ui)).not.toBe(k);
    expect(viewKey({ ...st, run: { ...run, id: 'r2' } }, ui)).not.toBe(k);
    expect(viewKey(st, { ...ui, confirm: 'cancel' })).not.toBe(k);
    expect(viewKey(st, { ...ui, busy: 'cancel' })).not.toBe(k);
    expect(viewKey(st, { ...ui, stopping: true })).not.toBe(k);
    expect(viewKey(st, { ...ui, error: 'x' })).not.toBe(k);
    expect(viewKey({ ...st, run: null }, ui)).not.toBe(k);
  });

  it('changes when the notice is accepted', () => {
    const idle = { ...st, run: null };
    expect(viewKey({ ...idle, noticeAccepted: false }, ui)).not.toBe(viewKey(idle, ui));
  });
});
