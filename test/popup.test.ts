// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN, type RunState, type StateReply } from '../src/extension/shared/state';

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

let reply: StateReply;
let sent: { type: string }[];
let listeners: Listener[];
let windows: chrome.windows.CreateData[];

function running(over: Partial<RunState> = {}): RunState {
  return {
    id: 'r1', status: 'running', tabId: 1, startedAt: new Date(Date.now() - 6 * 60_000).toISOString(), next: PLAN.indexOf('testResults'),
    ctx: {} as RunState['ctx'], stepDone: 1, stepTotal: 10, percent: 12, detail: 'Test results: lab histories', ...over,
  };
}

/** The notice counts as accepted unless the state says otherwise. */
async function openPopup(state: Omit<StateReply, 'noticeAccepted'> & { noticeAccepted?: boolean }): Promise<void> {
  reply = { noticeAccepted: true, ...state };
  document.body.innerHTML = '<span id="version"></span><main id="view"></main><p id="announce"></p>';
  vi.resetModules();
  await import('../src/extension/popup/popup');
  await vi.waitFor(() => expect(sent.some((m) => m.type === 'getState')).toBe(true));
  await flush();
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function storageChange(run: RunState | null): void {
  reply = { ...reply, run };
  for (const l of listeners) l({ run: { newValue: run ?? undefined } }, 'local');
}

function buttonNamed(name: string): HTMLButtonElement {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === name);
  if (!b) throw new Error('no button "' + name + '" in: ' + document.getElementById('view')?.textContent);
  return b as HTMLButtonElement;
}

beforeEach(() => {
  sent = [];
  listeners = [];
  windows = [];
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '9.9.9' }),
      getURL: (path: string) => 'chrome-extension://id' + path,
      sendMessage: async (msg: { type: string }) => {
        sent.push(msg);
        return msg.type === 'getState' ? structuredClone(reply) : { ok: true };
      },
    },
    storage: { onChanged: { addListener: (l: Listener) => listeners.push(l) } },
    tabs: { query: async () => [{ id: 1 }] },
    windows: { create: async (data: chrome.windows.CreateData) => void windows.push(data) },
  });
});

describe('popup', () => {
  const tab = { onMaccabi: true, loggedIn: true, tabId: 1 };

  it('shows the first-use notice, linking the Terms and Privacy Policy, until it is accepted', async () => {
    await openPopup({ run: null, noticeAccepted: false, tab: { onMaccabi: false, loggedIn: false } });
    expect(document.querySelector('h2')?.textContent).toBe('How the export works');
    expect(document.querySelector('.points')?.textContent).toContain('Only for records you may legally access.');
    expect(document.querySelector('.note.warn')?.textContent).toContain('Each export orders a fresh copy of your full medical file.');
    expect(document.querySelector('.note.warn')?.textContent).toContain('a wider range than the site’s own form offers');
    // The order is the one thing here with consequences: it comes before the points, above the fold.
    const main = [...document.querySelectorAll('.note.warn, .points')];
    expect(main.map((e) => e.className)).toEqual(['note warn', 'points']);
    const links = [...document.querySelectorAll('.consent a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]);
    expect(links).toEqual([['Terms of Use', '/terms.html', '_blank'], ['Privacy Policy', '/privacy.html', '_blank']]);
    expect(document.querySelectorAll('button')).toHaveLength(1);

    reply = { ...reply, noticeAccepted: true, tab };
    buttonNamed('Agree and continue').click();
    await flush();
    expect(sent.map((m) => m.type)).toContain('acceptNotice');
    expect(buttonNamed('Start export')).toBeTruthy();
    // What the ZIP is for, before the first export as after it.
    const then = [...document.querySelectorAll('.note')].find((n) => n.textContent?.startsWith('Then:'));
    expect(then?.textContent).toBe('Then: ask an AI assistant about your records. See how');
    expect([then?.querySelector('a')?.getAttribute('href'), then?.querySelector('a')?.getAttribute('target')]).toEqual(['/ai-assistant.html', '_blank']);
  });

  it('has a one-line header with the Unofficial chip, and a footer grouped by purpose', () => {
    // Without its stylesheet, which happy-dom would try to fetch.
    const html = readFileSync('src/extension/popup/popup.html', 'utf8').replace(/<link [^>]*>/g, '');
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(page.querySelector('header h1')?.textContent).toBe('Health Records Export');
    const chip = page.querySelector('header .chip') as HTMLElement;
    expect(chip.firstChild?.textContent).toBe('Unofficial');
    expect(chip.title).toBe('Not affiliated with Maccabi Healthcare Services');
    // Screen readers hear the whole disclaimer, not only "Unofficial".
    expect(chip.textContent).toBe('Unofficial: not affiliated with Maccabi Healthcare Services');
    expect(chip.querySelector('.visually-hidden')).not.toBeNull();
    expect(page.querySelector('.tagline')).toBeNull();

    const footer = page.querySelector('footer') as HTMLElement;
    expect(footer.textContent).not.toContain('No servers');
    const groups = [...footer.querySelectorAll('nav')].map((nav) =>
      [...nav.querySelectorAll('a')].map((a) => [a.textContent?.trim() || a.getAttribute('aria-label'), a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]));
    const repo = 'https://github.com/RoniRachmani/health-records-export-for-maccabi';
    expect(groups).toEqual([
      [['Privacy', '/privacy.html', '_blank', null], ['Terms', '/terms.html', '_blank', null]],
      [['Report a problem', repo + '/issues/new/choose', '_blank', 'noreferrer'], ['Source code on GitHub', repo, '_blank', 'noreferrer']],
    ]);
    expect(footer.querySelector('nav:last-child #version')).not.toBeNull();
    expect([...footer.querySelectorAll('.sep')].every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('applies progress in place, keeping the Cancel button under the pointer', async () => {
    await openPopup({ run: running({ fileCount: 40, byteCount: 2_300_000, items: { done: 38, total: 61 } }), tab });
    const cancel = buttonNamed('Cancel export');
    // The panel, in reading order: status and Cancel, what is happening and its count, the bar, the totals.
    const panel = document.querySelector('.panel') as HTMLElement;
    expect([...panel.children].map((e) => e.className)).toEqual(['status-row', 'activity', 'bar active', 'stats']);
    expect(document.querySelector('.status')?.textContent).toBe('Exporting · 12%');
    expect(panel.querySelector('.activity .what')?.textContent).toBe('Saving how each lab value changed over time');
    expect(panel.querySelector('.activity .count')?.textContent).toBe('38 of 61');
    expect(document.querySelector('.stats')?.textContent).toBe('40 files · 2.3 MB · 6 min elapsed');
    // The list names the sections: the current line by its name only.
    expect(document.querySelector('.stages [aria-current=step]')?.textContent).toBe('Lab histories');
    expect(document.querySelector('.stages .detail')).toBeNull();
    expect(document.getElementById('view')?.textContent).not.toMatch(/sections/);
    expect(document.querySelector('.reminder')?.textContent).toBe('Keep the Maccabi Online tab open and in front.');
    expect(document.querySelector('.reminder svg')?.getAttribute('aria-hidden')).toBe('true');

    storageChange(running({
      next: PLAN.indexOf('approvals'), percent: 48, detail: 'Approvals: approvals', fileCount: 212, byteCount: 14_800_000,
      filesByKey: { profileAndDoctors: 6, 'testResults:test results': 96, 'testResults:lab histories': 61, visits: 1, 'visits:visits': 30 },
    }));
    expect(buttonNamed('Cancel export')).toBe(cancel);
    expect(document.querySelector('.status')?.textContent).toBe('Exporting · 48%');
    expect(panel.querySelector('.activity .what')?.textContent).toBe('Downloading each approval as a PDF');
    // No count reported: no right side.
    expect(panel.querySelector('.activity .count')?.textContent).toBe('');
    expect(document.querySelector('.stats')?.textContent).toBe('212 files · 15 MB · 6 min elapsed');
    expect(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('48');
    expect(document.querySelector('.stages [aria-current=step] .name')?.textContent).toBe('Approvals');
    expect(document.querySelectorAll('.stages li.done')).toHaveLength(10);
    // Finished lines show the files they collected, and nothing when there were none.
    const counts = Object.fromEntries([...document.querySelectorAll('.stages li')].map((li) => [li.querySelector('.name')?.textContent, li.querySelector('.count')?.textContent]));
    expect(counts).toMatchObject({
      'Ordering your medical file': '', 'Your details and doctor': '6 files', 'Test results': '96 files', 'Lab histories': '61 files',
      'Visit summaries': '31 files', Referrals: '', Approvals: '',
    });
    // The band covers the rest of the current section, from the fill's end.
    const band = document.querySelector('.bar .band') as HTMLElement;
    expect(band.style.left).toBe('48%');
    expect(parseFloat(band.style.width)).toBeGreaterThan(0);
  });

  it('keeps the reminder strip saying what to do', async () => {
    await openPopup({ run: running({ next: PLAN.indexOf('waitMedicalFile'), detail: 'Collecting your medical file: medical file status 2' }), tab });
    expect(document.querySelector('.reminder')?.textContent).toBe('While you wait: what to ask your AI assistant');
    expect(document.querySelector('.reminder')?.classList.contains('waiting')).toBe(true);
    // In a window of its own, so the Maccabi Online tab stays in front of its own.
    (document.querySelector('.reminder a') as HTMLAnchorElement).click();
    expect(windows).toEqual([{ url: 'chrome-extension://id/ai-assistant.html', width: 1100, height: 860, focused: true }]);
    storageChange(running({ status: 'saving', next: PLAN.indexOf('save'), detail: 'Saving the ZIP' }));
    expect(document.querySelector('.reminder')?.textContent).toBe('It will be in your Downloads folder in a moment.');
    expect(document.querySelector('.reminder')?.classList.contains('waiting')).toBe(false);
    expect(document.querySelector('.status')?.textContent).toBe('Saving');
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Cancel export');
  });

  it('confirms Cancel inline, then shows Stopping until the run is gone', async () => {
    await openPopup({ run: running(), tab });
    buttonNamed('Cancel export').click();
    expect(document.querySelector('.confirm p')?.textContent).toBe('Cancel the export and delete the files collected so far?');
    expect(document.querySelector('.stages')).toBeNull();

    buttonNamed('Keep exporting').click();
    expect(document.querySelector('.confirm')).toBeNull();

    buttonNamed('Cancel export').click();
    buttonNamed('Delete and stop').click();
    await flush();
    expect(sent.map((m) => m.type)).toContain('cancel');
    expect(document.querySelector('h2')?.textContent).toBe('Stopping the export…');

    reply = { ...reply, run: null };
    storageChange(null);
    await flush();
    expect(buttonNamed('Start export')).toBeTruthy();
  });

  it('offers to switch tabs when a paused export is opened elsewhere', async () => {
    const paused = running({ status: 'paused_session', message: 'Your Maccabi Healthcare Services session ended.' });
    await openPopup({ run: paused, tab: { onMaccabi: false, loggedIn: false } });
    buttonNamed('Go to the Maccabi Online tab').click();
    await flush();
    expect(sent.map((m) => m.type)).toContain('focusTab');
  });

  it('names the logged-in member when the name is known', async () => {
    await openPopup({ run: null, tab: { ...tab, name: 'נועה' } });
    expect(document.querySelector('.account')?.textContent).toBe('Logged in as נועה');
    expect(document.querySelector('.account bdi')?.textContent).toBe('נועה');

    await openPopup({ run: null, tab });
    expect(document.querySelector('.account')?.textContent).toBe('Logged in to Maccabi Online');
  });

  it('offers Start export straight away, with the SMS warning beside it', async () => {
    await openPopup({ run: null, tab });
    expect(buttonNamed('Start export')).toBeTruthy();
    expect(document.querySelector('.note')?.textContent).toContain('Maccabi will text you:');
    expect(document.querySelector('details.more')?.hasAttribute('open')).toBe(false);

    buttonNamed('Start export').click();
    await flush();
    expect(sent.map((m) => m.type)).toContain('start');
  });

  it('reports the full problem count when only the first problems are kept', async () => {
    const problems = Array.from({ length: 50 }, (_, i) => ({ where: 'test-results/files/' + i + '.pdf', what: 'HTTP 500', at: '' }));
    const done = running({ status: 'done', next: PLAN.length, percent: 100, fileCount: 1234, zipName: 'maccabi-export-2026-09-17.zip', finishedAt: new Date().toISOString(), problems, problemCount: 73 });
    await openPopup({ run: done, tab });
    expect(document.querySelector('details.problems summary')?.textContent).toBe('73 items could not be exported');
    expect(document.querySelector('details.problems')?.textContent).toContain('Showing the first 50.');
    expect(document.querySelector('.file-card')?.textContent).toContain('1,234 files · took 6 min · in your Downloads folder');

    await openPopup({ run: { ...done, zipBytes: 48_200_000 }, tab });
    expect(document.querySelector('.file-card')?.textContent).toContain('1,234 files · 48 MB · took 6 min');
  });

  it('pairs the done buttons, and ends on the caution about what the ZIP holds', async () => {
    const done = running({ status: 'done', next: PLAN.length, percent: 100, fileCount: 12, zipName: 'maccabi-export-2026-09-17.zip', finishedAt: new Date().toISOString() });
    await openPopup({ run: done, tab });
    const row = buttonNamed('Show in folder').parentElement as HTMLElement;
    expect([...row.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Show in folder', 'Done']);
    expect(row.classList.contains('actions')).toBe(true);
    const caution = document.querySelector('#view > :last-child') as HTMLElement;
    expect(caution.className).toBe('caution');
    expect(caution.textContent).toBe('The ZIP contains sensitive health information. Store and share it with care.');
    expect(caution.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
