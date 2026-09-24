// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN, type RunState, type StateReply } from '../src/extension/shared/state';

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

let reply: StateReply;
let sent: { type: string }[];
let listeners: Listener[];

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
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '9.9.9' }),
      sendMessage: async (msg: { type: string }) => {
        sent.push(msg);
        return msg.type === 'getState' ? structuredClone(reply) : { ok: true };
      },
    },
    storage: { onChanged: { addListener: (l: Listener) => listeners.push(l) } },
    tabs: { query: async () => [{ id: 1 }] },
  });
});

describe('popup', () => {
  const tab = { onMaccabi: true, loggedIn: true, tabId: 1 };

  it('shows the first-use notice, linking the Terms and Privacy Policy, until it is accepted', async () => {
    await openPopup({ run: null, noticeAccepted: false, tab: { onMaccabi: false, loggedIn: false } });
    expect(document.querySelector('h2')?.textContent).toBe('How the export works');
    expect(document.querySelector('.points')?.textContent).toContain('Use it only with your own account');
    expect(document.querySelector('.note.warn')?.textContent).toContain('Each export orders a fresh copy of your full medical file.');
    expect(document.querySelector('.note.warn')?.textContent).toContain('a wider range than the site’s own form offers');
    const links = [...document.querySelectorAll('.consent a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]);
    expect(links).toEqual([['Terms of Use', '/terms.html', '_blank'], ['Privacy Policy', '/privacy.html', '_blank']]);
    expect(document.querySelectorAll('button')).toHaveLength(1);

    reply = { ...reply, noticeAccepted: true, tab };
    buttonNamed('Agree and continue').click();
    await flush();
    expect(sent.map((m) => m.type)).toContain('acceptNotice');
    expect(buttonNamed('Start export')).toBeTruthy();
  });

  it('applies progress in place, keeping the Stop button under the pointer', async () => {
    await openPopup({ run: running({ fileCount: 40, byteCount: 2_300_000 }), tab });
    const stop = buttonNamed('Stop');
    expect(document.querySelector('.status')?.textContent).toBe('Exporting · 12%');
    expect(document.querySelector('h2')?.textContent).toBe('Test results');
    expect(document.querySelector('.detail')?.textContent).toBe('Saving how each lab value changed over time');
    expect(document.querySelector('.stats')?.textContent).toBe('40 files · 2.3 MB · 6 min elapsed');

    storageChange(running({ next: PLAN.indexOf('approvals'), percent: 48, detail: 'Approvals: approvals', fileCount: 212, byteCount: 14_800_000 }));
    expect(buttonNamed('Stop')).toBe(stop);
    expect(document.querySelector('.status')?.textContent).toBe('Exporting · 48%');
    expect(document.querySelector('.detail')?.textContent).toBe('Downloading each approval as a PDF');
    expect(document.querySelector('.stats')?.textContent).toBe('212 files · 15 MB · 6 min elapsed');
    expect(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('48');
    expect(document.querySelector('.stages [aria-current=step]')?.textContent).toBe('Referrals, approvals and information pages');
    expect(document.querySelectorAll('.stages li.done')).toHaveLength(6);
    expect(document.querySelector('.sections-label')?.textContent).toBe('Sections6 of 13 done');
  });

  it('confirms Stop inline, then shows Stopping until the run is gone', async () => {
    await openPopup({ run: running(), tab });
    buttonNamed('Stop').click();
    expect(document.querySelector('.confirm')).not.toBeNull();

    buttonNamed('Keep exporting').click();
    expect(document.querySelector('.confirm')).toBeNull();

    buttonNamed('Stop').click();
    buttonNamed('Stop and delete').click();
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
    expect(document.querySelector('.note')?.textContent).toContain('Maccabi Healthcare Services will text you.');
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
