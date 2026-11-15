// When the drift check is due. launchd starts the agent at its weekly (or daily) time and also at every login (RunAtLoad),
// because a check whose time passed while the Mac was shut down is not run on waking, only one the Mac slept through.
// The agent passes `--due tue@03:30` (or `daily@03:30`): a run is due when none has begun since the latest of those
// times, so the scheduled start runs, a login after a missed one runs it once, and every other login does nothing. A run counts from when it
// begins, whatever its outcome, so a check Maccabi broke off is not retried at each login (each one signs in again,
// which ends the member's other sessions). Without `--due`, as from the terminal, it always runs.
//
// It imports nothing but Node's own modules: drift-update.mjs runs it before the checkout's dependencies exist.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * The schedule's day of the week (0 is Sunday, `null` every day) and time, or an error that says what it takes.
 * @param {string} day a day's name or its first three letters, as `--day tue`, or `daily`
 * @param {string} time `HH:MM`, as `--time 03:30`
 * @returns {{ weekday: number | null; hour: number; minute: number }}
 */
export function parseSchedule(day, time) {
  const daily = day.toLowerCase() === 'daily';
  const weekday = daily ? null : DAYS[/** @type {keyof typeof DAYS} */ (day.slice(0, 3).toLowerCase())];
  const [hour, minute] = (time.match(/^(\d{1,2}):(\d{2})$/) || []).slice(1).map(Number);
  if (weekday === undefined || !(hour >= 0 && hour < 24) || !(minute >= 0 && minute < 60)) throw new Error('The schedule takes a day and a time: --day tue (or daily) --time 03:30');
  return { weekday, hour, minute };
}

/** The `--due` value the agent passes for a schedule: `tue@03:30`, or `daily@03:30`. @param {string} day @param {string} time */
export const dueArg = (day, time) => (day.toLowerCase() === 'daily' ? 'daily' : day.slice(0, 3).toLowerCase()) + '@' + time;

/**
 * The latest scheduled time at or before `now`, in the Mac's own time zone, as launchd keeps it. A minute's grace, so
 * the scheduled start itself, a moment early or late, counts as that one's.
 * @param {Date} now
 * @param {{ weekday: number | null; hour: number; minute: number }} s
 */
export function lastSlot(now, s) {
  const soon = new Date(now.getTime() + 60_000);
  const d = new Date(soon);
  d.setHours(s.hour, s.minute, 0, 0);
  if (s.weekday !== null) d.setDate(d.getDate() - ((d.getDay() - s.weekday + 7) % 7));
  if (d > soon) d.setDate(d.getDate() - (s.weekday === null ? 1 : 7));
  return d;
}

/** Where a run's start is kept, beside the reports. @param {string} root the checkout */
export const lastRunFile = (root) => join(root, '.cache', 'drift', 'last-run.json');

/**
 * Whether a run is due, and if it is, keeps its start so the next login knows. `args` without `--due` is always due.
 * @param {string[]} args the entry's arguments
 * @param {string} root the checkout
 * @param {Date} [now]
 * @returns {{ run: true } | { run: false; why: string }}
 */
export function whenDue(args, root, now = new Date()) {
  const i = args.indexOf('--due');
  if (i < 0) return { run: true };
  const [day, time] = (args[i + 1] || '').split('@');
  const slot = lastSlot(now, parseSchedule(day || '', time || ''));
  const file = lastRunFile(root);
  /** @type {Date | null} */
  let began = null;
  try {
    const at = new Date(JSON.parse(readFileSync(file, 'utf8')).began);
    if (!Number.isNaN(at.getTime())) began = at;
  } catch { /* never run here, or the file is unreadable: due */ }
  if (began && began >= slot) return { run: false, why: `not due: a check began ${began.toISOString()}, after the scheduled time (${slot.toISOString()})` };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ began: now.toISOString() }) + '\n');
  return { run: true };
}

/** The arguments without `--due` and its value, for the process an entry hands the run to. @param {string[]} args */
export function withoutDue(args) {
  const i = args.indexOf('--due');
  return i < 0 ? args : [...args.slice(0, i), ...args.slice(i + 2)];
}
