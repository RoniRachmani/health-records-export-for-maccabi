import { errMessage } from '../../core';
import { routeMessage } from '../shared/gate';
import { MACCABI_ORIGIN, TERMS_EFFECTIVE, type Request, type StateReply } from '../shared/state';
import { handleDev } from './dev';
import { cancel, dismiss, EXPIRY, focusRunTab, loadRun, onDownloadChanged, recover, resume, retrySave, saveNow, showFile, start, UserError } from './runner';
import { tabInfo } from './tab';
import { noticeKind, READY_BUTTONS } from './ui';

/**
 * The effective date of the terms the user accepted, kept in chrome.storage.local until the extension is removed.
 * Terms with a later date, or the `true` earlier builds stored, show the notice again.
 */
async function noticeAccepted(): Promise<boolean> {
  return (await chrome.storage.local.get('noticeAccepted')).noticeAccepted === TERMS_EFFECTIVE;
}

async function activeTab(tabId?: number): Promise<chrome.tabs.Tab | undefined> {
  if (tabId !== undefined) return chrome.tabs.get(tabId).catch(() => undefined);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

/** Active dev switches from storage, for the dev build's popup banner; compiled out of the store build. */
async function activeDevFlags(): Promise<string[]> {
  if (!__DEV_BRIDGE__) return [];
  const s = await chrome.storage.local.get(['devSkipOrder', 'devStopBefore', 'devReorder', 'devPretendOrder', 'devNoSend']);
  const flags: string[] = [];
  if (s.devSkipOrder) flags.push('skipOrder');
  if (s.devStopBefore) flags.push('stopBefore=' + String(s.devStopBefore));
  if (s.devReorder) flags.push('reorder');
  if (s.devPretendOrder) flags.push('pretendOrder=' + String(s.devPretendOrder));
  if (s.devNoSend) flags.push('noSend');
  return flags;
}

async function handle(msg: Request & { tabId?: number }): Promise<unknown> {
  switch (msg.type) {
    case 'getState': {
      const run = await loadRun();
      const accepted = await noticeAccepted();
      // Nothing is read from the tab until the notice is accepted. The name is shown only on the idle view.
      const tab = run || accepted ? await tabInfo(await activeTab(msg.tabId), !run) : { onMaccabi: false, loggedIn: false };
      const reply: StateReply = { run, noticeAccepted: accepted, tab };
      if (__DEV_BRIDGE__) {
        const flags = await activeDevFlags();
        if (flags.length) reply.devFlags = flags;
      }
      return reply;
    }
    case 'acceptNotice':
      await chrome.storage.local.set({ noticeAccepted: TERMS_EFFECTIVE });
      return { ok: true };
    case 'start': {
      if (!(await noticeAccepted())) throw new UserError('Read “How the export works” and agree to it first.');
      const tab = await activeTab(msg.tabId);
      if (tab?.id === undefined) throw new UserError('Open the Maccabi Online tab, then click the extension’s icon.');
      await start(tab.id);
      return { ok: true };
    }
    case 'resume': {
      const tab = await activeTab(msg.tabId);
      if (tab?.id === undefined) throw new UserError('Open the Maccabi Online tab, then click the extension’s icon.');
      await resume(tab.id);
      return { ok: true };
    }
    case 'cancel':
      await cancel();
      return { ok: true };
    case 'dismiss':
      await dismiss();
      return { ok: true };
    case 'retrySave':
      await retrySave();
      return { ok: true };
    case 'saveNow':
      await saveNow();
      return { ok: true };
    case 'showFile':
      await showFile();
      return { ok: true };
    case 'openMaccabi':
      await chrome.tabs.create({ url: MACCABI_ORIGIN + '/' });
      return { ok: true };
    case 'focusTab':
      await focusRunTab();
      return { ok: true };
  }
  return { error: 'unknown request' };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const route = routeMessage(msg, sender, chrome.runtime.id, !!handleDev);
  if (route === 'ignore') return false;
  const work = route === 'dev' && handleDev ? handleDev(msg, sender) : route === 'handle' ? handle(msg) : Promise.resolve({ error: 'not allowed' });
  work.then(reply, (e: unknown) => reply({ error: errMessage(e), user: e instanceof UserError }));
  return true;
});

// Earlier versions kept the first-export notice under prefs; the notice under noticeAccepted adds the Terms and Privacy Policy.
chrome.runtime.onInstalled.addListener(() => void chrome.storage.local.remove('prefs'));
chrome.downloads.onChanged.addListener((delta) => void onDownloadChanged(delta));
chrome.notifications.onClicked.addListener((id) => {
  const kind = noticeKind(id);
  if (!kind) return;
  void (kind === 'ready' ? showFile() : focusRunTab()).catch(() => undefined);
  void chrome.notifications.clear(id);
});
chrome.notifications.onButtonClicked.addListener((id, index) => {
  const url = noticeKind(id) === 'ready' && READY_BUTTONS[index]?.url;
  if (!url) return;
  void chrome.tabs.create({ url });
  void chrome.notifications.clear(id);
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'hrem-heartbeat' || a.name === EXPIRY) void recover('heartbeat');
});
chrome.runtime.onStartup.addListener(() => void recover('startup'));
// A service worker restarted mid-run (not a browser restart) continues where it stopped.
void recover('heartbeat');
