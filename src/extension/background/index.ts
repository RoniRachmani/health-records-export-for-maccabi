import { errMessage } from '../../core';
import { MACCABI_ORIGIN, TERMS_EFFECTIVE, type Request, type StateReply } from '../shared/state';
import { handleDev } from './dev';
import { cancel, dismiss, focusRunTab, loadRun, onDownloadChanged, recover, resume, retrySave, showFile, start, UserError } from './runner';
import { tabInfo } from './tab';
import { noticeKind } from './ui';

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

async function handle(msg: Request & { tabId?: number }): Promise<unknown> {
  switch (msg.type) {
    case 'getState': {
      const run = await loadRun();
      const accepted = await noticeAccepted();
      // Nothing is read from the tab until the notice is accepted. The name is shown only on the idle view.
      const tab = run || accepted ? await tabInfo(await activeTab(msg.tabId), !run) : { onMaccabi: false, loggedIn: false };
      const reply: StateReply = { run, noticeAccepted: accepted, tab };
      return reply;
    }
    case 'acceptNotice':
      await chrome.storage.local.set({ noticeAccepted: TERMS_EFFECTIVE });
      return { ok: true };
    case 'start': {
      if (!(await noticeAccepted())) throw new UserError('Please read and accept the notice first.');
      const tab = await activeTab(msg.tabId);
      if (tab?.id === undefined) throw new UserError('No active tab.');
      await start(tab.id);
      return { ok: true };
    }
    case 'resume': {
      const tab = await activeTab(msg.tabId);
      if (tab?.id === undefined) throw new UserError('No active tab.');
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
  if (!msg || msg.target === 'offscreen') return false;
  // Only this extension's own pages (and, in the development build, its bridge content script).
  if (sender.id !== chrome.runtime.id) return false;
  const isDev = typeof msg.type === 'string' && msg.type.startsWith('dev:');
  const work = isDev && handleDev ? handleDev(msg, sender) : isDev || sender.tab ? Promise.resolve({ error: 'not allowed' }) : handle(msg);
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
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'hrem-heartbeat') void recover('heartbeat');
});
chrome.runtime.onStartup.addListener(() => void recover('startup'));
// A service worker restarted mid-run (not a browser restart) continues where it stopped.
void recover('heartbeat');
