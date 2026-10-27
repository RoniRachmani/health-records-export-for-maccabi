import { SITE_ASK, SITE_OPEN, type Request, type RunState, type StateReply } from '../shared/state';
import {
  announcement, bandSpan, countText, doneSummary, groupProblems, hintText, keptConfirm, nextAction, problemCount, problemText, progressTexts, STAGES,
  stageFileCounts, stageStates, statsText, stepText, viewKey, waitingForFile, type Announced, type Confirm, type UiFlags,
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
let announced: Announced | null = null;

/** Nodes that progress updates write to in place. */
let live: {
  status?: HTMLElement;
  bar?: HTMLElement;
  fill?: HTMLElement;
  band?: HTMLElement;
  activity?: HTMLElement;
  count?: HTMLElement;
  stats?: HTMLElement;
  stages?: HTMLElement[];
  hint?: HTMLElement;
  reminder?: HTMLElement;
  ask?: HTMLElement;
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
    ui.error = 'Couldn’t reach the extension. Close this popup and open it again. (' + errText(e) + ')';
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

/**
 * The small status pill above a view's heading; kind colours it. Only where it says what the heading doesn't (how far a
 * run is, that the notice comes first): a pill that repeats its heading says the state twice.
 */
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

/**
 * Asks first, since cancelling deletes what was collected. The destructive answer starts with what it does
 * ("Delete and stop"), not with "Cancel", which in a question reads as "never mind".
 */
function cancelButton(cls = ''): HTMLElement {
  return button('Cancel export', () => askConfirm('cancel'), cls);
}

function cancelConfirm(): HTMLElement {
  return confirmPanel('Cancel the export and delete the files collected so far?', 'Delete and stop', { type: 'cancel' }, 'Stopping…', 'Keep exporting');
}

/** With a band, the bar also marks the rest of the current section, behind the fill: the fill eats it as the count rises. */
function progressBar(percent: number, active: boolean, withBand = false): { bar: HTMLElement; fill: HTMLElement; band?: HTMLElement } {
  const fill = h('div', { class: 'fill' });
  fill.style.width = percent + '%';
  const band = withBand ? h('div', { class: 'band' }) : undefined;
  const bar = h('div', {
    class: 'bar' + (active ? ' active' : ''), role: 'progressbar', 'aria-label': 'Export progress',
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent),
  }, band, fill);
  return { bar, fill, band };
}

/** A speech bubble, for the reminder while the medical file is prepared. */
const ASK_ICON = '<svg class="ask-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3h11v7.6H8l-3.2 2.6v-2.6H2.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
/** A box with an arrow leaving it: the button opens a page outside the popup. */
const OPENS_ICON = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M5 2.5H3a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V7M7 2.5h2.5V5M9.5 2.5 5.75 6.25" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TAB_ICON = '<svg class="tab-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.5" y="2.5" width="13" height="11" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 6h13" stroke="currentColor" stroke-width="1.4"/><circle cx="4" cy="4.3" r=".7" fill="currentColor"/><circle cx="6" cy="4.3" r=".7" fill="currentColor"/></svg>';

// ---- views -------------------------------------------------------------
/**
 * Shown once, before anything is read from the tab. The links open the pages shipped in the extension. It fits the
 * popup: what happens comes first, led by the medical-file order, then the one consequence that can't be undone, in
 * amber, then the cautions, and nothing is below the fold when Agree is clicked. Amber is kept for that one line: it
 * means a warning everywhere else. That the tab moves between pages is under "What’s included" on the next view.
 */
function noticeView(): Child[] {
  const link = (href: string, text: string) => h('a', { href, target: '_blank' }, text);
  return [
    status('Before you start'),
    h('h2', {}, 'How the export works'),
    // What it does. The others are one line each: a second would take the view past the popup's 600px.
    h('ul', { class: 'points' },
      h('li', {}, h('strong', {}, 'Each export orders a fresh copy of your full medical file'),
        ', for your whole history: a wider range than the site’s own form offers. Maccabi texts you about it.' +
        ' A copy already ordered today is reused.'),
      h('li', {}, 'Everything stays on this computer, in one ZIP.'),
      h('li', {}, 'It keeps you logged in to Maccabi while it runs.')),
    note('warn', h('strong', {}, 'The new copy replaces the medical file now on the site.')),
    // What is asked of the member.
    h('ul', { class: 'points' },
      h('li', {}, 'The ZIP holds sensitive health information.'),
      h('li', {}, 'Use it only for records you may legally access.')),
    // Pinned with the button, in case a larger font takes the text past the popup's height: what the click
    // agrees to must be in view when it is clicked.
    stickyActions(
      h('p', { class: 'consent small muted' },
        'By continuing, you agree to the ', link('/terms.html', 'Terms of Use'), ' and the ', link('/privacy.html', 'Privacy Policy'), '.'),
      actionButton('Agree and continue', { type: 'acceptNotice' }, 'primary block')),
  ];
}

const INCLUDED = [
  'Test results', 'Lab histories', 'Visit summaries', 'Prescriptions', 'Medication purchases', 'Referrals',
  'Approvals', 'Information pages', 'Vaccinations', 'Letters', 'Full medical file', 'Messages with your doctor', 'Your uploads',
  'Hospital stays', 'Allergies', 'Upcoming appointments', 'Your requests to Maccabi',
];

function accountRow(st: StateReply): HTMLElement {
  const on = st.tab.onMaccabi && st.tab.loggedIn;
  return h('p', { class: 'account' + (on ? ' on' : '') },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    // One flex item, so the gap does not split the sentence; <bdi> for Hebrew names inside it.
    on
      ? h('span', {}, st.tab.name ? 'Logged in as ' : 'Logged in to Maccabi Online', st.tab.name && h('bdi', {}, st.tab.name))
      : h('span', {}, 'Not logged in to Maccabi Online'));
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
        h('li', {}, 'While it works, your Maccabi Online tab moves to the medical-file page and back, and your session is kept from timing out.'))));
}

function idleView(st: StateReply): Child[] {
  if (!st.tab.onMaccabi || !st.tab.loggedIn) {
    return [
      accountRow(st),
      status('Get started'),
      h('h2', {}, 'Log in to Maccabi Online'),
      h('ol', { class: 'numbered' },
        h('li', {}, st.tab.onMaccabi ? 'Log in to Maccabi Online in this tab.' : 'Open Maccabi Online and log in (or finish logging in).'),
        // Chrome keeps a new extension's icon under the puzzle piece until it is pinned.
        h('li', {}, 'On that tab, click this extension’s icon again. Not in the toolbar? It’s under the puzzle-piece button.')),
      !st.tab.onMaccabi && actions(actionButton('Open Maccabi Online', { type: 'openMaccabi' }, 'primary block')),
    ];
  }
  // The account line's green dot says it is ready: no pill between it and the heading.
  return [
    accountRow(st),
    h('h2', {}, 'Your records, one ZIP'),
    h('p', { class: 'lead' }, 'Tests, visits, prescriptions, letters, your full medical file and more. Usually a few minutes; up to 20 if the medical file is slow to arrive.'),
    actions(actionButton('Start export', { type: 'start' }, 'primary block', 'Checking your login…')),
    // What the click does, as the button's caption, so it is read with it. The notice said it in full before the
    // first export; this is the reminder.
    h('p', { class: 'caption' }, 'Orders a fresh copy of your medical file. Maccabi will text you.'),
    includedDetails(),
  ];
}

/**
 * Each fact once: the panel holds everything that moves (how far, what the current section is doing, its count, the
 * totals) and, as its last line, the one thing to do meanwhile; the list names every section, and a finished one shows
 * the files it collected, in a column headed once. Cancel is a quiet button at the end: it is nobody's next step, and it
 * asks first.
 */
function progressView(run: RunState): Child[] {
  const pill = status('');
  const { bar, fill, band } = progressBar(run.percent, true, true);
  const activity = h('span', { class: 'what' });
  const count = h('span', { class: 'count' });
  const stats = h('p', { class: 'stats' });
  const hint = h('span');
  const ask = h('span');
  const stages = STAGES.map((s) => h('li', {}, h('span', { class: 'name' }, s.label), h('span', { class: 'count' })));
  const reminder = h('p', { class: 'reminder' }, h('span', {}, hint, ask));
  reminder.insertAdjacentHTML('afterbegin', TAB_ICON + ASK_ICON);
  live = { status: pill, bar, fill, band, activity, count, stats, stages, hint, reminder, ask };
  return [
    h('h2', { class: 'visually-hidden' }, 'Export in progress'),
    h('div', { class: 'panel' },
      pill,
      h('p', { class: 'activity' }, activity, count),
      bar,
      stats,
      reminder),
    // The list is hidden while Cancel is being confirmed, so the question fits without scrolling.
    ui.confirm === 'cancel' && cancelConfirm(),
    // The column's head, said once over the counts; screen readers hear "files" with each count instead.
    ui.confirm !== 'cancel' && h('p', { class: 'files-head', 'aria-hidden': 'true' }, 'Files'),
    ui.confirm !== 'cancel' && h('ol', { class: 'stages', 'aria-label': 'Sections' }, ...stages),
    run.status === 'running' && ui.confirm !== 'cancel' && h('p', { class: 'dismiss' }, cancelButton('quiet')),
  ];
}

/**
 * The way back is the one full-width button; Cancel is the quiet one Running has, since it deletes what was collected
 * and still asks first. How far the run got is said once, beside the section it stopped in.
 */
function pausedView(run: RunState, st: StateReply): Child[] {
  const hidden = run.status === 'paused_hidden';
  const stage = STAGES[stageStates(run).indexOf('current')]?.label;
  const next = nextAction(run, st.tab.onMaccabi);
  const primary = actionButton(next.label, next.req, 'primary block', next.busyLabel);
  const done = run.percent + '% done';
  return [
    h('h2', {}, hidden ? 'Waiting for the Maccabi Online tab' : 'Export paused'),
    h('p', { class: 'detail' }, stage ? 'Section: ' + stage + ' · ' + done : done),
    progressBar(run.percent, false).bar,
    note('warn', run.message || (hidden ? 'Bring the Maccabi Online tab back to the front to continue.' : 'The export is paused.')),
    ...(ui.confirm === 'cancel' ? [cancelConfirm()] : [actions(primary), h('p', { class: 'dismiss' }, cancelButton('quiet'))]),
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

/** The footer's Report a problem, for the error view. */
const REPORT = 'https://github.com/RoniRachmani/health-records-export-for-maccabi/issues/new/choose';

/**
 * The website's nine questions while the export runs, in a window of its own: a tab beside Maccabi Online's would put
 * that one in the background, and the run waits for it to come back to the front.
 */
function askLink(): HTMLElement {
  const a = h('a', { href: SITE_ASK, target: '_blank', title: 'Opens in a new window' }, 'what to ask your AI assistant');
  a.addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.windows.create({ url: SITE_ASK, width: 1100, height: 860, focused: true });
  });
  return a;
}

function doneView(run: RunState): Child[] {
  const shown = run.problems || [];
  const count = problemCount(run);
  const icon = h('span', { class: 'file-icon', 'aria-hidden': 'true' });
  icon.innerHTML = ZIP_ICON;
  const caution = h('p', { class: 'caution' }, h('span', {}, 'The ZIP contains sensitive health information. Store and share it with care.'));
  caution.insertAdjacentHTML('afterbegin', LOCK_ICON);
  // Not one of the pair: it clears this summary and goes back to the start, which is nobody's next step. It says on its
  // face that the ZIP is not touched.
  const clear = h('p', { class: 'dismiss' }, actionButton('Clear this summary (the ZIP stays)', { type: 'dismiss' }, 'quiet'));
  // It opens a page on the website, not an AI: the mark after its name says it leaves the popup, and a screen reader
  // hears where to. Its name is the notification's too, so the mark is said, not the name lengthened.
  const ai = button('Open it in an AI', () => void window.open(SITE_OPEN, '_blank'), 'opens');
  ai.insertAdjacentHTML('beforeend', OPENS_ICON);
  ai.append(h('span', { class: 'visually-hidden' }, ' (opens in a new tab)'));
  return [
    h('h2', {}, 'Your export is ready'),
    h('div', { class: 'file-card' },
      icon,
      h('div', {},
        h('strong', { class: 'filename' }, run.zipName || 'The ZIP'),
        h('div', { class: 'small muted' }, doneSummary(run)))),
    count > 0 && h('details', { class: 'problems' },
      h('summary', {}, count + (count === 1 ? ' item' : ' items') + ' could not be exported'),
      h('p', { class: 'small' }, 'Everything else was saved. A new export tries these again; this list is shown until it starts.'),
      h('div', { class: 'problem-list' },
        ...groupProblems(shown).map((g) => h('section', {},
          h('h3', {}, g.label),
          h('ul', {}, ...g.items.map((p) => h('li', {}, problemText(p.what), p.where.includes('/') && h('span', { class: 'path' }, p.where))))))),
      count > shown.length && h('p', { class: 'small' }, 'Showing the first ' + shown.length + '.')),
    // The two next steps, as the pair: finding the file, then asking an AI about it, which is what the ZIP is for.
    actions(actionButton('Show in folder', { type: 'showFile' }, 'primary'), ai),
    clear,
    caution,
  ];
}

/**
 * The card reads in order: what happened, that nothing collected is lost, then what a report needs. Trying again is the
 * one full-width button; deleting is quiet, and asks first.
 */
function errorView(run: RunState, st: StateReply): Child[] {
  const next = nextAction(run, st.tab.onMaccabi);
  const atSave = next.req.type === 'retrySave';
  const retry = actionButton(next.label, next.req, 'primary block', next.busyLabel);
  // What went wrong in the code's own words: no use to the member, and what a report needs.
  const detail = run.errorDetail ? h('span', {}, run.errorDetail) : null;
  const report = h('a', { href: REPORT, target: '_blank', rel: 'noreferrer' }, 'Report the problem');
  return [
    h('h2', {}, atSave ? 'The ZIP was not saved' : 'Export stopped'),
    note('err',
      h('div', {}, run.message || 'The export stopped unexpectedly.'),
      !atSave && h('div', { class: 'small' }, st.tab.onMaccabi
        ? 'Files collected so far are kept. Try again continues from where it stopped.'
        : 'Files collected so far are kept. To try again, click the extension’s icon on the logged-in Maccabi Online tab.'),
      // The next step when trying again does not help, so it is here and not only in the footer, with the detail it needs.
      !atSave
        ? h('div', { class: 'small err-detail' }, 'Still stopping here? ', report, ...(detail ? [' with this detail: ', detail] : ['.']))
        : detail && h('div', { class: 'small err-detail' }, 'Details, for a report: ', detail)),
    ...(ui.confirm === 'discard'
      ? [confirmPanel('Delete the files collected so far? You will need to start a new export.', 'Delete files', { type: 'dismiss' }, 'Deleting…', 'Keep them')]
      : [actions(retry), h('p', { class: 'dismiss' }, button('Delete collected files', () => askConfirm('discard'), 'quiet'))]),
  ];
}

function stoppingView(): Child[] {
  return [
    h('h2', { class: 'working' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Stopping the export…'),
    note('', 'The files collected so far are deleted once the current request finishes. This can take a few seconds.'),
  ];
}

// ---- rendering ---------------------------------------------------------
function updateStats(): void {
  const run = last?.run;
  if (run) setText(live.stats, statsText(run, Date.now()));
}

function setText(el: HTMLElement | undefined, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

/** Applies progress to the current view without rebuilding it. */
function updateLive(run: RunState): void {
  const { detail } = stepText(run);
  const count = countText(run);
  const texts = progressTexts(run);
  setText(live.status, texts.pill);
  if (live.activity && live.activity.textContent !== detail) {
    live.activity.textContent = detail;
    live.activity.title = detail;
  }
  setText(live.count, count);
  if (live.fill) live.fill.style.width = run.percent + '%';
  if (live.band) {
    const band = bandSpan(run);
    live.band.style.left = band.left + '%';
    live.band.style.width = band.width + '%';
  }
  if (live.bar) {
    live.bar.setAttribute('aria-valuenow', String(run.percent));
    live.bar.setAttribute('aria-valuetext', texts.valueText);
  }
  if (live.stages) {
    const states = stageStates(run);
    const files = stageFileCounts(run);
    live.stages.forEach((li, i) => {
      // A finished line's files: a bare number under the column's head, heard as files.
      const n = states[i] === 'done' ? files[i] : undefined;
      const count = li.querySelector('.count') as HTMLElement;
      if (count.dataset.n !== String(n ?? '')) {
        count.dataset.n = String(n ?? '');
        count.replaceChildren(...(n ? [n.toLocaleString('en-US'), h('span', { class: 'visually-hidden' }, n === 1 ? ' file' : ' files')] : []));
      }
      if (li.className === states[i]) return;
      li.className = states[i];
      if (states[i] === 'current') li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }
  setText(live.hint, hintText(run));
  // The wait for the medical file is the one stretch with nothing to watch: the reminder offers what to ask meanwhile.
  const waiting = waitingForFile(run);
  if (live.reminder && live.ask && live.reminder.classList.contains('waiting') !== waiting) {
    live.reminder.classList.toggle('waiting', waiting);
    live.ask.replaceChildren(...(waiting ? [' ', askLink()] : []));
  }
  updateStats();
}

/** Tells screen readers about status changes only; the popup's content is read when it opens. */
function announce(): void {
  const status: Announced = ui.stopping ? 'stopping' : last?.run?.status ?? 'idle';
  const text = announcement(announced, status);
  announced = status;
  if (text !== null) announcer.textContent = text;
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
  ui.confirm = keptConfirm(ui.confirm, run);
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
