import { describe, expect, it } from 'vitest';
import { CancelledError, RateLimitedError, SessionEndedError, STEP_ORDER } from '../src/core';
import {
  abandoned, alignToPlan, FILE_LAYOUT, LABELS, MAX_RECONNECTS, PLAN, resumeIndex, sameLayout, savingOutcome, SESSION_ENDED_MESSAGE, STAGING_TTL_MS, stepFailure, WEIGHTS,
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
