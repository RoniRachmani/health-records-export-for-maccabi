import { describe, expect, it } from 'vitest';
import {
  countText, currentStage, DESCRIPTIONS, formatBytes, formatDuration, groupProblems, hintText, STAGES, stageFileCounts, stageSpan, stageStates, statsText,
  stepText, viewKey, waitingForFile, type UiFlags,
} from '../src/extension/popup/model';
import { LABELS, PLAN, percentOf, WEIGHTS, type RunState, type StateReply } from '../src/extension/shared/state';

describe('STAGES', () => {
  it('covers every plan step, in plan order, each step’s lines together', () => {
    const steps = STAGES.flatMap((s) => s.steps).filter((step, i, all) => step !== all[i - 1]);
    expect(steps).toEqual([...PLAN]);
  });

  it('labels each line with one of its steps’ LABELS entries, so errors and problems name it the same way', () => {
    for (const stage of STAGES.filter((s) => !s.parts)) expect(stage.steps.map((step) => LABELS[step])).toContain(stage.label);
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
    expect(stageStates(at('returnToSonline'))[tests]).toBe('current');
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

describe('stageSpan', () => {
  const line = (label: string) => STAGES.findIndex((s) => s.label === label);

  it('spans the lines end to end, from 0 to 100', () => {
    expect(stageSpan(0).start).toBe(0);
    expect(stageSpan(STAGES.length - 1).end).toBeCloseTo(100);
    for (let i = 1; i < STAGES.length; i++) expect(stageSpan(i).start).toBeCloseTo(stageSpan(i - 1).end);
  });

  it('agrees with percentOf where each line starts, and splits test results in two halves', () => {
    for (let i = 0; i < STAGES.length; i++) {
      const step = PLAN.findIndex((s) => STAGES[i].steps.includes(s));
      // A line on the second half of a split step starts halfway through it.
      const half = STAGES.findIndex((s) => s.steps.includes(PLAN[step])) < i;
      // percentOf rounds to a whole percent.
      expect(Math.abs(stageSpan(i).start - percentOf(step, half ? 1 : 0, half ? 2 : 1)), STAGES[i].label).toBeLessThanOrEqual(0.5);
    }
    // The spec's numbers: a total weight of 109, lab histories from 36.7% to 57.8%, and 38 of 61 lab histories at 50%.
    expect(PLAN.reduce((a, s) => a + WEIGHTS[s], 0)).toBe(109);
    expect(stageSpan(line('Lab histories')).start).toBeCloseTo(36.70, 2);
    expect(stageSpan(line('Lab histories')).end).toBeCloseTo(57.80, 2);
    const tests = 61;
    const at = percentOf(PLAN.indexOf('testResults'), tests + Math.round((38 * tests) / 61), tests * 2);
    expect(at).toBe(50);
    expect(at).toBeGreaterThan(stageSpan(line('Lab histories')).start);
    expect(at).toBeLessThan(stageSpan(line('Lab histories')).end);
  });

  it('puts the run inside the current line’s span all the way through each step', () => {
    for (let next = 0; next < PLAN.length; next++) {
      const parts = STAGES.filter((s) => s.steps.includes(PLAN[next]) && s.parts).flatMap((s) => s.parts as string[]);
      const halves = parts.includes('lab histories') ? [['test results', 0, 1], ['lab histories', 1, 2]] as const : [['', 0, 1]] as const;
      for (const [part, from, to] of halves) {
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const done = from + f * (to - from);
          const exact = percentOf(next, done * 1000, halves.length * 1000);
          const stage = currentStage({ next, detail: part ? LABELS[PLAN[next]] + ': ' + part : undefined });
          const { start, end } = stageSpan(stage);
          expect(exact, PLAN[next] + ' ' + part + ' ' + f).toBeGreaterThanOrEqual(Math.floor(start));
          expect(exact, PLAN[next] + ' ' + part + ' ' + f).toBeLessThanOrEqual(Math.ceil(end));
        }
      }
    }
  });
});

describe('countText', () => {
  const at = (step: (typeof PLAN)[number]) => PLAN.indexOf(step);

  it('says how many records of those listed, where the step counts records', () => {
    expect(countText({ next: at('testResults'), items: { done: 38, total: 61 } })).toBe('38 of 61');
    expect(countText({ next: at('visits'), items: { done: 1200, total: 1432 } })).toBe('1,200 of 1,432');
    expect(countText({ next: at('profileAndDoctors') })).toBe('');
  });

  it('shows no count while the medical file is collected, though it reads the letters list', () => {
    expect(countText({ next: at('waitMedicalFile'), items: { done: 2, total: 9 } })).toBe('');
  });
});

describe('stageFileCounts', () => {
  const line = (label: string) => STAGES.findIndex((s) => s.label === label);

  it('adds up each line’s files from the keys of the steps and parts that wrote them', () => {
    const counts = stageFileCounts({
      filesByKey: {
        profileAndDoctors: 6, 'emptySections:allergies': 1, testResults: 3, 'testResults:test results': 90, 'testResults:lab histories': 38,
        // A part no line names is on the step's first line, as currentStage places it.
        'testResults:imaging reports': 2, 'waitMedicalFile:medical file status 2': 1, 'waitMedicalFile:letters': 1, visits: 0,
      },
    });
    expect(counts[line('Your details and doctor')]).toBe(7);
    expect(counts[line('Test results')]).toBe(95);
    expect(counts[line('Lab histories')]).toBe(38);
    expect(counts[line('Collecting your medical file')]).toBe(2);
    expect(counts[line('Visit summaries')]).toBeUndefined();
    expect(counts[line('Ordering your medical file')]).toBeUndefined();
    expect(counts).toHaveLength(STAGES.length);
  });

  it('counts nothing for a run without keys, or for keys no step has', () => {
    expect(stageFileCounts({}).every((n) => n === undefined)).toBe(true);
    expect(stageFileCounts({ filesByKey: { removedStep: 4, '': 2 } }).every((n) => n === undefined)).toBe(true);
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
    expect(statsText(base, start + 20_000)).toBe('<1 min elapsed');
    expect(statsText({ ...base, fileCount: 1, byteCount: 512 }, start + 20_000)).toBe('1 file · 512 B · <1 min elapsed');
    expect(statsText({ ...base, fileCount: 1234, byteCount: 3_240_000 }, start + 72 * 60_000)).toBe('1,234 files · 3.2 MB · 1 h 12 min elapsed');
  });

  it('says how long the medical file can take only while it is being prepared', () => {
    const wait = { ...base, next: PLAN.indexOf('waitMedicalFile') };
    const front = 'Keep the Maccabi Online tab open and in front.';
    expect(hintText(base)).toBe(front);
    expect(hintText(wait)).toBe('While you wait:');
    expect(hintText({ ...wait, detail: LABELS.waitMedicalFile + ': medical file status 2' })).toBe('While you wait:');
    expect(waitingForFile({ ...wait, detail: LABELS.waitMedicalFile + ': medical file status 2' })).toBe(true);
    expect(waitingForFile({ ...wait, detail: LABELS.waitMedicalFile + ': letters' })).toBe(false);
    expect(waitingForFile({ ...wait, status: 'paused_hidden' })).toBe(false);
    expect(waitingForFile(base)).toBe(false);
    expect(hintText({ ...wait, detail: LABELS.waitMedicalFile + ': letters' })).toBe(front);
    expect(hintText({ ...base, status: 'saving', next: PLAN.indexOf('save') })).toBe('It will be in your Downloads folder in a moment.');
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
    expect(stepText({ ...waiting, detail: 'Collecting your medical file: medical file status 2' }).detail).toBe('Being prepared: usually minutes, 15 at most');
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
