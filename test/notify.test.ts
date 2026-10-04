import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notify, noticeKind, READY_BUTTONS } from '../src/extension/background/ui';

let created: { id: string; options: chrome.notifications.NotificationCreateOptions }[];

beforeEach(() => {
  created = [];
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => 'chrome-extension://id/' + path },
    notifications: {
      create: async (id: string, options: chrome.notifications.NotificationCreateOptions) => void created.push({ id, options }),
    },
  });
});

describe('notify', () => {
  it('offers the AI assistant page on the finished export, and nothing on a call for attention', async () => {
    await notify('ready', 'Export ready', 'maccabi-export-2026-09-29.zip: 812 files.');
    await notify('attention', 'Export paused', 'Log in again.');
    expect(created.map((c) => noticeKind(c.id))).toEqual(['ready', 'attention']);
    expect(created[0].options.buttons).toEqual([{ title: 'See how to open it in your AI assistant' }]);
    expect(READY_BUTTONS[0].page).toBe('ai-assistant.html');
    expect(created[1].options.buttons).toBeUndefined();
  });
});
