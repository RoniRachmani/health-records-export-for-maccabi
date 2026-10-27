/* The export run: a checkpointed walk through PLAN. The state lives in
   chrome.storage.local (so the popup can show it and a restarted service
   worker can pick it up); the member's session token lives only in
   chrome.storage.session; exported files live in IndexedDB staging. */
import {
  CancelledError, Collector, LEGACY_STEPS, MEDICAL_FILE, newCtx, orderSettled, placeOrder, runStep,
  SessionEndedError, sha256Hex, waitMedicalFile, keepListedMedicalFile, type Session, type StepName, type Transport,
} from '../../core';
import {
  abandoned, alignToPlan, exportName, FILE_LAYOUT, LABELS, MACCABI_ORIGIN, percentOf, PLAN, resumeIndex, sameLayout, savingOutcome, SESSION_ENDED_MESSAGE, SONLINE_PAGE, STAGING_TTL_DAYS, STAGING_TTL_MS, stepFailure,
  SUMMARY_PAGE, type PlanStep, type RunState,
} from '../shared/state';
import {
  clearProblemsOfStep, clearStaging, listMeta, listProblems, putTextDirect, setCurrentPart, setCurrentStep, stagedTotals, stagingKey, stagingSink,
} from '../shared/staging';
import { EXPORT_ERRORS, exportErrors, exportReadme, INSTRUCTION_POINTERS, type ExportError } from '../shared/readme';
import { callOffscreen, closeOffscreen, offscreenHtml, revokeBlob } from './offscreenClient';
import { capturingTransport, rawDumpOn } from './rawDump';
import { currentRoutes, currentSession, extensionFetch, isVisible, keepSessionAlive, navigate, routedTransport, snapshot } from './tab';
import { updateBadge, notify } from './ui';

const HEARTBEAT = 'hrem-heartbeat';
/** Wakes a worker when a run nobody came back to is due to be discarded (STAGING_TTL_MS). */
export const EXPIRY = 'hrem-expiry';
/** Comfortably inside the site's idle logouts, 330 s on legacy pages and 360 s elsewhere (see keepSessionAlive). */
const ACTIVITY_MS = 240_000;

let state: RunState | null = null;
let active: Promise<void> | null = null;
let cancelRequested = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let loaded: Promise<void> | null = null;
/** When the EXPIRY alarm is set for (0: not set), so save() touches it only when that changes. */
let expiryAt = -1;

const OLD_VERSION_MESSAGE =
  'An earlier version of the extension started this export, so it can’t be continued. Delete its files and start a new export.';

// ---- state ------------------------------------------------------------
export async function loadRun(): Promise<RunState | null> {
  // Read once per worker, and shared: at a browser start the start-up and the heartbeat recovery both get here at once.
  await (loaded ??= (async () => {
    state = ((await chrome.storage.local.get('run')).run as RunState | undefined) ?? null;
    // A run stored before this field existed has no name to check against, and keeps its index.
    if (state && (!alignToPlan(state) || !sameLayout(state))) {
      state.planMismatch = true;
      state.status = 'error';
      state.message = OLD_VERSION_MESSAGE;
    }
  })());
  if (state && !active && abandoned(state, Date.now())) await expire();
  return state;
}

/** Discards a run nobody came back to for STAGING_TTL_MS, and tells the member when it still held their files. */
async function expire(): Promise<void> {
  const held = state?.status !== 'done'; // a finished run's files went with the download
  await discard(); // clears state before its first await, so a second caller finds nothing to expire
  if (held) {
    await notify(
      'attention',
      'Export deleted',
      'An export left unfinished for ' + STAGING_TTL_DAYS + ' days was deleted, with the files it had collected. Start a new one whenever you like.',
    );
  }
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
      state.filesByKey = t.byKey;
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
  // A run no loop drives may never wake a worker again on its own: the alarm does, when it is due to be discarded.
  const at = state && !['running', 'saving'].includes(state.status) ? state.heartbeatAt! + STAGING_TTL_MS + 60_000 : 0;
  if (at !== expiryAt) {
    expiryAt = at;
    if (at) await chrome.alarms.create(EXPIRY, { when: at });
    else await chrome.alarms.clear(EXPIRY);
  }
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

// ---- entry points (popup / dev bridge) ---------------------------------
export class UserError extends Error {}

async function loggedInSession(tabId: number): Promise<Session> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab || !tab.url || !tab.url.startsWith(MACCABI_ORIGIN + '/')) throw new UserError('Open Maccabi Online in this tab first.');
  const s = await currentSession(tabId, new URL(tab.url).pathname.startsWith('/sonline/') ? tab.url : SONLINE_PAGE, true);
  if (!s) throw new UserError('Log in to Maccabi Online in this tab first.');
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
    layout: FILE_LAYOUT,
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
    throw new UserError('This export belongs to a different member. Log in as them to resume it, or cancel it to start a new one.');
  }
  await setSession(s);
  cancelRequested = false;
  run.tabId = tabId;
  run.next = resumeIndex(run.next);
  run.status = 'running';
  run.message = undefined;
  run.errorDetail = undefined;
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
  if (run.status === 'saving') {
    await settleSave(run);
    return;
  }
  if (run.status === 'running' || run.status === 'paused_hidden') {
    if (reason === 'startup' || !(await getSession())) {
      await pause('paused_session', 'Chrome was restarted during the export. Log in to Maccabi Online, then click the extension’s icon on the Maccabi Online tab and press Resume. Files collected so far are kept.');
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
  await notify('attention', 'Export paused', message);
}

function loop(): Promise<void> {
  if (active) return active;
  active = (async () => {
    await chrome.alarms.create(HEARTBEAT, { periodInMinutes: 0.5 });
    // Extension API calls keep the service worker alive between requests.
    const keepAlive = setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000);
    // The same for the site's session, which watches the page for interaction rather than requests.
    // While a hidden tab pauses the run, nothing else reaches the site, and its gateway ends a session
    // after 6-8 min without a request: send the site's own keep-alive request as well.
    const poke = () => {
      if (state && state.status === 'running') void keepSessionAlive(state.tabId);
      else if (state && state.status === 'paused_hidden') void keepSessionAlive(state.tabId).then(renewSession);
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
        state.items = undefined;
        state.detail = LABELS[step];
        state.percent = percentOf(state.next, 0, 0);
        await save();
        if (__DEV_BRIDGE__ && (await chrome.storage.local.get('devStopBefore')).devStopBefore === step) {
          await pause('paused_session', 'Stopped before ' + step + ' (dev:stopBefore).');
          return;
        }
        setCurrentStep(step);
        await clearProblemsOfStep(step);
        timeUnder(stagingKey(step, ''));
        try {
          await runPlanStep(step);
          timeUnder(null);
          // Only once past the step that failed: after a rewind, the page-opening step passing proves nothing.
          if (state && state.next >= reconnectedAt) reconnects = 0;
        } catch (e) {
          timeUnder(null); // before anything below saves the state, so a pause or an error keeps the time too
          const failure = stepFailure(e, { step, cancelRequested, reconnects });
          if (failure.action === 'cancel') break;
          if (failure.action === 'reconnect' && state) {
            reconnectedAt = state.next;
            if (await reconnect()) {
              reconnects++;
              continue;
            }
            if (cancelRequested) break;
          }
          if (failure.action === 'stop') {
            if (state) {
              state.status = 'error';
              state.message = failure.message;
              state.errorDetail = failure.detail;
              await save();
              await notify('attention', 'Export stopped', state.message);
            }
            return;
          }
          await pause('paused_session', failure.action === 'pause' ? failure.message : SESSION_ENDED_MESSAGE);
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

/** How often a run paused on a hidden tab looks again. */
const VISIBLE_POLL_MS = 1000;

async function waitVisible(): Promise<void> {
  if (!state || (await isVisible(state.tabId))) return;
  await pause('paused_hidden', 'Bring the Maccabi Online tab back to the front to continue. Chrome pauses hidden tabs, which can end your session.');
  while (state && !(await isVisible(state.tabId))) {
    if (cancelRequested) throw new CancelledError();
    await new Promise((r) => setTimeout(r, VISIBLE_POLL_MS));
  }
  if (state) {
    state.status = 'running';
    state.message = undefined;
    state.errorDetail = undefined;
    await save();
    // A frozen tab's idle timers fire as soon as it runs again.
    await keepSessionAlive(state.tabId);
  }
}

/** The portal's own keep-alive request (MainAppAPI .../alive), from the extension. Failures are ignored. */
async function renewSession(): Promise<void> {
  const s = await getSession();
  if (!s) return;
  try {
    await extensionFetch({
      url: '/sonline/MainAppAPI/webapi/mac/v1/members/0/' + s.mid + '/alive',
      method: 'GET',
      redirect: 'manual',
      headers: { Authorization: 'Bearer ' + s.jwt },
    });
  } catch {
    /* the run's next request reports an ended session */
  }
}

async function collector(): Promise<Collector> {
  const run = state as RunState;
  const session = await getSession();
  if (!session) throw new SessionEndedError('no session token');
  const transport = routedTransport(run.tabId, await currentRoutes(), waitVisible);
  return new Collector(
    {
      transport: counted(__DEV_BRIDGE__ && (await rawDumpOn()) ? capturingTransport(transport, session.mid) : transport),
      sink: stagingSink,
      html: offscreenHtml,
      clock: { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
      progress: (ev) => {
        if (!state) return;
        state.stepDone = ev.done;
        state.stepTotal = ev.total;
        state.items = ev.items;
        setCurrentPart(ev.detail ?? '');
        const key = stagingKey(PLAN[state.next], ev.detail ?? '');
        if (key !== timing?.key) timeUnder(key);
        state.detail = ev.detail ? LABELS[PLAN[state.next]] + ': ' + ev.detail : LABELS[PLAN[state.next]];
        // A part that starts its own count (the medical file's download, after the wait) holds the bar; it never
        // steps back within a step. The step's start set it, so a step that runs again starts over.
        state.percent = Math.max(state.percent, percentOf(state.next, ev.done, ev.total));
        saveSoon();
      },
      shouldStop: () => cancelRequested,
    },
    session,
  );
}

// The clock runs for one stagingKey at a time: the step's, then each part it reports, until the step ends.
let timing: { key: string; since: number } | null = null;

/** Adds the time since the last switch to the key the clock was on, and starts it on `key` (null stops it). */
function timeUnder(key: string | null): void {
  if (state && timing) {
    const t = state.timings?.[timing.key] ?? { ms: 0, requests: 0 };
    state.timings = { ...state.timings, [timing.key]: { ...t, ms: t.ms + Date.now() - timing.since } };
  }
  timing = key === null ? null : { key, since: Date.now() };
}

function countRequest(): void {
  if (!state || !timing) return;
  const t = state.timings?.[timing.key] ?? { ms: 0, requests: 0 };
  state.timings = { ...state.timings, [timing.key]: { ...t, requests: t.requests + 1 } };
}

function counted(t: Transport): Transport {
  return {
    fetch: (req) => (countRequest(), t.fetch(req)),
    xhr: (req) => (countRequest(), t.xhr(req)),
    pagePath: () => t.pagePath(),
  };
}

const SUMMARY_PATH = /^\/online\/medicalfile\/summary\/?$/i;

/**
 * Sends the order from the summary page, opening it first when the tab is elsewhere, and keeps the answer. Both the
 * sending and the answer are checkpointed as they happen, not when the step ends: a worker killed in between would
 * otherwise come back with no order on record, and order again (and Maccabi text the member again).
 */
async function orderMedicalFile(run: RunState): Promise<void> {
  // Normally the tab is still on the page openLegacyPage opened; after a Resume or a reconnect it
  // is back on /sonline/, and the order needs this page again.
  if (!SUMMARY_PATH.test((await snapshot(run.tabId)).path)) await navigate(run.tabId, SUMMARY_PAGE, SUMMARY_PATH);
  const c = await collector();
  const reorder = __DEV_BRIDGE__ && !!(await chrome.storage.local.get('devReorder')).devReorder;
  // Until the answer is in, the run holds an order that went out with no answer, which orderSettled never repeats.
  const beforeSend = async () => {
    run.order = { ordered: false, sent: true };
    await save();
  };
  run.order = await placeOrder(c, { reorder, beforeSend });
  if (run.order.ordered) run.orderedAt = new Date().toISOString();
  await save();
  if (run.order.error) await c.problem(MEDICAL_FILE, 'medical file not ordered: ' + run.order.error);
}

/** Takes the tab back to /sonline/ and its fresh token, refusing another member's session. */
async function backToSonline(run: RunState, ended: string): Promise<void> {
  const s = await currentSession(run.tabId, SONLINE_PAGE);
  if (!s || (run.memberHash && run.memberHash !== (await midHash(s.mid)))) throw new SessionEndedError(ended);
  await setSession(s);
}

async function runPlanStep(step: PlanStep): Promise<void> {
  const run = state as RunState;
  switch (step) {
    case 'openLegacyPage':
      await navigate(run.tabId, SUMMARY_PAGE, SUMMARY_PATH);
      return;
    case 'orderMedicalFile': {
      // The steps that follow rewind to openLegacyPage when a paused run resumes, which comes back
      // through here: one order per run, or Maccabi would build the file again and text again. That holds for an
      // order whose answer was lost or unclear too, since Maccabi may have taken it.
      if (orderSettled(run.order)) return;
      // dev:skipOrder: a test run collects everything else without ordering, and waitMedicalFile then keeps
      // the file Maccabi already has, as it does when an order fails.
      if (__DEV_BRIDGE__ && (await chrome.storage.local.get('devSkipOrder')).devSkipOrder) return;
      await orderMedicalFile(run);
      return;
    }
    case 'returnToSonline':
      // What is left needs only the REST API, and the site renews the SPA token only on /sonline/
      // pages: cross back before the longest wait of the run instead of letting the token age out.
      await backToSonline(run, 'the session ended while the medical file was being ordered');
      return;
    case 'waitMedicalFile': {
      const c = await collector();
      if (run.order && run.order.ordered) {
        // A run stored before same_range_before existed goes by same_day_before, as it did then.
        const waited = await waitMedicalFile(c, {
          toDate: run.order.to_date,
          fromDate: run.order.from_date,
          mustSeePending: run.order.same_range_before ?? run.order.same_day_before,
          orderedAt: run.orderedAt ? Date.parse(run.orderedAt) : undefined,
        });
        if (waited.ready && run.orderedAt) run.medicalFileMs = Date.now() - Date.parse(run.orderedAt);
      } else {
        // No new file was ordered: keep the one Maccabi already has, if any, and say which it is.
        await keepListedMedicalFile(c, run.order);
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
        throw new SessionEndedError('the old site’s pages stopped answering');
      }
    }
  }
}

// ---- finishing ---------------------------------------------------------
/**
 * The export's own data dictionary and an assistant's instructions, at the root of the ZIP, with the
 * files that point Claude Code and Codex at it, and the list of what the run failed to collect.
 * Counts describe what this run got; the version is the one running, whose FILE_LAYOUT the run's
 * files have (sameLayout discards a run started under another).
 */
async function writeReadme(root: string, run: RunState): Promise<{ readme: string; errors: ExportError[] }> {
  const files: Record<string, number> = {};
  let medicalFile: string | null = null;
  for (const m of await listMeta()) {
    const top = m.rel.split('/')[0];
    if (m.rel.includes('/')) files[top] = (files[top] || 0) + 1;
    // Named by date, so the newest sorts last.
    else if (m.rel.endsWith('_medical-file.pdf') && (!medicalFile || m.rel > medicalFile)) medicalFile = m.rel;
  }
  // Always written: an empty list says nothing failed, where a missing one is an export from before it existed.
  const errors = exportErrors(await listProblems());
  await putTextDirect(EXPORT_ERRORS, JSON.stringify(errors, null, 2) + '\n');
  const made = { version: chrome.runtime.getManifest().version, layout: FILE_LAYOUT, startedAt: run.startedAt, dev: __DEV_BRIDGE__ };
  const readme = exportReadme(root.replace(/^maccabi-export-/, ''), files, medicalFile, errors, made);
  await putTextDirect('README.md', readme);
  for (const [name, text] of Object.entries(INSTRUCTION_POINTERS)) await putTextDirect(name, text);
  return { readme, errors };
}

/**
 * The root files the save step writes, written into staging as it writes them, for the dev bridge:
 * a live test checks them without building a ZIP or downloading the member's records.
 */
export async function writeRootFiles(): Promise<{ readme: string; errors: ExportError[] }> {
  const run = await loadRun();
  if (!run) throw new UserError('There is no export to write the root files of.');
  return writeReadme(exportName(Date.now()), run);
}

async function saveZip(): Promise<void> {
  const run = state as RunState;
  run.status = 'saving';
  run.detail = LABELS.save;
  // Save again builds a new ZIP: the one that did not make it would otherwise stay in memory beside it.
  await dropBlob(run);
  await save();
  const root = exportName(Date.now());
  timeUnder(stagingKey('save', 'root files'));
  await writeReadme(root, run);
  timeUnder(stagingKey('save', 'zip'));
  const zip = await callOffscreen<{ url: string; bytes: number; files: number }>({ type: 'zip', root });
  // Kept before the download is asked for, which can fail, so the blob can always be let go of.
  run.blobUrl = zip.url;
  run.zipName = root + '.zip';
  run.fileCount = zip.files;
  run.zipBytes = zip.bytes;
  // The download finishes after this step returns: onDownloadChanged times it.
  timeUnder(null);
  run.downloadStartedAt = Date.now();
  run.downloadId = await chrome.downloads.download({ url: zip.url, filename: run.zipName, conflictAction: 'uniquify', saveAs: false });
  await save();
  // Completion arrives through chrome.downloads.onChanged (onDownloadChanged).
}

/**
 * A run left saving that this worker is not driving: Chrome was closed or crashed with the ZIP on its way, or the
 * download's last event never arrived. Without this it would stay saving for good, with no Cancel or Save again to
 * leave it by, and Start refused.
 */
async function settleSave(run: RunState): Promise<void> {
  const id = run.downloadId;
  const [item] = id === undefined ? [] : await chrome.downloads.search({ id }).catch(() => []);
  // The download's own event may have settled the run while Chrome was asked.
  if (run.status !== 'saving') return;
  const outcome = savingOutcome(item?.state);
  if (outcome === 'complete') await onDownloadChanged({ id: id as number, state: { current: 'complete' } });
  else if (outcome === 'interrupted') await saveFailed(run, item?.error || 'it stopped before it finished, perhaps when Chrome closed');
}

/** Lets go of the run's ZIP blob, if it holds one. */
async function dropBlob(run: RunState): Promise<void> {
  if (!run.blobUrl) return;
  await revokeBlob(run.blobUrl);
  run.blobUrl = undefined;
}

async function saveFailed(run: RunState, reason: string): Promise<void> {
  run.status = 'error';
  // Save again builds the ZIP afresh from staging: this one is no use, and holds the whole export in memory.
  await dropBlob(run);
  run.message = 'The ZIP could not be saved (' + reason + '). Your files are still collected: press “Save again”.';
  await save();
  await notify('attention', 'Export not saved', run.message);
}

export async function onDownloadChanged(delta: chrome.downloads.DownloadDelta): Promise<void> {
  const run = await loadRun();
  if (!run || run.downloadId !== delta.id || run.status !== 'saving') return;
  if (delta.state?.current === 'complete') {
    // Before anything is awaited: settleSave and the download's own event can both get here, and only one finishes.
    run.status = 'done';
    const problems = await listProblems();
    run.problems = problems.slice(0, 50);
    run.problemCount = problems.length;
    run.finishedAt = new Date().toISOString();
    if (run.downloadStartedAt) run.timings = { ...run.timings, 'save:download': { ms: Date.now() - run.downloadStartedAt, requests: 0 } };
    run.percent = 100;
    run.next = PLAN.length;
    run.message = undefined;
    run.errorDetail = undefined;
    await dropBlob(run);
    await save();
    await clearStaging();
    await chrome.storage.session.remove('session');
    await chrome.alarms.clear(HEARTBEAT);
    await closeOffscreen();
    const p = run.problemCount;
    await notify('ready', 'Export ready', run.zipName + ': ' + (run.fileCount ?? 0).toLocaleString('en-US') + ' files.' + (p ? ' ' + p + (p === 1 ? ' item' : ' items') + ' couldn’t be exported.' : ''));
  } else if (delta.state?.current === 'interrupted') {
    await saveFailed(run, delta.error?.current || 'interrupted');
  }
}

export async function retrySave(): Promise<void> {
  const run = await loadRun();
  if (!run || run.status !== 'error' || run.next !== PLAN.indexOf('save')) throw new UserError('Nothing to save again.');
  run.status = 'running';
  run.message = undefined;
  run.errorDetail = undefined;
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
