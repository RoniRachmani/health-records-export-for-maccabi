import { PLAN, type Request, type RunState, type StateReply } from '../shared/state';
import {
  countOf, formatBytes, formatDuration, groupProblems, STAGES, stageStates, statsText, stepText, viewKey, type Confirm, type UiFlags,
} from './model';

const view = document.getElementById('view') as HTMLElement;
const announcer = document.getElementById('announce') as HTMLElement;
(document.getElementById('version') as HTMLElement).textContent = 'v' + chrome.runtime.getManifest().version;

let tabId: number | undefined;
let last: StateReply | null = null;
const ui: UiFlags = { busy: null, confirm: null, stopping: false, error: '' };
/** The run a successful Cancel applies to, until it disappears. */
let stoppingRunId: string | null = null;
let renderedKey = '';
let announced: string | null = null;

/** Nodes that progress updates write to in place. */
let live: {
  status?: HTMLElement;
  title?: HTMLElement;
  detail?: HTMLElement;
  bar?: HTMLElement;
  fill?: HTMLElement;
  stats?: HTMLElement;
  stages?: HTMLElement[];
  stagesDone?: HTMLElement;
  hint?: HTMLElement;
} = {};

type Child = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  for (const c of children) if (c) el.append(c);
  return el;
}

// ---- messaging ---------------------------------------------------------
async function send(req: Request): Promise<({ error?: string } & Record<string, unknown>) | undefined> {
  return chrome.runtime.sendMessage({ ...req, tabId });
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function act(req: Request): Promise<void> {
  if (ui.busy) return;
  const runId = last?.run?.id;
  ui.busy = req.type;
  ui.error = '';
  render();
  try {
    const res = await send(req);
    if (res && res.error) ui.error = res.error;
    else if (req.type === 'cancel' && runId) stoppingRunId = runId;
  } catch (e) {
    ui.error = errText(e);
  }
  ui.busy = null;
  ui.confirm = null;
  await refresh();
}

async function refresh(): Promise<void> {
  try {
    const reply = await send({ type: 'getState' });
    if (!reply || reply.error) throw new Error(reply?.error || 'no reply');
    last = reply as unknown as StateReply;
  } catch (e) {
    ui.error = 'Could not reach the extension (' + errText(e) + ').';
  }
  render();
}

// ---- building blocks ---------------------------------------------------
function button(label: string, onClick: () => void, cls = ''): HTMLElement {
  const b = h('button', { type: 'button', ...(cls ? { class: cls } : {}) }, label);
  // aria-disabled rather than disabled: a disabled button drops keyboard focus.
  if (ui.busy) b.setAttribute('aria-disabled', 'true');
  b.addEventListener('click', () => {
    if (!ui.busy) onClick();
  });
  return b;
}

/** A button that sends req; while it waits for the reply it shows a spinner and busyLabel. */
function actionButton(label: string, req: Request, cls = '', busyLabel = label): HTMLElement {
  const busyHere = ui.busy === req.type;
  const b = button(busyHere ? busyLabel : label, () => void act(req), cls + (busyHere ? ' busy' : ''));
  if (busyHere) {
    b.prepend(h('span', { class: 'spinner', 'aria-hidden': 'true' }));
    b.dataset.autofocus = '';
  }
  return b;
}

function actions(...children: Child[]): HTMLElement {
  return h('div', { class: 'actions' }, ...children);
}

/** actions() for a view taller than the popup: the row stays at the bottom edge while the text scrolls. */
function stickyActions(...children: Child[]): HTMLElement {
  return h('div', { class: 'actions sticky' }, ...children);
}

/** The small status pill above a view's heading; kind colours it. */
function status(text: string, kind: '' | 'ok' | 'warn' | 'err' = ''): HTMLElement {
  return h('p', { class: 'status' + (kind ? ' ' + kind : '') }, text);
}

/** A remark in a soft panel, set apart from the flow; warn and err tint it and give it a border. */
function note(kind: '' | 'warn' | 'err', ...children: Child[]): HTMLElement {
  return h('div', { class: 'note' + (kind ? ' ' + kind : '') }, ...children);
}

function askConfirm(kind: Confirm): void {
  ui.confirm = kind;
  render();
}

function confirmPanel(question: string, yes: string, req: Request, busyLabel: string, no: string): HTMLElement {
  const keep = button(no, () => {
    ui.confirm = null;
    render();
  });
  if (!ui.busy) keep.dataset.autofocus = '';
  return h('div', { class: 'confirm', role: 'group', 'aria-label': question },
    h('p', {}, question),
    actions(keep, actionButton(yes, req, 'danger', busyLabel)));
}

function cancelButton(cls = ''): HTMLElement {
  return button('Stop', () => askConfirm('cancel'), cls);
}

function cancelConfirm(): HTMLElement {
  return confirmPanel('Stop the export and delete the files collected so far?', 'Stop and delete', { type: 'cancel' }, 'Stopping…', 'Keep exporting');
}

function progressBar(percent: number, active: boolean): { bar: HTMLElement; fill: HTMLElement } {
  const fill = h('div', { class: 'fill' });
  fill.style.width = percent + '%';
  const bar = h('div', {
    class: 'bar' + (active ? ' active' : ''), role: 'progressbar', 'aria-label': 'Export progress',
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent),
  }, fill);
  return { bar, fill };
}

function hintFor(run: RunState): string {
  if (run.status === 'saving') return 'Building the ZIP. It will be in your Downloads folder in a moment.';
  // Two lines at most, in any font: the running view has no room to spare under Chrome's 600px cap.
  if (PLAN[run.next] === 'waitMedicalFile') return 'The file is usually ready within minutes, 15 at most. You can close this popup.';
  return 'Keep the Maccabi Online tab open and in front. You can close this popup.';
}

// ---- views -------------------------------------------------------------
/** Shown once, before anything is read from the tab. The links open the pages shipped in the extension. */
function noticeView(): Child[] {
  const link = (href: string, text: string) => h('a', { href, target: '_blank' }, text);
  return [
    status('Before you start'),
    h('h2', {}, 'How the export works'),
    h('ul', { class: 'points' },
      h('li', {}, 'It reads your records from Maccabi Online while you are logged in, and saves them as one ZIP file on this computer. Nothing is sent anywhere else.'),
      h('li', {}, 'Use it only with your own account, or one whose records you are legally entitled to access.'),
      h('li', {}, 'While it works, your Maccabi Online tab moves to the medical-file page and back, and it keeps your session from timing out until the export finishes.'),
      h('li', {}, 'The ZIP contains sensitive health information. Store and share it with care.')),
    note('warn', h('strong', {}, 'Each export orders a fresh copy of your full medical file.'),
      ' It asks for your whole history, a wider range than the site’s own form offers. Maccabi Healthcare Services texts you about it, and the' +
      ' new file replaces the previous one on the site. A copy already ordered today is used as it is.'),
    // Pinned with the button: what the click agrees to must be in view when it is clicked.
    stickyActions(
      h('p', { class: 'consent small muted' },
        'By continuing, you agree to the ', link('/terms.html', 'Terms of Use'), ' and the ', link('/privacy.html', 'Privacy Policy'), '.'),
      actionButton('Agree and continue', { type: 'acceptNotice' }, 'primary block')),
  ];
}

const INCLUDED = [
  'Test results', 'Lab histories', 'Visit summaries', 'Prescriptions', 'Medication purchases', 'Referrals',
  'Approvals', 'Information pages', 'Vaccinations', 'Letters', 'Full medical file', 'Messages with your doctor', 'Your uploads',
  'Hospital stays', 'Allergies and appointments',
];

function accountRow(st: StateReply): HTMLElement {
  const on = st.tab.onMaccabi && st.tab.loggedIn;
  return h('p', { class: 'account' + (on ? ' on' : '') },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    // One flex item, so the gap does not split the sentence; <bdi> for Hebrew names inside it.
    on
      ? h('span', {}, st.tab.name ? 'Logged in as ' : 'Logged in to Maccabi Online', st.tab.name && h('bdi', {}, st.tab.name))
      : h('span', {}, 'Not logged in'));
}

function includedDetails(): HTMLElement {
  return h('details', { class: 'more' },
    h('summary', {}, 'What’s included and what isn’t'),
    h('div', { class: 'more-body' },
      h('ul', { class: 'included' }, ...INCLUDED.map((x) => h('li', {}, x))),
      h('ul', { class: 'limits' },
        h('li', {}, 'Only the logged-in member’s records.'),
        h('li', {}, 'No imaging studies (DICOM).'),
        h('li', {}, 'Visits from the last 12 months, as on the site. The purchase report PDF covers 2 years; the purchase table, everything.'),
        h('li', {}, 'While it works, your Maccabi Online tab moves to the medical-file page and back.'))));
}

function idleView(st: StateReply): Child[] {
  if (!st.tab.onMaccabi || !st.tab.loggedIn) {
    return [
      accountRow(st),
      status('Get started'),
      h('h2', {}, 'Log in to Maccabi Online'),
      h('ol', { class: 'numbered' },
        h('li', {}, st.tab.onMaccabi ? 'Log in to Maccabi Online in this tab.' : 'Open Maccabi Online and log in (or finish logging in).'),
        h('li', {}, 'On that tab, click this extension’s icon again.')),
      !st.tab.onMaccabi && actions(actionButton('Open Maccabi Online', { type: 'openMaccabi' }, 'primary block')),
    ];
  }
  return [
    accountRow(st),
    status('Ready to export'),
    h('h2', {}, 'Your records, one ZIP'),
    h('p', { class: 'lead' }, 'Tests, visits, prescriptions, letters, your full medical file and more. Takes about 5 to 20 minutes.'),
    actions(actionButton('Start export', { type: 'start' }, 'primary block', 'Checking your login…')),
    note('', h('strong', {}, 'Maccabi Healthcare Services will text you.'), ' Each export orders a fresh copy of your full medical file, covering your whole history. It replaces the previous one on the site.'),
    includedDetails(),
  ];
}

function progressView(run: RunState): Child[] {
  const pill = status('');
  const title = h('h2', { class: 'step-title' });
  const detail = h('p', { class: 'detail' });
  const { bar, fill } = progressBar(run.percent, true);
  const stats = h('span', { class: 'stats' });
  const hint = note('');
  const stages = STAGES.map((s) => h('li', {}, s.label));
  const stagesDone = h('span');
  live = { status: pill, title, detail, bar, fill, stats, stages, stagesDone, hint };
  return [
    pill,
    title,
    detail,
    bar,
    ui.confirm === 'cancel'
      ? cancelConfirm()
      : h('div', { class: 'stats-row' }, stats, run.status === 'running' && cancelButton('small')),
    hint,
    // Hidden while Stop is being confirmed, so the question fits without scrolling.
    ui.confirm !== 'cancel' && h('div', { class: 'sections' },
      h('p', { class: 'sections-label' }, h('span', {}, 'Sections'), stagesDone),
      h('ol', { class: 'stages', 'aria-label': 'Export steps' }, ...stages)),
  ];
}

function pausedView(run: RunState, st: StateReply): Child[] {
  const hidden = run.status === 'paused_hidden';
  const stage = STAGES[stageStates(run.next).indexOf('current')]?.label;
  let primary: HTMLElement;
  if (!hidden && st.tab.onMaccabi) primary = actionButton('Resume', { type: 'resume' }, 'primary', 'Reconnecting…');
  else primary = actionButton('Go to the Maccabi Online tab', { type: 'focusTab' }, 'primary');
  return [
    status('Paused · ' + run.percent + '%', 'warn'),
    h('h2', {}, hidden ? 'Waiting for the Maccabi Online tab' : 'Export paused'),
    stage && h('p', { class: 'detail' }, 'Section: ' + stage),
    progressBar(run.percent, false).bar,
    note('warn', run.message || (hidden ? 'Bring the Maccabi Online tab back to the front to continue.' : 'The export is paused.')),
    ui.confirm === 'cancel' ? cancelConfirm() : actions(primary, cancelButton()),
  ];
}

function runView(run: RunState, st: StateReply): Child[] {
  switch (run.status) {
    case 'running':
    case 'saving':
      return progressView(run);
    case 'paused_hidden':
    case 'paused_session':
      return pausedView(run, st);
    case 'done':
      return doneView(run);
    case 'error':
      return errorView(run, st);
  }
}

const LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

const ZIP_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M11 6h1M12 8.5h1M11 11h1M12 13.5h1"/><rect x="10.5" y="16" width="3" height="3" rx=".8"/></svg>';

/** The shipped page on opening the export in an AI assistant (the README's section of the same name). */
const AI_HELP = '/ai-assistant.html';

function doneView(run: RunState): Child[] {
  const shown = run.problems || [];
  const count = Math.max(run.problemCount ?? 0, shown.length);
  const took = run.finishedAt ? 'took ' + formatDuration(Date.parse(run.finishedAt) - Date.parse(run.startedAt)) : '';
  const icon = h('span', { class: 'file-icon', 'aria-hidden': 'true' });
  icon.innerHTML = ZIP_ICON;
  const caution = h('p', { class: 'caution' }, h('span', {}, 'The ZIP contains sensitive health information. Store and share it with care.'));
  caution.insertAdjacentHTML('afterbegin', LOCK_ICON);
  return [
    status('Saved', 'ok'),
    h('h2', {}, 'Your export is ready'),
    h('div', { class: 'file-card' },
      icon,
      h('div', {},
        h('strong', { class: 'filename' }, run.zipName || 'The ZIP'),
        h('div', { class: 'small muted' },
          [countOf(run.fileCount ?? 0, 'file', 'files'), run.zipBytes !== undefined && formatBytes(run.zipBytes), took, 'in your Downloads folder'].filter(Boolean).join(' · ')))),
    count > 0 && h('details', { class: 'problems' },
      h('summary', {}, count + (count === 1 ? ' item' : ' items') + ' could not be exported'),
      h('p', { class: 'small' }, 'Everything else was saved. This list is shown until the next export starts.'),
      h('div', { class: 'problem-list' },
        ...groupProblems(shown).map((g) => h('section', {},
          h('h3', {}, g.label),
          h('ul', {}, ...g.items.map((p) => h('li', {}, p.what, p.where.includes('/') && h('span', { class: 'path' }, p.where))))))),
      count > shown.length && h('p', { class: 'small' }, 'Showing the first ' + shown.length + '.')),
    actions(actionButton('Show in folder', { type: 'showFile' }, 'primary'), actionButton('Done', { type: 'dismiss' })),
    note('', h('strong', {}, 'Next: '), 'unzip it and open the folder in your AI assistant, then ask about your records. ',
      h('a', { href: AI_HELP, target: '_blank' }, 'See how')),
    caution,
  ];
}

function errorView(run: RunState, st: StateReply): Child[] {
  const atSave = run.next === PLAN.indexOf('save');
  let retry: HTMLElement;
  if (atSave) retry = actionButton('Save again', { type: 'retrySave' }, 'primary', 'Saving…');
  else if (st.tab.onMaccabi) retry = actionButton('Try again', { type: 'resume' }, 'primary', 'Reconnecting…');
  else retry = actionButton('Go to the Maccabi Online tab', { type: 'focusTab' }, 'primary');
  return [
    status(atSave ? 'Not saved' : 'Stopped', 'err'),
    h('h2', {}, atSave ? 'The ZIP was not saved' : 'Export stopped'),
    note('err',
      h('div', {}, run.message || 'The export failed.'),
      !atSave && h('div', { class: 'small' }, st.tab.onMaccabi
        ? 'Files collected so far are kept. Try again continues from where it stopped.'
        : 'Files collected so far are kept. To try again, open this popup on the logged-in Maccabi Online tab.')),
    ui.confirm === 'discard'
      ? confirmPanel('Delete the files collected so far? You will need to start a new export.', 'Delete files', { type: 'dismiss' }, 'Deleting…', 'Keep them')
      : actions(retry, button('Discard collected files', () => askConfirm('discard'))),
  ];
}

function stoppingView(): Child[] {
  return [
    status('Stopping'),
    h('h2', { class: 'working' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Stopping the export…'),
    note('', 'The files collected so far are deleted once the current request finishes. This can take a few seconds.'),
  ];
}

// ---- rendering ---------------------------------------------------------
function updateStats(): void {
  const run = last?.run;
  if (live.stats && run) live.stats.textContent = statsText(run, Date.now());
}

/** Applies progress to the current view without rebuilding it. */
function updateLive(run: RunState): void {
  const { title, detail } = stepText(run);
  if (live.status) live.status.textContent = run.status === 'saving' ? 'Saving' : 'Exporting · ' + run.percent + '%';
  if (live.title) {
    live.title.textContent = title;
    live.title.title = title;
  }
  if (live.detail) {
    live.detail.textContent = detail;
    live.detail.title = detail;
  }
  if (live.fill) live.fill.style.width = run.percent + '%';
  if (live.bar) {
    live.bar.setAttribute('aria-valuenow', String(run.percent));
    live.bar.setAttribute('aria-valuetext', run.percent + '%' + (title ? ', ' + title : '') + (detail ? ': ' + detail : ''));
  }
  if (live.stages) {
    const states = stageStates(run.next);
    live.stages.forEach((li, i) => {
      if (li.className === states[i]) return;
      li.className = states[i];
      if (states[i] === 'current') li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    if (live.stagesDone) live.stagesDone.textContent = states.filter((s) => s === 'done').length + ' of ' + states.length + ' done';
  }
  if (live.hint) live.hint.textContent = hintFor(run);
  updateStats();
}

const ANNOUNCEMENTS: Record<string, string> = {
  running: 'Export running',
  saving: 'Saving the ZIP',
  paused_session: 'Export paused',
  paused_hidden: 'Export waiting for the Maccabi Online tab',
  done: 'Export saved',
  error: 'Export failed',
  stopping: 'Stopping the export',
};

/** Tells screen readers about status changes only; the popup's content is read when it opens. */
function announce(): void {
  const status = ui.stopping ? 'stopping' : last?.run?.status ?? 'idle';
  if (status === announced) return;
  const prev = announced;
  announced = status;
  if (prev === null) return;
  announcer.textContent = status === 'idle' ? (prev === 'stopping' ? 'Export cancelled' : '') : ANNOUNCEMENTS[status];
}

function render(): void {
  if (!last) {
    if (!ui.error) return;
    renderedKey = '';
    view.replaceChildren(
      note('err', ui.error),
      actions(button('Try again', () => {
        ui.error = '';
        void refresh();
      }, 'primary')));
    return;
  }
  const run = last.run;
  if (!run || run.id !== stoppingRunId) stoppingRunId = null;
  ui.stopping = stoppingRunId !== null;
  if (ui.confirm === 'cancel' && !(run && ['running', 'paused_hidden', 'paused_session'].includes(run.status))) ui.confirm = null;
  if (ui.confirm === 'discard' && run?.status !== 'error') ui.confirm = null;
  announce();

  const key = viewKey(last, ui);
  if (key === renderedKey) {
    if (run) updateLive(run);
    return;
  }
  renderedKey = key;
  const hadFocus = view.contains(document.activeElement);
  live = {};
  const parts = ui.stopping ? stoppingView() : run ? runView(run, last) : last.noticeAccepted ? idleView(last) : noticeView();
  if (ui.error) parts.push(note('err', ui.error));
  view.replaceChildren(...(parts.filter(Boolean) as Node[]));
  if (run) updateLive(run);
  // Keep keyboard users in the popup: the element they were on was just replaced.
  if (hadFocus) {
    const target = view.querySelector<HTMLElement>('[data-autofocus]') ?? view.querySelector<HTMLElement>('button.primary') ?? view.querySelector<HTMLElement>('button');
    target?.focus();
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !last || !changes.run) return;
  const next = (changes.run.newValue as RunState | undefined) ?? null;
  const wasRun = !!last.run;
  last = { ...last, run: next };
  // Back to idle: the tab state may have changed meanwhile.
  if (wasRun && !next) void refresh();
  else render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.confirm && !ui.busy) {
    e.preventDefault();
    ui.confirm = null;
    render();
  }
});

setInterval(updateStats, 15_000);

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  await refresh();
})();
