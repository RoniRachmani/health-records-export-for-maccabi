/* The export run: a checkpointed walk through PLAN. The state lives in
   chrome.storage.local (so the popup can show it and a restarted service
   worker can pick it up); the member's session token lives only in
   chrome.storage.session; exported files live in IndexedDB staging. */
import {
  CancelledError, Collector, errMessage, LEGACY_STEPS, letters, MEDICAL_FILE, newCtx, placeOrder, RateLimitedError, runStep,
  SessionEndedError, sha256Hex, waitMedicalFile, type Session, type StepName,
} from '../../core';
import {
  alignToPlan, exportName, LABELS, MACCABI_ORIGIN, percentOf, PLAN, resumeIndex, SONLINE_PAGE, SUMMARY_PAGE, type PlanStep, type RunState,
} from '../shared/state';
import {
  clearProblemsOfStep, clearStaging, listMeta, listProblems, putTextDirect, setCurrentStep, stagedTotals, stagingSink,
} from '../shared/staging';
import { exportReadme, INSTRUCTION_POINTERS } from '../shared/readme';
import { callOffscreen, closeOffscreen, offscreenHtml } from './offscreenClient';
import { capturingTransport, rawDumpOn } from './rawDump';
import { currentSession, DEFAULT_ROUTES, isVisible, keepSessionAlive, navigate, routedTransport, snapshot, type Routes } from './tab';
import { updateBadge, notify } from './ui';

const HEARTBEAT = 'hrem-heartbeat';
/** Comfortably inside the site's 6-minute idle logout (see keepSessionAlive). */
const ACTIVITY_MS = 240_000;

let state: RunState | null = null;
let active: Promise<void> | null = null;
let cancelRequested = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const OLD_VERSION_MESSAGE =
  'This export was started by an earlier version of the extension, which ran a different list of steps, so it cannot be continued. ' +
  'Discard the files it collected and start a new export.';

// ---- state ------------------------------------------------------------
export async function loadRun(): Promise<RunState | null> {
  if (!state) {
    state = ((await chrome.storage.local.get('run')).run as RunState | undefined) ?? null;
    // A run stored before this field existed has no name to check against, and keeps its index.
    if (state && !alignToPlan(state)) {
      state.planMismatch = true;
      state.status = 'error';
      state.message = OLD_VERSION_MESSAGE;
    }
  }
  return state;
}

async function save(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (state && (state.status === 'running' || state.status === 'saving')) {
    const t = await stagedTotals();
    // The run may have been discarded meanwhile.
    if (state) {
      state.fileCount = t.files;
      state.byteCount = t.bytes;
    }
  }
  if (state) {
    state.nextStep = state.next < PLAN.length ? PLAN[state.next] : undefined;
    state.heartbeatAt = Date.now();
    await chrome.storage.local.set({ run: state });
  } else {
    await chrome.storage.local.remove('run');
  }
  await updateBadge(state);
}

function saveSoon(): void {
  if (!saveTimer) saveTimer = setTimeout(() => void save(), 400);
}

async function getSession(): Promise<Session | null> {
  return ((await chrome.storage.session.get('session')).session as Session | undefined) ?? null;
}

async function setSession(s: Session): Promise<void> {
  await chrome.storage.session.set({ session: s });
}

async function midHash(mid: string | null): Promise<string> {
  return sha256Hex(new TextEncoder().encode('hrem|' + (mid || '')));
}

async function routes(): Promise<Routes> {
  const r = (await chrome.storage.local.get('routes')).routes as Routes | undefined;
  return r ?? DEFAULT_ROUTES;
}

// ---- entry points (popup / dev bridge) ---------------------------------
export class UserError extends Error {}

async function loggedInSession(tabId: number): Promise<Session> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab || !tab.url || !tab.url.startsWith(MACCABI_ORIGIN + '/')) throw new UserError('Open online.maccabi4u.co.il in this tab first.');
  const s = await currentSession(tabId, new URL(tab.url).pathname.startsWith('/sonline/') ? tab.url : SONLINE_PAGE, true);
  if (!s) throw new UserError('Log in to Maccabi Online in this tab first (after logging in, any page of the new site works).');
  return s;
}

export async function start(tabId: number): Promise<void> {
  const run = await loadRun();
  if (run && ['running', 'saving', 'paused_session', 'paused_hidden'].includes(run.status)) {
    throw new UserError('An export is already in progress. Resume or cancel it first.');
  }
  const s = await loggedInSession(tabId);
  await clearStaging();
  await setSession(s);
  cancelRequested = false;
  state = {
    id: crypto.randomUUID(),
    status: 'running',
    tabId,
    startedAt: new Date().toISOString(),
    next: 0,
    ctx: { ...newCtx(), skipExistingMedicalFile: true },
    stepDone: 0,
    stepTotal: 0,
    percent: 0,
    memberHash: await midHash(s.mid),
  };
  await save();
  void loop();
}

export async function resume(tabId: number): Promise<void> {
  if (active) return; // still running, e.g. waiting for the tab to come back to the front
  const run = await loadRun();
  if (!run || !['paused_session', 'paused_hidden', 'running', 'error'].includes(run.status)) throw new UserError('There is no paused export to resume.');
  if (run.planMismatch) throw new UserError(OLD_VERSION_MESSAGE);
  const s = await loggedInSession(tabId);
  if (run.memberHash && run.memberHash !== (await midHash(s.mid))) {
    throw new UserError('A different member is logged in than the one this export started with. Cancel it to start a new one.');
  }
  await setSession(s);
  cancelRequested = false;
  run.tabId = tabId;
  run.next = resumeIndex(run.next);
  run.status = 'running';
  run.message = undefined;
  await save();
  void loop();
}

export async function cancel(): Promise<void> {
  cancelRequested = true;
  if (active) return; // the loop stops at its next request and cleans up
  await discard();
}

async function discard(): Promise<void> {
  state = null;
  await save();
  await clearStaging();
  await chrome.storage.session.remove('session');
  await chrome.alarms.clear(HEARTBEAT);
  await closeOffscreen();
}

export async function dismiss(): Promise<void> {
  const run = await loadRun();
  if (run && (run.status === 'done' || run.status === 'error')) await discard();
}

/** Called on service-worker start-up and by the heartbeat: continue a run this worker instance isn't driving. */
export async function recover(reason: 'startup' | 'heartbeat'): Promise<void> {
  const run = await loadRun();
  if (!run || active) return;
  if (run.status === 'running' || run.status === 'paused_hidden') {
    if (reason === 'startup' || !(await getSession())) {
      await pause('paused_session', 'Chrome was restarted during the export. Log in to Maccabi Online, then click this extension\'s icon on that tab and press Resume. Files collected so far are kept.');
      return;
    }
    run.status = 'running';
    void loop();
  }
}

// ---- the loop ----------------------------------------------------------
async function pause(status: 'paused_session' | 'paused_hidden', message: string): Promise<void> {
  if (!state) return;
  state.status = status;
  state.message = message;
  await save();
  await notify('attention', status === 'paused_session' ? 'Export paused' : 'Export waiting for you', message);
}

function loop(): Promise<void> {
  if (active) return active;
  active = (async () => {
    await chrome.alarms.create(HEARTBEAT, { periodInMinutes: 0.5 });
    // Extension API calls keep the service worker alive between requests.
    const keepAlive = setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000);
    // The same for the site's session, which watches the page for interaction rather than requests.
    const poke = () => {
      if (state && state.status === 'running') void keepSessionAlive(state.tabId);
    };
    poke(); // Start was clicked in the popup, not the page: the site's idle timer may be minutes in already.
    const activity = setInterval(poke, ACTIVITY_MS);
    let reconnects = 0;
    let reconnectedAt = -1; // PLAN index of the step that last failed with an ended session
    try {
      while (state && state.status === 'running' && state.next < PLAN.length && !cancelRequested) {
        const step = PLAN[state.next];
        state.stepDone = 0;
        state.stepTotal = 0;
        state.detail = LABELS[step];
        state.percent = percentOf(state.next, 0, 0);
        await save();
        if (__DEV_BRIDGE__ && (await chrome.storage.local.get('devStopBefore')).devStopBefore === step) {
          await pause('paused_session', 'Stopped before "' + LABELS[step] + '" (dev:stopBefore).');
          return;
        }
        setCurrentStep(step);
        await clearProblemsOfStep(step);
        try {
          await runPlanStep(step);
          // Only once past the step that failed: after a rewind, the page-opening step passing proves nothing.
          if (state && state.next >= reconnectedAt) reconnects = 0;
        } catch (e) {
          if (cancelRequested || (e as CancelledError).cancelled) break;
          if ((e as SessionEndedError).sessionEnded) {
            // The member is often still logged in: a token is good for about 10 h (measured 2026-09-18), so a
            // run never outlives one and what ended is the site's session. Do what Resume does, then try again.
            if (reconnects < 2 && state) {
              reconnectedAt = state.next;
              if (await reconnect()) {
                reconnects++;
                continue;
              }
            }
            if (cancelRequested) break;
            await pause('paused_session', 'Your Maccabi session ended (' + stripSessionPrefix(errMessage(e)) + '). Log in to Maccabi Online again, then click this extension\'s icon on that tab and press Resume. Files collected so far are kept.');
            return;
          }
          if ((e as RateLimitedError).rateLimited) {
            if (state) {
              state.status = 'error';
              state.message = 'Maccabi Online asked the extension to slow down, so the export stopped. Files collected so far are kept: wait a few minutes, then press "Try again".';
              await save();
              await notify('attention', 'Export stopped', state.message);
            }
            return;
          }
          if (state) {
            state.status = 'error';
            state.message = 'Unexpected error in "' + LABELS[step] + '": ' + errMessage(e);
            await save();
            await notify('attention', 'Export failed', state.message);
          }
          return;
        }
        if (state && state.status === 'running') {
          state.next++;
          await save(); // checkpoint
        }
      }
      if (cancelRequested) await discard();
    } finally {
      clearInterval(keepAlive);
      clearInterval(activity);
      if (!state || !['running', 'saving'].includes(state.status)) await chrome.alarms.clear(HEARTBEAT);
      active = null;
    }
  })();
  return active;
}

function stripSessionPrefix(msg: string): string {
  return msg.replace(/^SESSION ENDED: /, '').replace(/ -- log in again.*$/, '');
}

/** A fresh token from the tab, as Resume gets one. False when nobody (or another member) is logged in. */
async function reconnect(): Promise<boolean> {
  try {
    await waitVisible();
    if (!state) return false;
    const s = await currentSession(state.tabId, SONLINE_PAGE);
    if (!s || !state || (state.memberHash && state.memberHash !== (await midHash(s.mid)))) return false;
    await setSession(s);
    // The tab is on /sonline/ now: a step that needs another page opens it again.
    state.next = resumeIndex(state.next);
    return true;
  } catch {
    return false;
  }
}

async function waitVisible(): Promise<void> {
  if (!state || (await isVisible(state.tabId))) return;
  await pause('paused_hidden', 'Bring the Maccabi tab back to the front to continue. Chrome pauses hidden tabs, which can end your session.');
  while (state && !(await isVisible(state.tabId))) {
    if (cancelRequested) throw new CancelledError();
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (state) {
    state.status = 'running';
    state.message = undefined;
    await save();
  }
}

async function collector(): Promise<Collector> {
  const run = state as RunState;
  const session = await getSession();
  if (!session) throw new SessionEndedError('no session token');
  const transport = routedTransport(run.tabId, await routes(), waitVisible);
  return new Collector(
    {
      transport: __DEV_BRIDGE__ && (await rawDumpOn()) ? capturingTransport(transport, session.mid) : transport,
      sink: stagingSink,
      html: offscreenHtml,
      clock: { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
      progress: (ev) => {
        if (!state) return;
        state.stepDone = ev.done;
        state.stepTotal = ev.total;
        state.detail = ev.detail ? LABELS[PLAN[state.next]] + ': ' + ev.detail : LABELS[PLAN[state.next]];
        state.percent = percentOf(state.next, ev.done, ev.total);
        saveSoon();
      },
      shouldStop: () => cancelRequested,
    },
    session,
  );
}

const SUMMARY_PATH = /^\/online\/medicalfile\/summary\/?$/i;

async function runPlanStep(step: PlanStep): Promise<void> {
  const run = state as RunState;
  switch (step) {
    case 'openLegacyPage':
      await navigate(run.tabId, SUMMARY_PAGE, SUMMARY_PATH);
      return;
    case 'orderMedicalFile': {
      // The steps that follow rewind to openLegacyPage when a paused run resumes, which comes back
      // through here: one order per run, or Maccabi would build the file again and text again.
      if (run.order && (run.order.ordered || run.order.skipped_ready_today)) return;
      // Normally the tab is still on the page openLegacyPage opened; after a Resume or a reconnect it
      // is back on /sonline/, and the order needs this page again.
      if (!SUMMARY_PATH.test((await snapshot(run.tabId)).path)) await navigate(run.tabId, SUMMARY_PAGE, SUMMARY_PATH);
      const c = await collector();
      run.order = await placeOrder(c);
      if (run.order.error) await c.problem(MEDICAL_FILE, 'medical file not ordered: ' + run.order.error);
      return;
    }
    case 'returnToSonline': {
      // What is left needs only the REST API, and the site renews the SPA token only on /sonline/
      // pages: cross back before the longest wait of the run instead of letting the token age out.
      const s = await currentSession(run.tabId, SONLINE_PAGE);
      if (!s || (run.memberHash && run.memberHash !== (await midHash(s.mid)))) {
        throw new SessionEndedError('the session ended while the medical file was being ordered');
      }
      await setSession(s);
      return;
    }
    case 'waitMedicalFile': {
      const c = await collector();
      if (run.order && run.order.ordered) {
        await waitMedicalFile(c, { toDate: run.order.to_date, mustSeePending: run.order.same_day_before });
      } else {
        // No new file was ordered: keep the one Maccabi already has, if any.
        await letters(c, newCtx());
      }
      return;
    }
    case 'save':
      await saveZip();
      return;
    default: {
      const c = await collector();
      await runStep(c, run.ctx, step as StepName);
      // Legacy services don't report an ended session; a failed request is the sign of one.
      if (LEGACY_STEPS.includes(step as StepName) && c.log.some((x) => /PROBLEM: .*Failed to fetch/.test(x[1]))) {
        throw new SessionEndedError('the old medications and documents pages stopped answering');
      }
    }
  }
}

// ---- finishing ---------------------------------------------------------
/**
 * The export's own data dictionary and an assistant's instructions, at the root of the ZIP, with the
 * files that point Claude Code and Codex at it. Counts describe what this run got.
 */
async function writeReadme(root: string): Promise<void> {
  const files: Record<string, number> = {};
  let medicalFile: string | null = null;
  for (const m of await listMeta()) {
    const top = m.rel.split('/')[0];
    if (m.rel.includes('/')) files[top] = (files[top] || 0) + 1;
    // Named by date, so the newest sorts last.
    else if (m.rel.endsWith('_medical-file.pdf') && (!medicalFile || m.rel > medicalFile)) medicalFile = m.rel;
  }
  await putTextDirect('README.md', exportReadme(root.replace(/^maccabi-export-/, ''), files, medicalFile));
  for (const [name, text] of Object.entries(INSTRUCTION_POINTERS)) await putTextDirect(name, text);
}

async function saveZip(): Promise<void> {
  const run = state as RunState;
  run.status = 'saving';
  run.detail = LABELS.save;
  await save();
  const root = exportName(Date.now());
  await writeReadme(root);
  const zip = await callOffscreen<{ url: string; bytes: number; files: number }>({ type: 'zip', root });
  run.zipName = root + '.zip';
  run.fileCount = zip.files;
  run.zipBytes = zip.bytes;
  run.downloadId = await chrome.downloads.download({ url: zip.url, filename: run.zipName, conflictAction: 'uniquify', saveAs: false });
  run.blobUrl = zip.url;
  await save();
  // Completion arrives through chrome.downloads.onChanged (onDownloadChanged).
}

export async function onDownloadChanged(delta: chrome.downloads.DownloadDelta): Promise<void> {
  const run = await loadRun();
  if (!run || run.downloadId !== delta.id || run.status !== 'saving') return;
  const blobUrl = run.blobUrl;
  if (delta.state?.current === 'complete') {
    const problems = await listProblems();
    run.problems = problems.slice(0, 50);
    run.problemCount = problems.length;
    run.status = 'done';
    run.finishedAt = new Date().toISOString();
    run.percent = 100;
    run.next = PLAN.length;
    run.message = undefined;
    await save();
    if (blobUrl) await callOffscreen({ type: 'revoke', url: blobUrl }).catch(() => undefined);
    await clearStaging();
    await chrome.storage.session.remove('session');
    await chrome.alarms.clear(HEARTBEAT);
    await closeOffscreen();
    const p = run.problemCount;
    await notify('ready', 'Export ready', run.zipName + ': ' + run.fileCount + ' files' + (p ? ', ' + p + ' problem' + (p === 1 ? '' : 's') : '') + '.');
  } else if (delta.state?.current === 'interrupted') {
    run.status = 'error';
    run.message = 'The ZIP could not be saved (' + (delta.error?.current || 'interrupted') + '). Your files are still collected: press "Save again".';
    await save();
    await notify('attention', 'Export not saved', run.message);
  }
}

export async function retrySave(): Promise<void> {
  const run = await loadRun();
  if (!run || run.status !== 'error' || run.next !== PLAN.indexOf('save')) throw new UserError('Nothing to save again.');
  run.status = 'running';
  run.message = undefined;
  await save();
  void loop();
}

export async function showFile(): Promise<void> {
  const run = await loadRun();
  if (run?.downloadId !== undefined) chrome.downloads.show(run.downloadId);
}

/** Brings the export's Maccabi tab to the front (which also lets a run waiting for it continue), or opens the site if that tab is gone. */
export async function focusRunTab(): Promise<void> {
  const run = await loadRun();
  const tab = run ? await chrome.tabs.get(run.tabId).catch(() => undefined) : undefined;
  if (tab?.id === undefined) {
    await chrome.tabs.create({ url: MACCABI_ORIGIN + '/' });
    return;
  }
  await chrome.tabs.update(tab.id, { active: true });
  const win = await chrome.windows.get(tab.windowId);
  await chrome.windows.update(tab.windowId, win.state === 'minimized' ? { focused: true, state: 'normal' } : { focused: true });
}
