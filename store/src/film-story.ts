/* Before Thursday, a draft film beside the promo: one continuous desktop story about getting ready for a new
   doctor, drawn a frame at a time like video.ts (scripts/store-video.mjs --before-thursday asks for frame n and
   photographs it). The popup in it is the real one, driven through a run by demo-run.ts. Every record and assistant
   answer is synthetic. */
import { PRODUCT_NAME } from '../../src/extension/shared/name';
import { type RunState } from '../../src/extension/shared/state';
import { doneRun, FILES, runAt as demoRunAt } from './demo-run';
import { clamp01, lerp } from './motion';
import { DOC, FOLDER, MARK } from './parts';

const FPS = 60;
const END = 56;

const narration = [
  { at: 0.55, text: 'A new doctor. On Thursday. Where do you even begin?' },
  { at: 6.1, text: 'Years of records. And one appointment to prepare for.' },
  { at: 11.4, text: 'Log in to Maccabi Online, and start your export.' },
  { at: 17.2, text: 'Your medical file, results, and documents. Together, on your computer.' },
  { at: 23, text: 'Open the folder in an assistant you choose. Then ask about Thursday.' },
  { at: 29.2, text: 'A follow-up worth checking. An approval about to expire. A note from years ago.' },
  { at: 37.4, text: 'Each question names its source, so you can check it.' },
  { at: 43, text: 'Now you have a starting point. You and your doctor decide what comes next.' },
  { at: 49.3, text: PRODUCT_NAME + '. Free, on the Chrome Web Store.' },
];

const sounds = [
  { at: 6.3, kind: 'suck', dur: 0.5 },
  { at: 10, kind: 'whoosh', dur: 0.6 },
  { at: 13.2, kind: 'click' },
  { at: 19.2, kind: 'chime' },
  { at: 21.5, kind: 'pop' },
  { at: 25.5, kind: 'click' },
  { at: 30.9, kind: 'tick' },
  { at: 34.1, kind: 'tick' },
  { at: 37.9, kind: 'tick' },
  { at: 42, kind: 'click' },
  { at: 49.5, kind: 'shimmer' },
];

/** When each part of the film starts, for the soundtrack's music (scripts/before-thursday-audio.mjs). */
const scenes = { answer: 0, cards: 6, browser: 11, runFrom: 13.2, open: 21, uses: 27, ask: 37.9, privacy: 41, close: 49, end: END };

// ---- the stage ----------------------------------------------------------
const mark = `<svg viewBox="0 0 24 24">${MARK}</svg>`;

/** The records gathered in the opening: title, year, and where each lands (x, y, tilt). */
const records = [
  ['Medical file', '1988', 620, 170, -13],
  ['Visit notes', '2011', 1020, 170, 9],
  ['Test results', '2016', 1380, 390, -7],
  ['Prescriptions', '2023', 730, 650, 6],
  ['Approval', '2026', 1190, 690, -4],
];

/** The brief's questions: question, source, and the second it appears. */
const questions = [
  ['Do I still need that blood sugar re-test?', 'visit-summaries/ · 2 Mar 2026<br>test-results/list.json', 30.9],
  ['Can I use this physiotherapy approval before it expires?', 'approvals/ · Valid until 15 Nov 2026', 34.1],
  ['Please check the old penicillin rash note.', 'medical-file.pdf · Page 14 · March 2011', 37.9],
] as const;

/** What the assistant shows for each question: label, quote, note and source. */
const extracts = [
  ['VISIT NOTE · 2 MAR 2026', '“Re-test in April.”', 'No later result found <span class="highlight">in this export</span>.', 'visit-summaries/ + test-results/list.json'],
  ['PHYSIOTHERAPY APPROVAL', 'Valid until <span class="highlight">15 Nov 2026</span>', 'A date to discuss before the approval expires.', 'approvals/'],
  ['MEDICAL FILE · PAGE 14', 'March 2011: <span class="highlight">rash after penicillin</span>', 'An old recorded reaction to check with your doctor.', 'medical-file.pdf · p. 14'],
];

const files = ['README.md', 'medical-file.pdf', 'test-results/', 'visit-summaries/', 'approvals/', 'medications-and-prescriptions/'];

const CALENDAR =
  '<div class="actor calendar"><div class="calendar-top"><span>YOUR NEXT APPOINTMENT</span><span>◷</span></div>' +
  '<div class="calendar-main"><div class="weekday">Thursday</div><div class="appointment"><span class="time">09:00</span>New doctor</div>' +
  '<div class="calendar-status">Bring your medical history</div></div></div>';

const NOTE = '<div class="actor note"><small>BEFORE THE APPOINTMENT</small><div class="note-question"></div></div>';

const RECORDS = records
  .map(
    ([title, year, x, y, angle], i) =>
      `<div class="actor record" data-x="${x}" data-y="${y}" data-angle="${angle}" data-i="${i}">` +
      `<div class="record-type">HEALTH RECORD ${DOC}</div><h3>${title}</h3>` +
      `<div class="lines"><i></i><i></i><i></i></div><span class="record-year">${year}</span></div>`,
  )
  .join('');

const BROWSER =
  '<div class="actor browser"><div class="window-tabs"><i></i><i></i><i></i><span class="window-tab">Health portal</span></div>' +
  `<div class="toolbar"><span>‹</span><span>›</span><span>↻</span><span class="address">health-portal.example</span><span class="pin">${mark}</span></div>` +
  '<div class="site-bar">Your health portal</div>' +
  '<div class="site-nav"><div>Overview</div><div class="active">My medical records</div><div>Appointments</div></div>' +
  '<div class="site-page"><h3>Your medical records</h3>' +
  '<div class="site-row"><strong>Test results</strong><small>Results and history</small></div>' +
  '<div class="site-row"><strong>Visit summaries</strong><small>Documents and follow-ups</small></div>' +
  '<div class="site-row"><strong>Medical file</strong><small>Your full history</small></div></div>' +
  '<iframe title="Actual extension popup, synthetic account" src="/src/extension/popup/popup.html?state=ready"></iframe>' +
  '<div class="browser-note"><b>Actual extension UI</b> · Demo sped up · Keep the portal open and in front<br>' +
  'Orders your medical file; you will get a text. Usually a few minutes, up to 20.</div></div>';

const ZIP_CARD =
  `<div class="actor zip"><div class="zip-art">${DOC}</div><div class="zip-label">maccabi-export.zip</div>` +
  `<small class="zip-meta">${FILES} files · Saved on your computer</small></div>`;

const ASSISTANT =
  '<div class="actor assistant"><div class="assistant-bar"><span>Your chosen assistant</span><small>Illustrative assistant · After export</small></div>' +
  `<div class="folder-pill">${FOLDER}maccabi-export</div>` +
  `<div class="file-list">${files.map((name, i) => `<div class="file-row ${i === 0 ? 'readme' : ''}">${i < 2 ? DOC : FOLDER}${name}</div>`).join('')}</div>` +
  '<div class="prompt"></div><div class="reading">Reading your selected files…</div>' +
  '<div class="extract"><small></small><h3></h3><p></p><div class="source-path"></div></div><div class="save-brief">Save brief ↓</div></div>';

const PERMISSION =
  '<div class="permission"><h3>Open this folder in your assistant?</h3>' +
  '<p>You choose what to share.<br>Check the service’s data settings first.</p>' +
  '<div class="permission-actions"><span>Cancel</span><span class="primary">Open folder</span></div></div>';

const THREAD = '<svg class="thread"><path d="M990 660 C1060 660 1050 480 1120 480"/></svg>';

const BRIEF =
  `<div class="actor brief"><div class="brief-file">${DOC}For Thursday.pdf</div><div class="brief-stamp">Saved locally ✓</div>` +
  '<h2>For Thursday</h2><p class="brief-sub">Questions for my new doctor</p>' +
  questions
    .map(
      ([text, source], i) =>
        `<div class="brief-row"><div class="brief-question"><b>${i + 1}</b><span>${text}</span></div><div class="brief-source">${source}</div></div>`,
    )
    .join('') +
  '<div class="brief-footer"><span>Check each source with your doctor</span><span>1 / 1</span></div></div>';

const END_COPY =
  '<div class="actor end-copy"><h1>Walk in with<br><em>better questions.</em></h1>' +
  `<div class="end-product">${mark}${PRODUCT_NAME}</div>` +
  '<div class="cta">Free on the Chrome Web Store ↗</div><div class="url">maccabi.ronirachmani.com</div></div>';

const POINTER =
  '<svg class="cursor" viewBox="0 0 34 44"><path d="M3 2v33l9-9 7 15 7-3-7-14h13z" fill="#083f92" stroke="white" stroke-width="2"/></svg>' +
  '<div class="click-ring"></div>';

const AROUND =
  '</div><div id="caption"></div><div id="disclaimer"><span>Synthetic records · Illustrative assistant output</span>' +
  '<span>Independent, unofficial extension · Not affiliated with Maccabi</span></div>';

const stage = document.createElement('main');
stage.id = 'stage';
stage.innerHTML = ['<div id="world">', CALENDAR, NOTE, RECORDS, BROWSER, ZIP_CARD, ASSISTANT, PERMISSION, THREAD, BRIEF, END_COPY, POINTER, AROUND].join('\n');
document.body.append(stage);

const q = <T extends Element = HTMLElement>(s: string): T => stage.querySelector<T>(s)!;
const all = (s: string): HTMLElement[] => Array.from(stage.querySelectorAll<HTMLElement>(s));

/** How far t is from a to b, smoothed at both ends. */
function ease(t: number, a: number, b: number): number {
  const u = clamp01((t - a) / (b - a));
  return u * u * (3 - 2 * u);
}

function actor(s: string, opacity: number, x = 0, y = 0, scale = 1, rotate = 0): void {
  const el = q(s);
  el.style.opacity = String(clamp01(opacity));
  el.style.transform = `translate(${x}px,${y}px) scale(${scale}) rotate(${rotate}deg)`;
}

function typed(s: string, text: string, u: number): void {
  q(s).textContent = text.slice(0, Math.floor(text.length * clamp01(u)));
}

// ---- the run, in the real popup -------------------------------------------
const frame = q<HTMLIFrameElement>('iframe');

/** The export runs from RUN_FROM for RUN_FOR seconds of film, and says it took 9 minutes. */
const RUN_FROM = 13.2;
const RUN_FOR = 6;
const BASE_TIME = Date.parse('2026-09-17T09:00:00Z');
const STARTED = new Date(BASE_TIME).toISOString();
const FINISHED = new Date(BASE_TIME + 540000).toISOString();

/** Where Start is on screen, measured once the popup has drawn. */
let clickTarget = { x: 1599, y: 457 };

function runAt(t: number): RunState | null {
  if (t < RUN_FROM) return null;
  const u = clamp01((t - RUN_FROM) / RUN_FOR);
  return u === 1 ? doneRun(STARTED, FINISHED, false) : demoRunAt(u, STARTED, false);
}

function sizePopup(): void {
  frame.style.width = frame.contentDocument!.body.offsetWidth + 'px';
  frame.style.height = Math.min(600, Math.ceil(frame.contentDocument!.body.getBoundingClientRect().height)) + 'px';
}

/** Puts the popup at second t: its run, its clock, and its own animations on the film's clock. */
function drawPopup(t: number): void {
  const win = frame.contentWindow as unknown as { Date: DateConstructor; demoRun: (r: RunState | null) => void };
  win.Date.now = () => BASE_TIME + Math.round(clamp01((t - RUN_FROM) / RUN_FOR) * 540000);
  if (t !== 0 && (t < 9 || t >= 23.5)) return;
  win.demoRun(runAt(t));
  sizePopup();
  for (const a of frame.contentDocument!.getAnimations()) {
    if ('transitionProperty' in a) a.finish();
    else {
      a.pause();
      a.currentTime = t * 1000;
    }
  }
}

// ---- a frame ------------------------------------------------------------
function draw(t: number): void {
  const pull = ease(t, 5.8, 9.5);
  const end = ease(t, 48.5, 52);
  const resolve = ease(t, 42, 46.8);
  q('#world').style.transform = `translate(${lerp(-170, 0, pull)}px,${lerp(-80, 0, pull)}px) scale(${lerp(1.2, 1, pull)})`;

  // The appointment, and the records gathered for it.
  actor('.calendar', 1, lerp(0, -630, pull), lerp(0, -45, pull), lerp(1, 0.58, pull));
  actor('.note', 1, lerp(0, -690, pull), lerp(0, -120, pull) + 350 * end, lerp(1, 0.65, pull), -3);
  typed('.note-question', t < 43 ? 'Where do I begin?' : 'Ready for Thursday.', t < 43 ? ease(t, 1.5, 3.7) : ease(t, 43, 44.5));
  q('.calendar-status').textContent = t < 43 ? 'Bring your medical history' : 'Appointment brief ready ✓';
  all('.record').forEach((el, i) => {
    const u = ease(t, 6.2 + i * 0.28, 7.2 + i * 0.28);
    const out = ease(t, 9.3, 11);
    el.style.left = el.dataset.x + 'px';
    el.style.top = el.dataset.y + 'px';
    el.style.opacity = String(u * (1 - out));
    el.style.transform = `translateY(${(1 - u) * 110}px) rotate(${el.dataset.angle}deg) scale(${0.8 + 0.2 * u})`;
  });

  // The portal and the export.
  const browserIn = ease(t, 9, 11);
  const browserOut = ease(t, 21, 23.5);
  actor('.browser', browserIn * (1 - browserOut), lerp(650, 0, browserIn) - browserOut * 100, 0, 1 - 0.1 * browserOut);
  drawPopup(t);
  const zipIn = ease(t, 20.9, 21.8);
  const zipMove = ease(t, 21.2, 23.3);
  const zipOut = ease(t, 24, 25.2);
  actor('.zip', zipIn * (1 - zipOut), lerp(0, -710, zipMove), lerp(0, 50, zipMove), lerp(0.6, 1, zipMove), lerp(8, -3, zipMove));

  // The assistant, asked about Thursday.
  const ai = ease(t, 23.5, 25.3);
  const ao = ease(t, 42.5, 47);
  actor('.assistant', ai * (1 - ao), 0, lerp(70, 0, ai), 1 - 0.06 * ao);
  actor('.permission', ease(t, 24, 24.5) * (1 - ease(t, 25.5, 26)), 0, (1 - ease(t, 24, 24.5)) * 30);
  actor('.file-list', 1 - ease(t, 26.4, 27.2));
  actor('.prompt', ease(t, 26.6, 27.1));
  typed('.prompt', 'Help me prepare for Thursday. What should I ask?', ease(t, 26.7, 28.5));
  actor('.reading', ease(t, 28.5, 29));
  q('.reading').textContent = t < 39 ? 'Reading across your selected files…' : 'Three questions, with sources.';

  // Each question's source, and the brief it goes into.
  const idx = t < 33.4 ? 0 : t < 37 ? 1 : 2;
  const starts = [29.7, 33.4, 37];
  const extract = q('.extract');
  extract.querySelector('small')!.textContent = extracts[idx][0];
  extract.querySelector('h3')!.innerHTML = extracts[idx][1];
  extract.querySelector('p')!.innerHTML = extracts[idx][2];
  extract.querySelector('.source-path')!.textContent = extracts[idx][3];
  actor('.extract', ease(t, 29.7, 30.2), 0, (1 - ease(t, starts[idx], starts[idx] + 0.4)) * 15);
  const briefIn = ease(t, 29, 29.7);
  actor(
    '.brief',
    briefIn,
    lerp(0, -460, resolve) + lerp(0, -510, end),
    lerp(0, -55, resolve) + lerp(0, 120, end),
    lerp(1, 0.95, resolve) * lerp(1, 0.67, end),
    lerp(0, -2, end),
  );
  all('.brief-row').forEach((el, i) => {
    const u = ease(t, questions[i][2], questions[i][2] + 0.6);
    el.style.opacity = String(u);
    el.style.transform = `translateY(${(1 - u) * 12}px)`;
  });
  actor('.brief-stamp', ease(t, 42, 42.4));
  actor('.save-brief', ease(t, 39, 39.6));
  const path = q<SVGPathElement>('.thread path');
  const thread = ease(t, starts[idx] + 0.3, starts[idx] + 1);
  const threadOut = ease(t, starts[idx] + 2, starts[idx] + 2.7);
  path.setAttribute('d', `M990 660 C1060 660 1050 ${480 + idx * 130} 1120 ${480 + idx * 130}`);
  path.style.strokeDasharray = '550';
  path.style.strokeDashoffset = String(550 * (1 - thread));
  q<SVGElement>('.thread').style.opacity = String(thread * (1 - threadOut) * (1 - ao));

  // The end, and the caption under it all.
  actor('.end-copy', end, 0, (1 - end) * 35);
  q('#caption').textContent =
    t >= 26 && t < 42
      ? 'Example workflow in an assistant that supports local files'
      : t >= 42 && t < 49
        ? 'Your starting point. You and your doctor decide what comes next.'
        : '';

  drawPointer(t);
}

/** The pointer's three clicks: Start, Open folder, Save brief. */
function drawPointer(t: number): void {
  const cursor = q('.cursor');
  const ring = q('.click-ring');
  let pos = { x: 0, y: 0 };
  let alpha = 0;
  let click = 0;
  if (t >= 11.5 && t < 14) {
    const u = ease(t, 11.5, 13.2);
    pos = { x: lerp(1400, clickTarget.x, u), y: lerp(740, clickTarget.y, u) };
    alpha = ease(t, 11.5, 11.8) * (1 - ease(t, 13.5, 14));
    click = 13.2;
  } else if (t >= 24.5 && t < 26.2) {
    const u = ease(t, 24.5, 25.5);
    pos = { x: lerp(1300, 1180, u), y: lerp(700, 580, u) };
    alpha = ease(t, 24.5, 24.8) * (1 - ease(t, 25.8, 26.2));
    click = 25.5;
  } else if (t >= 40.5 && t < 42.5) {
    const u = ease(t, 40.5, 42);
    pos = { x: lerp(750, 540, u), y: lerp(780, 898, u) };
    alpha = ease(t, 40.5, 40.8) * (1 - ease(t, 42, 42.5));
    click = 42;
  }
  cursor.style.opacity = String(alpha);
  cursor.style.transform = `translate(${pos.x}px,${pos.y}px)`;
  ring.style.left = pos.x - 20 + 'px';
  ring.style.top = pos.y - 20 + 'px';
  ring.style.opacity = String(click && t >= click ? 1 - ease(t, click, click + 0.4) : 0);
  ring.style.transform = `scale(${0.4 + ease(t, click, click + 0.4)})`;
}

// ---- start --------------------------------------------------------------
async function main(): Promise<void> {
  await document.fonts.load('500 83px Roboto');
  await document.fonts.ready;
  for (let i = 0; i < 200; i++) {
    const win = frame.contentWindow as unknown as { demoRun?: unknown } | null;
    if (win?.demoRun && frame.contentDocument?.querySelector('#view > :not(.loading)')) break;
    if (i === 199) throw Error('Popup not ready');
    await new Promise((r) => setTimeout(r, 25));
  }
  await frame.contentDocument!.fonts.ready;
  sizePopup();
  // The popup is drawn at 1.15 times its size in the portal.
  const b = frame.contentDocument!.querySelector('button')!.getBoundingClientRect();
  const f = frame.getBoundingClientRect();
  clickTarget = { x: f.x + (b.x + b.width / 2) * 1.15, y: f.y + (b.y + b.height / 2) * 1.15 };
  (window as unknown as { video: unknown }).video = {
    fps: FPS,
    frames: FPS * END,
    holds: [[52, END]],
    soundtrack: { duration: END, narration, sounds, scenes },
    async at(n: number) {
      draw(n / FPS);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(r));
    },
  };
  draw(0);
  document.documentElement.dataset.ready = '1';
}

main().catch((error) => {
  document.documentElement.dataset.ready = 'error: ' + String(error);
});
