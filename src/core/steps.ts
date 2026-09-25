import { errMessage, isControl, type Collector } from './collector';
import { doctorCommunications, emptySections, hospitalStays, savedDocuments } from './sections/other';
import { letters } from './sections/letters';
import { medications, purchases } from './sections/medications';
import { profileAndDoctors } from './sections/profile';
import { approvals, infoPages, referrals } from './sections/referrals';
import { testResults } from './sections/testResults';
import { vaccinations } from './sections/vaccinations';
import { visits } from './sections/visits';
import type { Ctx } from './types';

export type Step = (c: Collector, ctx: Ctx) => Promise<unknown>;

/**
 * Every collection step, in the order the extension's run plan (PLAN) takes them; the plan uses
 * these names. The tests' fake run goes through them in this order, as an export does.
 */
export const STEPS = {
  profileAndDoctors,
  emptySections,
  medications,
  purchases,
  hospitalStays,
  savedDocuments,
  testResults,
  visits,
  referrals,
  approvals,
  vaccinations,
  letters,
  doctorCommunications,
  infoPages,
} satisfies Record<string, Step>;

export type StepName = keyof typeof STEPS;
export const STEP_ORDER = Object.keys(STEPS) as StepName[];

/** Steps that use the legacy /online/ services (need a legacy page opened in the session). */
export const LEGACY_STEPS: StepName[] = ['purchases', 'savedDocuments', 'hospitalStays'];

/**
 * Runs one step. A failure inside it is recorded as a problem under the step's
 * name; SessionEnded and Cancelled are thrown on for the caller to handle.
 */
export async function runStep(c: Collector, ctx: Ctx, name: StepName): Promise<void> {
  try {
    await STEPS[name](c, ctx);
  } catch (e) {
    if (isControl(e)) throw e;
    await c.problem(name, errMessage(e));
  }
}
