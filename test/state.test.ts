import { describe, expect, it } from 'vitest';
import { alignToPlan, PLAN, resumeIndex } from '../src/extension/shared/state';

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
    // The real drift: the plan that ordered the medical file at index 13 now has returnToSonline
    // there, so a run paused before the order would have skipped it and waited for a file nobody
    // asked for.
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
