import { describe, expect, it } from 'vitest';
import { CancelledError, RateLimitedError, SessionEndedError, STEP_ORDER } from '../src/core';
import {
  abandoned, alignToPlan, canMove, FILE_LAYOUT, isDriven, isUnderway, LABELS, lateFileNotice, MAX_RECONNECTS, nextStatus, PLAN, resumeIndex, sameLayout, savingOutcome, SESSION_ENDED_MESSAGE, STAGING_TTL_MS, stepFailure, WEIGHTS,
  type RunStatus,
} from '../src/extension/shared/state';

describe('PLAN', () => {
  it('runs every collection step once, in the order core lists them', () => {
    expect(PLAN.filter((s) => (STEP_ORDER as string[]).includes(s))).toEqual(STEP_ORDER);
  });

  it('names each step once, so WEIGHTS and LABELS, read off the same rows, have one entry per step', () => {
    expect(new Set(PLAN).size).toBe(PLAN.length);
    expect(Object.keys(WEIGHTS)).toEqual([...PLAN]);
    expect(Object.keys(LABELS)).toEqual([...PLAN]);
    expect(Object.values(WEIGHTS).every((w) => w > 0)).toBe(true);
  });
});

describe('nextStatus', () => {
  const ALL: RunStatus[] = ['running', 'paused_session', 'paused_hidden', 'saving', 'done', 'error'];

  it('moves a run as each event says', () => {
    expect(nextStatus('paused_session', 'resume')).toBe('running');
    expect(nextStatus('error', 'resume')).toBe('running');
    expect(nextStatus('running', 'pause')).toBe('paused_session');
    expect(nextStatus('paused_hidden', 'pause')).toBe('paused_session');
    expect(nextStatus('running', 'hide')).toBe('paused_hidden');
    expect(nextStatus('paused_hidden', 'show')).toBe('running');
    expect(nextStatus('saving', 'stop')).toBe('error');
    expect(nextStatus('running', 'save')).toBe('saving');
    expect(nextStatus('saving', 'saved')).toBe('done');
    expect(nextStatus('saving', 'saveFailed')).toBe('error');
    expect(nextStatus('error', 'retrySave')).toBe('running');
  });

  it('leaves a run alone when the event does not apply', () => {
    expect(nextStatus('done', 'resume')).toBe('done');
    expect(nextStatus('saving', 'resume')).toBe('saving');
    expect(nextStatus('done', 'saved')).toBe('done');
    expect(canMove('saving', 'retrySave')).toBe(false);
  });

  it('never reopens a finished run, whatever comes', () => {
    for (const e of ['resume', 'pause', 'hide', 'show', 'stop', 'save', 'saved', 'saveFailed', 'retrySave'] as const) expect(nextStatus('done', e)).toBe('done');
  });

  it('lets an obsolete run be discarded from any status', () => {
    for (const s of ALL) expect(nextStatus(s, 'obsolete')).toBe('error');
  });

  it('counts a run as underway until it is done or stopped', () => {
    expect(ALL.filter(isUnderway)).toEqual(['running', 'paused_session', 'paused_hidden', 'saving']);
    expect(ALL.filter(isDriven)).toEqual(['running', 'saving']);
  });
});

describe('resumeIndex', () => {
  it('opens the legacy page again before its steps', () => {
    expect(PLAN[resumeIndex(PLAN.indexOf('purchases'))]).toBe('openLegacyPage');
    expect(PLAN[resumeIndex(PLAN.indexOf('savedDocuments'))]).toBe('openLegacyPage');
    expect(PLAN[resumeIndex(PLAN.indexOf('hospitalStays'))]).toBe('openLegacyPage');
  });

  it('continues other steps where they stopped', () => {
    // orderMedicalFile included: it opens the legacy page itself, so a resume there does not
    // repeat the purchases and uploads collected from that same page.
    for (const step of ['profileAndDoctors', 'visits', 'openLegacyPage', 'orderMedicalFile', 'returnToSonline', 'waitMedicalFile', 'save'] as const) {
      expect(resumeIndex(PLAN.indexOf(step))).toBe(PLAN.indexOf(step));
    }
  });

  it('crosses to the old site once, at the start, and comes back for the rest', () => {
    const order = (s: (typeof PLAN)[number]) => PLAN.indexOf(s);
    for (const legacy of ['orderMedicalFile', 'purchases', 'savedDocuments', 'hospitalStays'] as const) {
      expect(order('openLegacyPage')).toBeLessThan(order(legacy));
      expect(order(legacy)).toBeLessThan(order('returnToSonline'));
    }
    expect(order('returnToSonline')).toBeLessThan(order('testResults'));
  });

  it('orders the medical file first and collects it last, so Maccabi builds it meanwhile', () => {
    const order = (s: (typeof PLAN)[number]) => PLAN.indexOf(s);
    expect(order('orderMedicalFile')).toBeLessThan(order('testResults'));
    expect(order('waitMedicalFile')).toBeGreaterThan(order('emptySections'));
  });
});

describe('alignToPlan', () => {
  it('keeps a run whose index and step name agree', () => {
    const run = { next: PLAN.indexOf('visits'), nextStep: 'visits' as const };
    expect(alignToPlan(run)).toBe(true);
    expect(run.next).toBe(PLAN.indexOf('visits'));
  });

  it('follows the name when an update moved the step', () => {
    // The real drift: a plan that ordered the medical file at index 13 was replaced by one with
    // another step there, so a run paused before the order would have skipped it and waited for a
    // file nobody asked for.
    const run = { next: 13, nextStep: 'orderMedicalFile' as const };
    expect(alignToPlan(run)).toBe(true);
    expect(PLAN[run.next]).toBe('orderMedicalFile');
  });

  it('refuses a run whose step this version no longer has', () => {
    expect(alignToPlan({ next: 12, nextStep: 'openSummaryPage' as never })).toBe(false);
  });

  it('trusts the index of a run stored before names were kept', () => {
    const run = { next: 4 };
    expect(alignToPlan(run)).toBe(true);
    expect(run.next).toBe(4);
  });

  it('leaves a finished run alone', () => {
    const run = { next: PLAN.length, nextStep: 'save' as const };
    expect(alignToPlan(run)).toBe(true);
    expect(run.next).toBe(PLAN.length);
  });
});

describe('sameLayout', () => {
  it('continues a run this version started', () => {
    expect(sameLayout({ next: PLAN.indexOf('visits'), layout: FILE_LAYOUT })).toBe(true);
  });

  it('refuses a run from a version that named files differently, while it still has files to collect', () => {
    // Its re-run steps would stage the new names beside the old ones.
    expect(sameLayout({ next: PLAN.indexOf('doctorCommunications') })).toBe(false);
    expect(sameLayout({ next: 0, layout: FILE_LAYOUT - 1 })).toBe(false);
  });

  it('lets such a run finish when only the medical file and the ZIP are left', () => {
    expect(sameLayout({ next: PLAN.indexOf('waitMedicalFile') })).toBe(true);
    expect(sameLayout({ next: PLAN.length })).toBe(true);
  });
});

describe('savingOutcome', () => {
  it('lets a download in progress finish, finishes a completed one, and saves again otherwise', () => {
    expect(savingOutcome('in_progress')).toBe('wait');
    expect(savingOutcome('complete')).toBe('complete');
    // Chrome restarted mid-download marks it interrupted; one it never started, or forgot, is not there at all.
    expect(savingOutcome('interrupted')).toBe('interrupted');
    expect(savingOutcome(undefined)).toBe('interrupted');
  });
});

describe('abandoned', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  it('is a run last saved more than a week ago', () => {
    expect(abandoned({ heartbeatAt: now - STAGING_TTL_MS - 1 }, now)).toBe(true);
    expect(abandoned({ heartbeatAt: now - STAGING_TTL_MS }, now)).toBe(false);
    expect(abandoned({ heartbeatAt: now - 1000 }, now)).toBe(false);
  });

  it('counts a run stored before heartbeatAt existed from its start, and keeps one it cannot date', () => {
    expect(abandoned({ startedAt: '2026-10-01T00:00:00Z' }, now)).toBe(true);
    expect(abandoned({ startedAt: '2026-10-26T00:00:00Z' }, now)).toBe(false);
    expect(abandoned({}, now)).toBe(false);
  });
});

describe('stepFailure', () => {
  const at = (reconnects = 0, cancelRequested = false) => ({ step: 'visits' as const, cancelRequested, reconnects });

  it('stops for a cancel, whatever was thrown', () => {
    expect(stepFailure(new CancelledError(), at())).toEqual({ action: 'cancel' });
    expect(stepFailure(new Error('boom'), at(0, true))).toEqual({ action: 'cancel' });
    expect(stepFailure(new SessionEndedError('gone'), at(0, true))).toEqual({ action: 'cancel' });
  });

  it('reconnects after an ended session until the allowance is used, then pauses', () => {
    for (let n = 0; n < MAX_RECONNECTS; n++) expect(stepFailure(new SessionEndedError('gone'), at(n))).toEqual({ action: 'reconnect' });
    expect(stepFailure(new SessionEndedError('gone'), at(MAX_RECONNECTS))).toEqual({ action: 'pause', message: SESSION_ENDED_MESSAGE });
  });

  it('stops without a detail when the site asks to slow down', () => {
    const f = stepFailure(new RateLimitedError(60), at());
    expect(f).toMatchObject({ action: 'stop' });
    expect(f.action === 'stop' && f.detail).toBeFalsy();
  });

  it('stops on anything else, naming the step and keeping the error for the details', () => {
    expect(stepFailure(new Error('boom'), at())).toEqual({
      action: 'stop',
      message: 'Something unexpected stopped the export during “' + LABELS.visits + '”.',
      detail: 'boom',
    });
    expect(stepFailure('a string', at())).toMatchObject({ action: 'stop', detail: 'a string' });
  });
});

describe('lateFileNotice', () => {
  it('ends the notification with what to do, and after a refusal from when a new export orders once more', () => {
    expect(lateFileNotice({ kept: '2026-10-29', until: '2026-11-01' })).toBe('When Maccabi texts you, export again.');
    expect(lateFileNotice({ refused: true, retryAt: '2026-11-02T10:14:00.000Z' })).toBe('Maccabi asked to try again later: export again when it texts you, or from 12:14 if it doesn’t.');
    expect(lateFileNotice({ refused: true })).toBe('Maccabi asked to try again later: export again when it texts you, or tomorrow if it doesn’t.');
  });
});
