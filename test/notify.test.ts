import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notify, noticeKind, READY_BUTTONS, updateBadge } from '../src/extension/background/ui';
import type { RunState } from '../src/extension/shared/state';

let created: { id: string; options: chrome.notifications.NotificationCreateOptions }[];
let badge: { text?: string; color?: string; textColor?: string; title?: string };

beforeEach(() => {
  created = [];
  badge = {};
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => 'chrome-extension://id/' + path },
    notifications: {
      create: async (id: string, options: chrome.notifications.NotificationCreateOptions) => void created.push({ id, options }),
    },
    action: {
      setBadgeText: async ({ text }: { text: string }) => void (badge.text = text),
      setBadgeBackgroundColor: async ({ color }: { color: string }) => void (badge.color = color),
      setBadgeTextColor: async ({ color }: { color: string }) => void (badge.textColor = color),
      setTitle: async ({ title }: { title: string }) => void (badge.title = title),
    },
  });
});

describe('notify', () => {
  it('offers how to open it in an AI assistant on the finished export, and nothing on a call for attention', async () => {
    await notify('ready', 'Export ready', 'maccabi-export-2026-09-29.zip: 812 files.');
    await notify('attention', 'Export paused', 'Log in again.');
    expect(created.map((c) => noticeKind(c.id))).toEqual(['ready', 'attention']);
    expect(created[0].options.buttons).toEqual([{ title: 'Open it in an AI' }]);
    expect(READY_BUTTONS[0].url).toBe('https://maccabi.ronirachmani.com/#where');
    expect(created[1].options.buttons).toBeUndefined();
  });
});

describe('updateBadge', () => {
  const run = (status: RunState['status'], more: Partial<RunState> = {}) => ({ status, percent: 42, ...more }) as RunState;

  it('shows the progress while running, and a mark in the popup\'s colours when the run needs the member or has ended', async () => {
    await updateBadge(run('running', { detail: 'test results' }));
    expect(badge).toEqual({ text: '42%', color: '#296bed', textColor: '#ffffff', title: 'Health Records Takeout: Exporting: 42%, test results' });
    await updateBadge(run('saving'));
    expect(badge.title).toBe('Health Records Takeout: Exporting: 42%');
    await updateBadge(run('paused_hidden'));
    expect(badge).toEqual({ text: '!', color: '#e19a2b', textColor: '#16233b', title: 'Health Records Takeout: Export paused: needs you' });
    await updateBadge(run('done'));
    expect(badge).toMatchObject({ text: '✓', color: '#1a7a48', title: 'Health Records Takeout: Export saved' });
    await updateBadge(run('error'));
    expect(badge).toMatchObject({ text: '×', color: '#c62a41', title: 'Health Records Takeout: Export stopped' });
  });

  it('clears the badge, and gives the manifest\'s title back, with no run', async () => {
    await updateBadge(null);
    expect(badge).toEqual({ text: '', color: '#296bed', textColor: '#ffffff', title: '' });
  });
});

describe('notify, when Chrome refuses', () => {
  it('lets the run go on: the popup shows the same state', async () => {
    vi.stubGlobal('chrome', { runtime: { getURL: () => '' }, notifications: { create: async () => Promise.reject(new Error('off')) } });
    await notify('attention', 'Export paused', 'Log in again.');
  });
});
