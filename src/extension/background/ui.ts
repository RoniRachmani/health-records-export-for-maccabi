import type { RunState } from '../shared/state';

export async function updateBadge(run: RunState | null): Promise<void> {
  let text = '';
  // Badge colours from the popup's palette (popup.css); store/src/stage.ts uses the same.
  let color = '#296bed';
  let textColor = '#ffffff';
  let title = '';
  if (run) {
    switch (run.status) {
      case 'running':
      case 'saving':
        text = run.percent + '%';
        title = 'Exporting: ' + run.percent + '%' + (run.detail ? ', ' + run.detail : '');
        break;
      case 'paused_session':
      case 'paused_hidden':
        text = '!';
        color = '#e19a2b';
        textColor = '#16233b';
        title = 'Export paused: needs you';
        break;
      case 'done':
        text = '✓';
        color = '#1a7a48';
        title = 'Export saved';
        break;
      case 'error':
        text = '×';
        color = '#c62a41';
        title = 'Export failed';
        break;
    }
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor({ color: textColor });
  // An empty title restores the manifest's default_title.
  await chrome.action.setTitle({ title: title && 'Health Records Export: ' + title });
}

/** 'ready' notifications open the saved ZIP when clicked; 'attention' ones bring the Maccabi tab to the front. */
export type NoticeKind = 'ready' | 'attention';

export function noticeKind(notificationId: string): NoticeKind | null {
  const m = /^hrem-(ready|attention)-/.exec(notificationId);
  return m ? (m[1] as NoticeKind) : null;
}

export async function notify(kind: NoticeKind, title: string, message: string): Promise<void> {
  try {
    await chrome.notifications.create('hrem-' + kind + '-' + Date.now(), {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message,
      priority: 1,
    });
  } catch {
    /* notifications are a convenience; the popup shows the same state */
  }
}
