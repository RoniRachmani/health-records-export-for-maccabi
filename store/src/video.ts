/* The Chrome Web Store promo video, drawn one frame at a time: scripts/store-video.mjs asks for
   frame n, this page puts the whole stage where it should be at n/FPS seconds, and the script
   photographs it. Nothing animates by itself — every position is a function of time (motion.ts) —
   so the render is the same on every machine, however long a frame takes to capture.

   The film, in seven parts: years of records pulled into one folder · the name and the promise ·
   the clicks that start an export, on a placeholder page · the export running, with the files it
   writes · the ZIP opened, and one folder in it · private by design · where to get it.

   The export it shows is the real popup (mock-chrome.ts gives it a made-up state, never real data)
   driven through a whole run: the states pushed into it are built from the real PLAN and WEIGHTS,
   so the bar, the step names and the section list move as they do in an export. Every record,
   date, id and file name around it is made up here. */
import '@fontsource-variable/heebo';
import { DESCRIPTIONS, formatBytes } from '../../src/extension/popup/model';
import { LABELS, PLAN, WEIGHTS, percentOf, type PlanStep, type RunState } from '../../src/extension/shared/state';
import {
  between, clamp01, fade, inCubic, inOut, kinetic, lerp, linear, out, outBack, outQuint, place, pulse, ramp, rise, showing,
  type Point,
} from './motion';
import { CHECK, DOC, FOLDER, FOLDERS, LOCK, MARK, dots, fileRow, h, img, pageSkeleton, paper, svg } from './parts';

const FPS = 60;

/** When each part of the film starts, in seconds. The last one is the end. */
const T = {
  // 1 · Years of records, pulled into one folder.
  cards: 0.15,
  hookLine: 0.4,
  swallow: 2.55,
  // 2 · The name and the promise.
  title: 3.55,
  // 3 · The clicks, on a placeholder page. The camera then closes in on the popup.
  browser: 7.6,
  clickIcon: 9.5,
  popupIn: 9.6,
  zoom: 10.0,
  clickStart: 12.4,
  // 4 · The export, sped up.
  runFrom: 12.7,
  runTo: 23.3,
  saved: 23.7,
  // 5 · The ZIP, opened. Its two parts are as long as their narration needs.
  open: 27.2,
  drill: 32.7,
  // 6 · Private by design.
  privacy: 37.4,
  // 7 · Where to get it.
  close: 42.6,
  end: 48.6,
};

/** The second the README's poster is taken from: the export running, which is what the film is about. */
const POSTER_AT = 18.6;

// What a long-standing member's export comes to, the same numbers the store images show.
const FILES = 486;
const BYTES = 38_400_000;
const ZIP = 'maccabi-export-2026-09-17.zip';
const DISCLAIMER = 'Unofficial. Not affiliated with, endorsed by or sponsored by Maccabi Healthcare Services.';

// ---- the run, as the popup will be given it -----------------------------
const TOTAL_WEIGHT = PLAN.reduce((sum, step) => sum + WEIGHTS[step], 0);

/** The run state a fraction `u` of the way through the plan, weighted as a real run is. */
function runAt(u: number): RunState {
  const target = clamp01(u) * TOTAL_WEIGHT;
  let before = 0;
  let i = 0;
  let frac = 1;
  for (; i < PLAN.length; i++) {
    const weight = WEIGHTS[PLAN[i]];
    if (target <= before + weight || i === PLAN.length - 1) {
      frac = clamp01((target - before) / weight);
      break;
    }
    before += weight;
  }
  const step = PLAN[i];
  // The step's own progress detail, as the collector reports it: its parts in the order they run.
  const parts = Object.keys(DESCRIPTIONS[step]);
  const part = parts[Math.min(parts.length - 1, Math.floor(frac * parts.length))];
  return {
    id: 'demo',
    status: step === 'save' ? 'saving' : 'running',
    tabId: 1,
    // An export of this size takes about 9 minutes; the popup shows the time elapsed from here.
    startedAt: new Date(Date.now() - Math.round(u * 9 * 60_000)).toISOString(),
    next: i,
    nextStep: step,
    ctx: {},
    stepDone: frac,
    stepTotal: 1,
    detail: part ? LABELS[step] + ': ' + part : undefined,
    percent: percentOf(i, frac, 1),
    fileCount: Math.round(u * FILES),
    byteCount: Math.round(u * BYTES),
  };
}

let finished: RunState | null = null;

/** The finished run. Built once, so the time it says it took does not drift while rendering. */
function doneRun(): RunState {
  finished ??= {
    ...runAt(1),
    status: 'done',
    next: PLAN.length,
    percent: 100,
    finishedAt: new Date().toISOString(),
    zipName: ZIP,
    fileCount: FILES,
    zipBytes: BYTES,
    problems: [],
    problemCount: 0,
  };
  return finished;
}

const runPart = (t: number): number => clamp01((t - T.runFrom) / (T.runTo - T.runFrom));

// ---- the made-up records -----------------------------------------------
type Glyph = 'test' | 'visit' | 'pill' | 'referral' | 'vaccine' | 'letter' | 'chart' | 'approval' | 'file';

// Line drawings on a 24-unit grid, in the mark's register: even strokes, round ends and joins.
const GLYPHS: Record<Glyph, string> = {
  test: '<path d="M9 3h6M10 3v6.5L5.3 17.7A2.2 2.2 0 0 0 7.2 21h9.6a2.2 2.2 0 0 0 1.9-3.3L14 9.5V3"/><path d="M7.6 15h8.8"/>',
  visit: '<rect x="5" y="4" width="14" height="17" rx="2.2"/><path d="M9.5 4V3h5v1M12 8.5v5M9.5 11h5M9 17h6"/>',
  pill: '<rect x="3.2" y="8.6" width="17.6" height="6.8" rx="3.4" transform="rotate(-45 12 12)"/><path d="M9.6 9.6l4.8 4.8"/>',
  referral: '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  vaccine: '<path d="M17.5 3l3.5 3.5M19.2 4.8l-3 3M15 5.5l3.5 3.5-9 9-4 1 1-4zM11 9.5l1.5 1.5M8.5 12l1.5 1.5M3 21l2.5-2.5"/>',
  letter: '<rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="M3.5 7.2l8.5 6 8.5-6"/>',
  chart: '<path d="M4 4v16h16"/><path d="M7.5 15l3.5-4 3 2.5 5-6.5"/>',
  approval: '<path d="M12 3l7 3v5.2c0 4.4-2.9 7.9-7 9.8-4.1-1.9-7-5.4-7-9.8V6z"/><path d="M9 12l2.2 2.2 4-4.2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
};

function glyph(name: Glyph, stroke: string, size = 24): string {
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' + stroke +
    '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + GLYPHS[name] + '</svg>';
}

/** One record card of the opening, where it rests, and the order it arrives and leaves in. */
interface Card {
  kind: string;
  title: string;
  meta: string;
  glyph: Glyph;
  pink?: boolean;
  x: number;
  y: number;
  turn: number;
  scale: number;
  arrives: number;
  leaves: number;
}

// Round the edge of the frame, clear of the line in the middle. Made up, like everything here.
const CARDS: Card[] = [
  { kind: 'Test result', title: 'Complete blood count', meta: '14 Feb 2026', glyph: 'test', x: 250, y: 175, turn: -7, scale: 0.95, arrives: 1, leaves: 4 },
  { kind: 'Visit summary', title: 'Family medicine', meta: '2 Mar 2026', glyph: 'visit', pink: true, x: 705, y: 130, turn: 4, scale: 0.8, arrives: 4, leaves: 2 },
  { kind: 'Lab history', title: 'Cholesterol', meta: '2019 – 2026', glyph: 'chart', x: 1215, y: 128, turn: -3, scale: 0.85, arrives: 8, leaves: 3 },
  { kind: 'Prescription', title: 'Three medications', meta: 'Valid until Dec 2026', glyph: 'pill', pink: true, x: 1680, y: 200, turn: 6, scale: 1, arrives: 0, leaves: 6 },
  { kind: 'Referral', title: 'Orthopedics', meta: '28 Jan 2026', glyph: 'referral', x: 190, y: 565, turn: 5, scale: 0.85, arrives: 6, leaves: 8 },
  { kind: 'Vaccination', title: 'Flu vaccine', meta: '19 Oct 2025', glyph: 'vaccine', x: 1732, y: 590, turn: -5, scale: 0.9, arrives: 3, leaves: 7 },
  { kind: 'Medical file', title: 'Your whole history', meta: 'Full medical file · PDF', glyph: 'file', pink: true, x: 310, y: 930, turn: 3, scale: 1, arrives: 2, leaves: 10 },
  { kind: 'Letter', title: 'From your clinic', meta: '9 Mar 2026', glyph: 'letter', x: 760, y: 962, turn: -4, scale: 0.82, arrives: 9, leaves: 5 },
  { kind: 'Approval', title: 'Physiotherapy', meta: '2 Feb 2026', glyph: 'approval', pink: true, x: 1180, y: 950, turn: 5, scale: 0.9, arrives: 5, leaves: 1 },
  { kind: 'Visit summary', title: 'Cardiology', meta: '11 Nov 2025', glyph: 'visit', x: 1628, y: 925, turn: -6, scale: 0.95, arrives: 7, leaves: 9 },
  { kind: 'Test result', title: 'Vitamin D', meta: '6 Jun 2025', glyph: 'test', x: 962, y: 318, turn: 2, scale: 0.72, arrives: 10, leaves: 0 },
];
const CARD_W = 300;
const CARD_H = 150;

/** Where a section's files come from while it runs: its fixed files, then made-up records. */
interface Source {
  fixed: string[];
  dir?: string;
  titles?: string[];
  id?: (n: number) => string;
  /** Records whose JSON lives only in list.json: just files/<name>.pdf, no details/<name>.json. */
  pdfOnly?: boolean;
}

// The paths are the collector's own (src/core/sections); the dates, ids and titles are invented.
// Titles are kept as the site sends them — Hebrew, as in the README's example.
const SOURCES: Partial<Record<PlanStep, Source>> = {
  medications: {
    fixed: ['medications-and-prescriptions/list.json'],
    dir: 'medications-and-prescriptions', titles: ['VITAMIN-D3-1000', 'PARACETAMOL-500', 'OMEGA-3'], id: (n) => String(40218 - n * 37), pdfOnly: true,
  },
  purchases: {
    fixed: ['medications-and-prescriptions/purchased-history.html', 'medications-and-prescriptions/purchased-report.json', 'medications-and-prescriptions/files/purchased-report.pdf'],
  },
  savedDocuments: { fixed: ['uploads/list.json'], dir: 'uploads', titles: ['סיכום-ביקור', 'צילום-מרשם'], id: (n) => String(77120 - n * 211) },
  profileAndDoctors: {
    fixed: ['profile/member.json', 'profile/entitlement.json', 'profile/insurance-seniority.json', 'my-doctor/assigned-practitioners.json', 'my-doctor/eligibilities.json'],
  },
  testResults: {
    fixed: ['test-results/list.json', 'test-results/latest-lab-results.json'],
    dir: 'test-results', titles: ['ספירת-דם', 'כולסטרול', 'סוכר-בדם', 'תפקודי-כבד', 'בדיקת-שתן', 'תפקודי-כליה', 'ברזל'], id: (n) => String(7730215 - n * 3917) + '-1',
  },
  visits: { fixed: ['visit-summaries/list.json'], dir: 'visit-summaries', titles: ['רפואת-משפחה', 'קרדיולוגיה', 'אורתופדיה', 'רפואת-עיניים'], id: (n) => 'A' + (40 - n) },
  referrals: { fixed: ['referrals/list.json'], dir: 'referrals', titles: ['אורתופדיה', 'רפואת-עיניים', 'אולטרסאונד'], id: (n) => String(5501234 - n * 811), pdfOnly: true },
  approvals: { fixed: ['approvals/list.json'], dir: 'approvals', titles: ['פיזיותרפיה', 'MRI'], id: (n) => String(900144 - n * 57), pdfOnly: true },
  infoPages: { fixed: ['info-pages/list.json'], dir: 'info-pages', titles: ['המלצות-לאחר-ביקור'], id: (n) => (0x31a8f0c2 - n * 4099).toString(16), pdfOnly: true },
  vaccinations: {
    fixed: ['vaccinations/list.json', 'vaccinations/details/FLU_שפעת.json', 'vaccinations/flu-eligibility.json', 'vaccinations/files/vaccination-booklet-report.pdf'],
  },
  letters: { fixed: ['letters/list.json'], dir: 'letters', titles: ['תוצאות-בדיקה', 'זימון-לבדיקה'], id: (n) => 'L' + (20931 - n * 13), pdfOnly: true },
  doctorCommunications: { fixed: ['communication-with-doctor/list.json'], dir: 'communication-with-doctor', titles: ['שאלה-לרופא', 'בקשה-למרשם'], id: (n) => String(88213 - n * 97) },
  waitMedicalFile: { fixed: ['2026-09-17_medical-file.pdf'] },
};

/** The date of a section's nth record back from the export, a few weeks apart. */
function dateBack(step: string, n: number): string {
  let days = step.length * 3;
  for (let i = 0; i <= n; i++) days += 9 + ((i * 53 + step.length * 7) % 47);
  return new Date(Date.UTC(2026, 8, 10) - days * 86_400_000).toISOString().slice(0, 10);
}

/** The path of the nth file a step writes, or null when it has written all it has. */
function feedPath(step: PlanStep, n: number): string | null {
  const src = SOURCES[step];
  if (!src) return null;
  if (n < src.fixed.length) return src.fixed[n];
  if (!src.dir || !src.titles || !src.id) return null;
  const m = n - src.fixed.length;
  const r = src.pdfOnly ? m : Math.floor(m / 2);
  const name = [dateBack(step, r), src.id(r), src.titles[r % src.titles.length]].join('_');
  return src.pdfOnly || m % 2 ? src.dir + '/files/' + name + '.pdf' : src.dir + '/details/' + name + '.json';
}

/** Every file the feed shows, and when: one every FEED_EVERY seconds, from whichever step is running. */
const FEED_EVERY = 0.17;
const FEED: { at: number; path: string }[] = (() => {
  const out: { at: number; path: string }[] = [];
  const written: Record<string, number> = {};
  for (let at = T.runFrom + 0.12; at < T.runTo - 0.3; at += FEED_EVERY) {
    const step = runAt(runPart(at)).nextStep as PlanStep;
    const n = written[step] ?? 0;
    const path = feedPath(step, n);
    if (!path) continue;
    written[step] = n + 1;
    out.push({ at, path });
  }
  return out;
})();

/** test-results/, opened: a record's JSON and its PDF share a name. */
const DRILL: { dir: string; stem: string; ext: string; pair?: boolean }[] = [
  { dir: '', stem: 'list', ext: '.json' },
  { dir: '', stem: 'latest-lab-results', ext: '.json' },
  { dir: 'details/', stem: '2026-02-14_7730215-1_ספירת-דם', ext: '.json', pair: true },
  { dir: 'files/', stem: '2026-02-14_7730215-1_ספירת-דם', ext: '.pdf', pair: true },
  { dir: 'details/', stem: '2026-01-08_7726298-1_כולסטרול', ext: '.json' },
  { dir: 'files/', stem: '2026-01-08_7726298-1_כולסטרול', ext: '.pdf' },
  { dir: 'history/', stem: '1142_המוגלובין', ext: '.json' },
];
const DRILL_ROW = 44;

// ---- icons ----------------------------------------------------------------
const ZIP_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#296bed" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M11 6h1M12 8.5h1M11 11h1M12 13.5h1"/><rect x="10.5" y="16" width="3" height="3" rx=".8"/></svg>';
// Drawn so the triangle's centre of gravity sits on the middle of its box (a triangle centred by its
// box looks pushed left), which is the whole of its optical centring - the circle then just centres it.
const PLAY = '<svg viewBox="0 0 48 48" width="74" height="74"><path d="M18.5 13.5l17 10.5-17 10.5z" fill="#ffffff" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/></svg>';
const POINTER = '<svg viewBox="0 0 24 32" width="30" height="40"><path d="M3 2l17.5 13.2-7.7.7 4.4 9.1-3.6 1.7-4.4-9.2-5.4 5z" fill="#ffffff" stroke="#083f92" stroke-width="1.6" stroke-linejoin="round"/></svg>';
/** A file's icon by its kind: braces for JSON, a page for everything else. Pale on navy, deep on white. */
function fileIcon(path: string, onWhite = false): string {
  const json = path.endsWith('.json');
  const stroke = json ? (onWhite ? '#296bed' : '#c4e5f8') : (onWhite ? '#b83b7c' : '#f1c1cd');
  const d = json
    ? 'M9 4.5c-2.2 0-2.2 1.6-2.2 3v1.8c0 1.3-.8 2.2-2.3 2.2 1.5 0 2.3.9 2.3 2.2v1.8c0 1.4 0 3 2.2 3M15 4.5c2.2 0 2.2 1.6 2.2 3v1.8c0 1.3.8 2.2 2.3 2.2-1.5 0-2.3.9-2.3 2.2v1.8c0 1.4 0 3-2.2 3'
    : 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4';
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="' + stroke +
    '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
}
const CROSS = '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="10" fill="#f1c1cd"/><path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" stroke="#083f92" stroke-width="2.2" stroke-linecap="round"/></svg>';
const LAPTOP = '<svg viewBox="0 0 300 200" width="300" height="200" fill="none" stroke-linejoin="round" stroke-linecap="round">' +
  '<rect x="40" y="14" width="220" height="146" rx="12" fill="#ffffff" stroke="#083f92" stroke-width="5"/>' +
  '<rect x="52" y="26" width="196" height="122" rx="5" fill="#e3effd"/>' +
  '<path d="M12 170h276l-14 20H26z" fill="#ffffff" stroke="#083f92" stroke-width="5"/>' +
  '<path d="M126 170h48" stroke="#083f92" stroke-width="5"/>' +
  '<g transform="translate(115 51) scale(3)">' + MARK + '</g></svg>';

// ---- building blocks ---------------------------------------------------------
function recordCard(c: Card): HTMLElement {
  const el = h('div', 'rec',
    h('div', 'rec-head', svg(glyph(c.glyph, c.pink ? '#b83b7c' : '#296bed'), 'rec-icon' + (c.pink ? ' pink' : '')), h('span', 'rec-kind', c.kind)),
    h('div', 'rec-title', c.title),
    h('div', 'rec-meta', c.meta),
  );
  return el;
}

/** The mark over its two documents, as on the promo tiles, with the documents movable. */
interface Art {
  el: HTMLElement;
  /** 0: both documents tucked behind the folder; 1: fanned out as on the tiles. */
  spread(u: number): void;
}
function artwork(): Art {
  const el = svg('<svg viewBox="-270 -220 540 440" width="540" height="440">' +
    '<g class="pl">' + paper(0.3) + '</g><g class="pr">' + paper(0.5) + '</g>' +
    '<g transform="translate(-138 -144) scale(11.5)">' + MARK + '</g></svg>', 'art');
  const left = el.querySelector('.pl') as SVGGElement;
  const right = el.querySelector('.pr') as SVGGElement;
  const spread = (u: number): void => {
    left.setAttribute('transform', 'rotate(' + (-14 * u).toFixed(2) + ') translate(' + lerp(-83, -186, u).toFixed(1) + ' ' + lerp(-109, -134, u).toFixed(1) + ') scale(1.6)');
    right.setAttribute('transform', 'rotate(' + (12 * u).toFixed(2) + ') translate(' + lerp(-83, 28, u).toFixed(1) + ' ' + lerp(-109, -134, u).toFixed(1) + ') scale(1.6)');
    left.setAttribute('opacity', clamp01(u * 1.6).toFixed(3));
    right.setAttribute('opacity', clamp01(u * 1.6).toFixed(3));
  };
  spread(1);
  return { el, spread };
}
/** Puts the artwork's centre at x, y. */
const placeArt = (art: Art, x: number, y: number, s: number): void => place(art.el, x - 270, y - 220, s);

/** A path as the feed and the drill show it: its folders quiet, its own name bright. */
function pathLine(path: string): HTMLElement {
  const cut = path.lastIndexOf('/') + 1;
  return h('span', 'path', h('span', 'dir', path.slice(0, cut)), h('span', 'name', path.slice(cut)));
}

async function popupFrame(parent: HTMLElement): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe');
  frame.className = 'popup';
  const loaded = new Promise((r) => (frame.onload = r));
  frame.src = '/src/extension/popup/popup.html?state=ready';
  parent.append(frame);
  await loaded;
  const doc = frame.contentDocument as Document;
  for (let i = 0; i < 200 && !doc.querySelector('#view > :not(.loading)'); i++) await tick(25);
  await doc.fonts.ready;
  return frame;
}

const tick = (ms = 0): Promise<unknown> => new Promise((r) => setTimeout(r, ms));

/** Words beside the window: a caption per part of the film. */
interface Caption {
  from: number;
  to: number;
  top: number;
  step?: string;
  title: string;
  accent?: number[];
  text?: string;
  chip?: string;
}

const CAPTIONS: Caption[] = [
  { from: T.zoom + 0.9, to: T.runFrom + 0.25, top: 400, step: '3', title: 'Press Start export' },
  { from: T.runFrom + 0.25, to: T.saved + 0.25, top: 118, title: 'It works through your records on its own', chip: 'Sped up · a real export takes 5 to 20 minutes' },
  {
    from: T.saved + 0.25, to: T.open, top: 360, title: 'One ZIP in your Downloads folder', accent: [1],
    text: 'Everything it collected, in one dated file. The extension then deletes its own copy, and lists anything it could not export.',
  },
  {
    from: T.open + 0.3, to: T.drill, top: 360, title: 'Every record, every PDF',
    text: 'One folder per part of Maccabi Online, your full medical file on top, and a README that explains what each folder holds.',
  },
  {
    from: T.drill, to: T.privacy - 0.1, top: 360, title: 'Named by date, id and title',
    text: 'A record’s data, exactly as the site sent it, sits beside its PDF under the same name.',
  },
];

/** The two steps shown over the browser before the camera moves in. */
const STEPS: { from: number; to: number; step: string; text: string }[] = [
  { from: T.browser + 0.6, to: T.clickIcon - 0.05, step: '1', text: 'Log in to Maccabi Online as usual' },
  { from: T.clickIcon - 0.05, to: T.zoom + 0.55, step: '2', text: 'Click the extension’s icon' },
];

/**
 * What the narrator says, and when each line starts. scripts/soundtrack.mjs has each line spoken
 * (ElevenLabs), places it at its second and fails the render if one runs into the next, so a line
 * that grows has to be cut or given room here. Numbers are spelled out, as they are to be said.
 */
const NARRATION: { at: number; text: string }[] = [
  { at: T.hookLine, text: 'Years of test results, visits, prescriptions and letters.' },
  { at: T.title + 0.5, text: 'All in one ZIP, saved to your own computer.' },
  { at: T.browser + 0.7, text: 'Log in as usual, click the icon, and press Start export.' },
  { at: T.runFrom + 0.5, text: 'It works through every section on its own, saving every PDF, and the data behind it.' },
  { at: T.runFrom + 6.9, text: 'A real export takes five to twenty minutes.' },
  { at: T.saved + 0.3, text: 'When it’s done, one dated ZIP lands in your Downloads folder.' },
  { at: T.open + 0.7, text: 'Inside: every record, every PDF, and your full medical file.' },
  { at: T.drill + 0.4, text: 'Each record’s data sits right beside its PDF, under the same name.' },
  { at: T.privacy + 0.4, text: 'It’s private by design: nothing between Maccabi and your computer.' },
  { at: T.close + 0.4, text: 'Health Records Export for Maccabi. Free, on the Chrome Web Store.' },
];

/** The sound effects, by kind (scripts/soundtrack.mjs draws each one) and second. */
const SOUNDS: { at: number; kind: string; dur?: number }[] = [
  { at: T.cards, kind: 'whoosh', dur: 1.3 },
  { at: T.swallow - 1.0, kind: 'riser', dur: 1.0 },
  { at: T.swallow, kind: 'impact' },
  { at: T.swallow + 0.1, kind: 'suck', dur: 1.0 },
  { at: T.browser + 0.2, kind: 'whoosh', dur: 0.8 },
  { at: T.clickIcon, kind: 'click' },
  { at: T.popupIn, kind: 'pop' },
  { at: T.zoom, kind: 'whoosh', dur: 1.3 },
  { at: T.clickStart, kind: 'click' },
  { at: T.saved, kind: 'chime' },
  { at: T.open, kind: 'whoosh', dur: 0.8 },
  { at: T.drill + 0.35, kind: 'pop' },
  { at: T.privacy - 0.3, kind: 'whoosh', dur: 0.9 },
  ...[0, 1, 2, 3, 4].map((i) => ({ at: T.privacy + 2.2 + i * 0.2, kind: 'pop' })),
  { at: T.close + 0.1, kind: 'shimmer' },
];

const PRIVACY_PILLS: { no: boolean; text: string }[] = [
  { no: true, text: 'No servers' },
  { no: true, text: 'No analytics' },
  { no: true, text: 'No tracking' },
  { no: false, text: 'Never sees your password' },
  { no: false, text: 'Open source' },
];

// ---- the film ----------------------------------------------------------------
async function main(): Promise<void> {
  document.body.className = 'video';

  // The ground: the marquee's glows, drifting, over a faint dot grid.
  const grid = h('div', 'grid');
  const glows = [0, 1, 2].map(() => h('div', 'glow'));
  document.body.append(grid, ...glows);

  // 1 · the opening
  const cards = CARDS.map(recordCard);
  const hookLine = kinetic('h1', 'hook-line', 'Years of medical records.');
  const hook = h('div', 'layer', ...cards, hookLine.el);

  // 2 · the name and the promise
  const art = artwork();
  const lockName = h('p', 'lock-name', 'Health Records Export for Maccabi');
  const promise = kinetic('h1', 'lock-title', 'Your Maccabi records, in one ZIP', [3, 4, 5]);
  const lockSub = h('p', 'lock-sub', 'A free Chrome extension that saves every record and PDF to your own computer.');
  const lockNote = h('p', 'disclaimer', DISCLAIMER);
  const lockup = h('div', 'layer', lockName, promise.el, lockSub, lockNote);

  // 3 and 4 · the browser, the popup and the pointer, under one camera
  const winBg = h('div', 'win-bg');
  const toolbarBg = h('div', 'toolbar-bg');
  const dotsEl = dots();
  const address = h('div', 'address', svg(LOCK), h('span', '', 'online.maccabi4u.co.il'));
  const badge = h('span', 'badge');
  // The 128px icon, drawn small: the camera and the 4K render take this one to about 80 pixels.
  const ext = h('span', 'ext', img('/icons/icon-128.png'), badge);
  const page = h('div', 'page-clip', pageSkeleton(4));
  const browser = h('div', 'browser', winBg, toolbarBg, h('div', 'toolbar', dotsEl, address, ext), page);
  const cursor = h('span', 'cursor', svg(POINTER));
  const ripple = h('span', 'ripple');
  const world = h('div', 'world', browser, ripple, cursor);

  const steps = STEPS.map((s) => h('div', 'stepcap', h('span', 'num', s.step), h('span', '', s.text)));
  const captions = CAPTIONS.map((c) => {
    const title = kinetic('h2', '', c.title, c.accent);
    const el = h('section', 'caption',
      c.step ? h('span', 'num', c.step) : null,
      title.el,
      c.text ? h('p', '', c.text) : null,
      c.chip ? h('span', 'chip', c.chip) : null,
    );
    el.style.top = c.top + 'px';
    return { el, words: title.words, num: el.querySelector<HTMLElement>('.num'), rest: Array.from(el.querySelectorAll<HTMLElement>('p, .chip')) };
  });

  // The files the export writes, as it writes them.
  const feedCount = h('strong', '');
  const feedRows = Array.from({ length: 9 }, () => h('div', 'feed-row'));
  const feed = h('div', 'feed',
    // The count leads, on the left: the poster's play badge sits over the right of this panel.
    h('div', 'feed-head', feedCount, h('span', '', 'collected so far')),
    h('div', 'feed-list', ...feedRows),
  );

  // 5 · the ZIP, opened: the popup's file card grows into its window.
  const readme = fileRow(DOC, 'README.md', 'What every folder holds, and what isn’t there', 'Markdown');
  const medical = fileRow(DOC, '2026-09-17_medical-file.pdf', 'Your full medical file', 'PDF');
  const folderRows = FOLDERS.map(([name, what, kinds]) => fileRow(FOLDER, name, what, kinds));
  const drillRow = folderRows[FOLDERS.findIndex(([name]) => name === 'test-results')];
  const drillRows = DRILL.map((d) => h('div', 'drill-row' + (d.pair ? ' pair' : ''),
    svg(fileIcon(d.ext, true), 'drill-icon'),
    h('span', 'drill-path', h('span', 'dir', d.dir), h('span', 'stem', d.stem), h('span', 'dir', d.ext)),
  ));
  const drill = h('div', 'drill', ...drillRows);
  const filesInner = h('div', 'files-inner',
    h('div', 'toolbar', dots(), h('div', 'files-title', 'maccabi-export-2026-09-17')),
    h('div', 'files-list', readme, medical, ...folderRows),
  );
  filesInner.querySelector('.files-list')?.insertBefore(drill, drillRow.nextSibling);
  const ghost = h('div', 'ghost', svg(ZIP_ICON, 'zip'), h('div', '', h('strong', '', ZIP), h('span', '', '486 files · 38 MB')));
  const files = h('div', 'files-win', filesInner, ghost);
  const fileRowsAll = [readme, medical, ...folderRows];

  // 6 · private by design
  const privacyTitle = kinetic('h2', 'privacy-title', 'Private by design', [2]);
  const privacySub = h('p', 'privacy-sub', 'Straight from Maccabi Online to a file on your computer. Nothing in between.');
  const site = h('div', 'node site',
    h('div', 'mini', h('div', 'mini-bar', dots(), h('div', 'mini-address', svg(LOCK), h('span', '', 'online.maccabi4u.co.il'))),
      h('div', 'mini-body', h('i'), h('i'), h('i'), h('i'))),
    h('p', 'node-label', 'Maccabi Online'),
  );
  const home = h('div', 'node home', svg(LAPTOP, 'laptop'), h('p', 'node-label', 'Your computer'));
  const wire = h('div', 'wire');
  const packets = [0, 1, 2, 3].map(() => h('span', 'packet', h('i'), h('i')));
  const pills = PRIVACY_PILLS.map((p) => h('span', 'pill', svg(p.no ? CROSS : CHECK, 'pill-icon'), h('span', '', p.text)));
  const privacy = h('div', 'layer',
    privacyTitle.el, privacySub, wire, ...packets, site, home,
    h('div', 'pills', ...pills.slice(0, 3)), h('div', 'pills second', ...pills.slice(3)),
  );

  // 7 · where to get it
  const endArt = artwork();
  const endName = kinetic('h1', 'end-title', 'Health Records Export for Maccabi');
  const endSub = h('p', 'end-sub', 'Free on the Chrome Web Store  ·  Open source');
  const endLink = h('p', 'end-link', 'github.com/RoniRachmani/health-records-export-for-maccabi');
  const endNote = h('p', 'disclaimer', DISCLAIMER);
  const ending = h('div', 'layer', endName.el, endSub, endLink, endNote);

  const scrim = h('div', 'scrim');
  document.body.append(hook, art.el, lockup, world, ...steps, ...captions.map((c) => c.el), feed, files, privacy, endArt.el, ending, scrim);

  // ---- the real popup, in the browser window ----
  const frame = await popupFrame(browser);
  const doc = frame.contentDocument as Document;
  const push = (run: RunState | null): void => (frame.contentWindow as unknown as { demoRun: (r: RunState | null) => void }).demoRun(run);
  // How tall the popup's content is; the iframe's own height doesn't come into it, because the
  // popup's body is only as tall as what is in it.
  const popupHeight = (): number => Math.ceil(doc.body.getBoundingClientRect().height);
  const showRun = async (run: RunState | null): Promise<number> => {
    push(run);
    for (let i = 0; i < 40; i++) {
      await tick(25);
      const button = doc.querySelector('#view button.primary');
      if (run || button?.textContent === 'Start export') break;
    }
    const tall = popupHeight();
    frame.style.height = tall + 'px';
    return tall;
  };

  // The popup's size in the world, and how far the camera closes in on it: one scale for the whole
  // film — the popup must not change size under the viewer — chosen so that its tallest view fits.
  const POPUP = 1.25;
  frame.style.transform = 'scale(' + POPUP + ')';
  world.style.transform = 'none';
  let tallest = 0;
  for (const u of [0.05, 0.3, 0.55, 0.8, 0.97]) tallest = Math.max(tallest, await showRun(runAt(u)));
  const hReady = await showRun(null);
  tallest = Math.max(tallest, hReady);
  const CLOSE = Math.min(1.42, 900 / (tallest * POPUP));
  /** Where the popup is anchored, in world coordinates: its top right corner, under the toolbar. */
  const f0 = frame.getBoundingClientRect();
  const anchor: Point = { x: f0.right, y: f0.top };
  /** A point inside the popup, in world coordinates. */
  const inPopup = (el: Element): DOMRect => {
    const r = el.getBoundingClientRect();
    const f = frame.getBoundingClientRect(); // scaled about its top right corner, which stays put
    const x = f.right - (frame.clientWidth - r.left) * POPUP;
    const y = f.top + r.top * POPUP;
    return new DOMRect(x, y, r.width * POPUP, r.height * POPUP);
  };
  const centre = (r: DOMRect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const onButton = centre(inPopup(doc.querySelector('#view button.primary') as Element));
  await showRun(doneRun());
  const cardInWorld = inPopup(doc.querySelector('.file-card') as Element);
  await showRun(null);
  const extRect = ext.getBoundingClientRect();
  const onIcon: Point = { x: extRect.left + extRect.width / 2, y: extRect.top + extRect.height / 2 };
  const browserRect = browser.getBoundingClientRect();
  const offStage: Point = { x: browserRect.right + 260, y: browserRect.bottom + 220 };

  /** The camera: which world point is at the middle of the frame, and how close it is. */
  const camAt = (t: number): { x: number; y: number; s: number } => {
    const wide = { s: 1 + 0.015 * ramp(t, T.browser, T.zoom - T.browser, linear), x: 960, y: 540 };
    // Closed in, the popup's top right corner stays at the same point of the frame while the
    // camera keeps easing closer, so the popup grows down and to the left.
    const s = CLOSE * (1 + 0.025 * ramp(t, T.zoom + 1.3, T.open - T.zoom - 1.3, linear));
    const close = { s, x: anchor.x - (1800 - 960) / s, y: anchor.y + (540 - 104) / s };
    const z = ramp(t, T.zoom, 1.3, inOut);
    return { s: lerp(wide.s, close.s, z), x: lerp(wide.x, close.x, z), y: lerp(wide.y, close.y, z) };
  };
  const toScreen = (p: Point, cam: { x: number; y: number; s: number }): Point => ({ x: (p.x - cam.x) * cam.s + 960, y: (p.y - cam.y) * cam.s + 540 });

  /** The files window, where it ends up. */
  const FILES_RECT = { x: 900, y: 100, w: 930, h: 880 };
  const cardOnScreen = (() => {
    const cam = camAt(T.open);
    const a = toScreen({ x: cardInWorld.x, y: cardInWorld.y }, cam);
    // The popup's cards are rounded at 20px (--r-card), which the popup's scale and the camera's enlarge.
    return { x: a.x, y: a.y, w: cardInWorld.width * cam.s, h: cardInWorld.height * cam.s, r: 20 * POPUP * cam.s };
  })();

  /** The line the records travel along in part 6; the two ends sit under video.css's .site and .home. */
  const WIRE = { from: 700, to: 1220, y: 540 };

  // ---- where everything is, at time t ----
  let pushed = '';
  let shownHeight = 0;
  const feedShown: number[] = feedRows.map(() => -1);

  /** The ground's glows: where each rests, its radius, and how far and how fast it drifts. */
  const GLOW = [
    { x: 1560, y: 170, r: 640, ax: 60, ay: 40, f: 0.21 },
    { x: 1400, y: 980, r: 860, ax: 80, ay: 30, f: 0.17 },
    { x: 240, y: 260, r: 560, ax: 50, ay: 60, f: 0.13 },
  ];

  function applyAt(t: number): void {
    // The ground drifts the whole way through.
    glows.forEach((g, i) => {
      const k = GLOW[i];
      place(g, k.x - k.r + Math.sin(t * k.f + i * 2) * k.ax, k.y - k.r + Math.cos(t * k.f * 1.3 + i) * k.ay);
      g.style.width = g.style.height = k.r * 2 + 'px';
    });
    place(grid, -((t * 7) % 40), -((t * 4) % 40));

    // ---- 1 · years of records, pulled into one folder ----
    fade(hook, t < T.title + 0.4 ? 1 : 0);
    const MIDDLE: Point = { x: 960, y: 540 };
    CARDS.forEach((c, i) => {
      const el = cards[i];
      const len = Math.hypot(c.x - 960, c.y - 540) || 1;
      const dir = { x: (c.x - 960) / len, y: (c.y - 540) / len };
      const inU = ramp(t, T.cards + c.arrives * 0.09, 1.0, outQuint);
      const bob = Math.sin(t * 1.2 + i * 1.7) * 6;
      let x = c.x + dir.x * 820 * (1 - inU);
      let y = c.y + dir.y * 820 * (1 - inU) + bob;
      let turn = c.turn + dir.x * 26 * (1 - inU) + Math.sin(t * 0.8 + i) * 0.8;
      let s = c.scale * (1 + 0.04 * t / T.swallow);
      // Into the folder: faster and faster, curling a little as they go.
      const leave = T.swallow + c.leaves * 0.05;
      const u = ramp(t, leave, 0.55, inCubic);
      if (u > 0) {
        const curl = Math.sin(Math.PI * u) * 90 * (i % 2 ? 1 : -1);
        x = lerp(x, MIDDLE.x, u) - dir.y * curl;
        y = lerp(y, MIDDLE.y, u) + dir.x * curl;
        turn += u * 70 * (i % 2 ? 1 : -1);
        s *= lerp(1, 0.12, u);
      }
      place(el, x - CARD_W / 2, y - CARD_H / 2, s, turn);
      fade(el, Math.min(ramp(t, T.cards + c.arrives * 0.09, 0.25), 1 - ramp(t, leave + 0.38, 0.17, linear)));
    });
    rise(hookLine.words, t, T.hookLine, 0.09, 0.8);
    fade(hookLine.el, 1 - ramp(t, T.swallow - 0.35, 0.4));
    place(hookLine.el, 0, -30 * ramp(t, T.swallow - 0.35, 0.4), 1 - 0.04 * ramp(t, T.swallow - 0.35, 0.4));

    // The folder: pops up in the middle, gulps each card, then rises to head the title.
    let gulp = 0;
    for (const c of CARDS) gulp += pulse(t, T.swallow + c.leaves * 0.05 + 0.5, 0.22);
    const up = ramp(t, T.title, 0.9, inOut);
    const pop = ramp(t, T.swallow - 0.2, 0.6, outBack);
    const artS = lerp(0.9, 0.6, up) * pop * (1 + 0.035 * Math.min(gulp, 2));
    const artOut = ramp(t, T.browser - 0.2, 0.45, inOut);
    placeArt(art, 960, lerp(540, 340, up) - 70 * artOut, artS);
    art.spread(ramp(t, T.title + 0.2, 0.9, outQuint));
    fade(art.el, Math.min(pop * 4, 1 - artOut));

    // ---- 2 · the name and the promise ----
    const lockOut = ramp(t, T.browser - 0.2, 0.45, inOut);
    fade(lockup, t >= T.title && lockOut < 1 ? 1 : 0);
    place(lockup, 0, -70 * lockOut);
    fade(lockName, ramp(t, T.title + 0.45, 0.5) * (1 - lockOut));
    place(lockName, 0, 16 * (1 - ramp(t, T.title + 0.45, 0.6, outQuint)));
    rise(promise.words, t, T.title + 0.6, 0.075);
    fade(promise.el, 1 - lockOut);
    fade(lockSub, ramp(t, T.title + 1.3, 0.5) * (1 - lockOut));
    place(lockSub, 0, 18 * (1 - ramp(t, T.title + 1.3, 0.7, outQuint)));
    fade(lockNote, ramp(t, T.title + 1.5, 0.5) * (1 - lockOut));

    // ---- 3 · the browser, the clicks and the camera ----
    const cam = camAt(t);
    const worldOn = showing(t, T.browser + 0.2, T.open + 0.5, 0.4, 0.3);
    fade(world, worldOn);
    world.style.transform = 'translate(960px,540px) scale(' + cam.s.toFixed(4) + ') translate(' + (-cam.x).toFixed(2) + 'px,' + (-cam.y).toFixed(2) + 'px)';
    place(browser, 0, 150 * (1 - ramp(t, T.browser + 0.2, 0.9, outQuint)));
    // Closing in, the page falls away, and the popup and the toolbar icon are left on their own.
    const away = ramp(t, T.zoom + 0.2, 0.9, inOut);
    for (const el of [winBg, toolbarBg, dotsEl, address, page]) fade(el, 1 - away);

    STEPS.forEach((s, i) => {
      const on = showing(t, s.from, s.to, 0.35, 0.3);
      fade(steps[i], on);
      place(steps[i], 0, 14 * (1 - ramp(t, s.from, 0.5, outQuint)));
    });

    // The export itself: one state per frame, exactly as the background writes them.
    const run = t < T.runFrom ? null : t < T.saved ? runAt(runPart(t)) : doneRun();
    const key = run ? run.status + run.percent.toFixed(2) + run.fileCount : 'idle';
    if (key !== pushed) {
      pushed = key;
      push(run);
    }
    // Its height follows the view, as a real popup's does; anchored at the top, only its bottom moves.
    const tall = popupHeight();
    if (tall !== shownHeight) {
      shownHeight = tall;
      frame.style.height = tall + 'px';
    }
    // The popup's own animations (the sheen on the bar, the pulse on the current step) run on the
    // wall clock, which has nothing to do with the film's: each frame would catch them at a random
    // point, and the bar would flicker. They run on the film's clock instead, and its transitions
    // land at once, since the states pushed in already move a frame at a time.
    for (const a of doc.getAnimations()) {
      if ('transitionProperty' in a) {
        a.finish();
      } else {
        a.pause();
        a.currentTime = t * 1000;
      }
    }
    const opened = ramp(t, T.popupIn, 0.3, out);
    fade(frame, opened * (1 - ramp(t, T.open, 0.25)));
    frame.style.transform = 'scale(' + (POPUP * lerp(0.94, 1, opened)).toFixed(4) + ')';
    fade(ext, 1 - ramp(t, T.open, 0.25));

    // The toolbar badge, as src/extension/background/ui.ts sets it.
    badge.textContent = run ? (run.status === 'done' ? '✓' : run.percent + '%') : '';
    badge.style.background = run?.status === 'done' ? '#1a7a48' : '#296bed';
    fade(badge, run ? 1 : 0);
    ext.style.setProperty('--ring-o', (pulse(t, T.clickIcon) * 0.9).toFixed(3));
    ext.style.setProperty('--ring-s', String(1 + 0.5 * (1 - pulse(t, T.clickIcon))));
    // A soft halo pulses round the icon while the export runs, and flares once when it is saved.
    ext.style.setProperty('--glow', (run && run.status !== 'done' ? 0.35 + 0.25 * Math.sin(t * 5) : run ? pulse(t, T.saved, 1.2) : 0).toFixed(3));

    // The pointer: in, to the icon, to Start export, and away.
    const path = t < T.clickIcon ? between(offStage, onIcon, ramp(t, T.browser + 1.0, 0.95, inOut))
      : t < T.clickStart ? between(onIcon, onButton, ramp(t, T.zoom + 0.9, 1.0, inOut))
      : between(onButton, offStage, ramp(t, T.clickStart + 0.35, 1.1, inCubic));
    place(cursor, path.x, path.y);
    fade(cursor, Math.min(ramp(t, T.browser + 1.0, 0.3), 1 - ramp(t, T.clickStart + 0.35, 0.35)));
    const ring = Math.max(pulse(t, T.clickIcon), pulse(t, T.clickStart));
    fade(ripple, ring * 0.6);
    ripple.style.transform = 'translate3d(' + path.x.toFixed(1) + 'px,' + path.y.toFixed(1) + 'px,0) scale(' + (0.4 + 0.9 * (1 - ring)).toFixed(3) + ')';

    // Start export under the pointer: hovered, then pressed.
    const startButton = doc.querySelector<HTMLElement>('#view button.primary');
    if (startButton && !run) {
      const pressed = t >= T.clickStart && t < T.clickStart + 0.16;
      const hovered = t >= T.zoom + 1.85 && t < T.runFrom;
      startButton.style.background = hovered ? '#1f5bd6' : '';
      startButton.style.borderColor = hovered ? '#1f5bd6' : '';
      startButton.style.transform = pressed ? 'scale(0.975)' : '';
    }

    // ---- the words beside the window ----
    CAPTIONS.forEach((c, i) => {
      const cap = captions[i];
      const on = showing(t, c.from, c.to, 0.3, 0.35);
      fade(cap.el, on);
      place(cap.el, 0, -24 * ramp(t, c.to - 0.35, 0.35, inOut));
      rise(cap.words, t, c.from + (cap.num ? 0.12 : 0), 0.06);
      if (cap.num) cap.num.style.transform = 'scale(' + ramp(t, c.from, 0.5, outBack).toFixed(4) + ')';
      cap.rest.forEach((el, j) => {
        const u = ramp(t, c.from + 0.45 + j * 0.15, 0.7, outQuint);
        el.style.opacity = u.toFixed(3);
        el.style.transform = 'translate3d(0,' + ((1 - u) * 16).toFixed(1) + 'px,0)';
      });
    });

    // ---- 4 · the files, as the export writes them ----
    const feedOn = showing(t, T.runFrom + 0.4, T.saved + 0.25, 0.5, 0.35);
    fade(feed, feedOn);
    place(feed, 0, 30 * (1 - ramp(t, T.runFrom + 0.4, 0.7, outQuint)));
    const counted = run ?? runAt(0);
    feedCount.textContent = counted.fileCount + ' files · ' + formatBytes(counted.byteCount ?? 0);
    let newest = -1;
    while (newest + 1 < FEED.length && FEED[newest + 1].at <= t) newest++;
    const ROW = 50;
    feedRows.forEach((el, k) => {
      // The pool holds the last rows that arrived; row j always goes to the same element.
      const j = newest - (((newest - k) % feedRows.length) + feedRows.length) % feedRows.length;
      if (j < 0 || newest < 0) {
        fade(el, 0);
        return;
      }
      if (feedShown[k] !== j) {
        feedShown[k] = j;
        const path = FEED[j].path;
        el.replaceChildren(svg(fileIcon(path), 'feed-icon'), pathLine(path));
      }
      // The list moves down a row as each file arrives, and the new one slides in from the top.
      let slot = -1;
      for (let m = j; m <= newest; m++) slot += ramp(t, FEED[m].at, 0.15, out);
      place(el, 0, slot * ROW);
      fade(el, ramp(t, FEED[j].at, 0.12) * (1 - clamp01(slot - 5.5)));
      el.style.setProperty('--flash', (pulse(t, FEED[j].at, 0.7) * 0.16).toFixed(3));
    });

    // ---- 5 · the ZIP, opened ----
    const grow = ramp(t, T.open, 0.8, inOut);
    const filesOut = ramp(t, T.privacy - 0.5, 0.5, inCubic);
    fade(files, t < T.open ? 0 : 1 - filesOut);
    ghost.style.width = cardOnScreen.w.toFixed(1) + 'px';
    const box = {
      x: lerp(cardOnScreen.x, FILES_RECT.x, grow),
      y: lerp(cardOnScreen.y, FILES_RECT.y, grow) + 120 * filesOut,
      w: lerp(cardOnScreen.w, FILES_RECT.w, grow),
      h: lerp(cardOnScreen.h, FILES_RECT.h, grow),
    };
    files.style.left = box.x.toFixed(1) + 'px';
    files.style.top = box.y.toFixed(1) + 'px';
    files.style.width = box.w.toFixed(1) + 'px';
    files.style.height = box.h.toFixed(1) + 'px';
    files.style.borderRadius = lerp(cardOnScreen.r, 16, grow).toFixed(1) + 'px';
    // The card's own contents give way to the window's while it grows, never leaving it blank.
    fade(ghost, 1 - ramp(t, T.open + 0.25, 0.3));
    fade(filesInner, ramp(t, T.open + 0.3, 0.3));
    fileRowsAll.forEach((row, i) => {
      const u = ramp(t, T.open + 0.35 + i * 0.04, 0.5, outQuint);
      row.style.opacity = u.toFixed(3);
      row.style.transform = 'translate3d(0,' + ((1 - u) * 14).toFixed(1) + 'px,0)';
    });
    // test-results/, opened.
    const opening = ramp(t, T.drill + 0.35, 0.6, inOut);
    drill.style.height = (opening * DRILL.length * DRILL_ROW).toFixed(1) + 'px';
    drillRow.style.setProperty('--hl', ramp(t, T.drill, 0.35).toFixed(3));
    drillRows.forEach((row, i) => {
      const u = ramp(t, T.drill + 0.55 + i * 0.09, 0.5, outQuint);
      row.style.opacity = u.toFixed(3);
      row.style.transform = 'translate3d(' + ((1 - u) * -16).toFixed(1) + 'px,0,0)';
    });
    drill.style.setProperty('--pair', ramp(t, T.drill + 1.6, 0.5).toFixed(3));

    // ---- 6 · private by design ----
    const privOut = ramp(t, T.close - 0.45, 0.45, inOut);
    fade(privacy, t >= T.privacy && t < T.close ? 1 - privOut : 0);
    place(privacy, 0, -40 * privOut);
    rise(privacyTitle.words, t, T.privacy + 0.25, 0.08);
    fade(privacySub, ramp(t, T.privacy + 0.7, 0.5));
    place(privacySub, 0, 16 * (1 - ramp(t, T.privacy + 0.7, 0.7, outQuint)));
    const nodeIn = (el: HTMLElement, from: number, dx: number): void => {
      const u = ramp(t, from, 0.8, outQuint);
      fade(el, ramp(t, from, 0.35));
      el.style.transform = 'translate3d(' + ((1 - u) * dx).toFixed(1) + 'px,0,0) scale(' + lerp(0.92, 1, u).toFixed(4) + ')';
    };
    nodeIn(site, T.privacy + 0.9, -60);
    nodeIn(home, T.privacy + 1.1, 60);
    wire.style.transform = 'scaleX(' + ramp(t, T.privacy + 1.4, 0.6, inOut).toFixed(4) + ')';
    packets.forEach((p, i) => {
      const run0 = T.privacy + 1.8;
      const u = t < run0 ? 0 : ((t - run0) / 1.5 + i / packets.length) % 1;
      const x = lerp(WIRE.from, WIRE.to, u);
      place(p, x - 18, WIRE.y - 23, 1, 0);
      fade(p, t < run0 ? 0 : Math.min(u * 12, (1 - u) * 12, 1) * ramp(t, run0, 0.4));
    });
    pills.forEach((p, i) => {
      const u = ramp(t, T.privacy + 2.2 + i * 0.2, 0.55, outBack);
      p.style.opacity = clamp01(u * 2).toFixed(3);
      p.style.transform = 'scale(' + lerp(0.6, 1, u).toFixed(4) + ')';
    });

    // ---- 7 · where to get it ----
    fade(ending, t >= T.close ? 1 : 0);
    const endPop = ramp(t, T.close + 0.1, 0.7, outBack);
    placeArt(endArt, 960, 356, 0.56 * endPop);
    endArt.spread(ramp(t, T.close + 0.35, 0.8, outQuint));
    fade(endArt.el, t >= T.close ? clamp01(endPop * 3) : 0);
    rise(endName.words, t, T.close + 0.45, 0.08);
    fade(endSub, ramp(t, T.close + 1.0, 0.5));
    place(endSub, 0, 16 * (1 - ramp(t, T.close + 1.0, 0.7, outQuint)));
    fade(endLink, ramp(t, T.close + 1.25, 0.5));
    fade(endNote, ramp(t, T.close + 1.5, 0.5));

    fade(scrim, 0);
  }

  await document.fonts.load('600 20px "Heebo Variable"', 'אבג');
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => undefined)));

  (window as unknown as { video: unknown }).video = {
    fps: FPS,
    frames: Math.round(T.end * FPS),
    /** What scripts/soundtrack.mjs scores the film from: its parts, its narration and its effects. */
    soundtrack: { duration: T.end, scenes: T, narration: NARRATION, sounds: SOUNDS },
    /** Puts the stage where it belongs at this frame, and waits until it is drawn. */
    async at(n: number): Promise<void> {
      applyAt(n / FPS);
      await tick(0);
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    },
  };
  // The poster the README shows: one frame of the film with a play badge over it, because a still
  // that looks like a screenshot doesn't tell anyone there is a video behind it. `?poster` is the
  // second above, which is what scripts/store-assets.mjs asks for; `?poster=12` is that second
  // instead, for looking at candidates. Nothing here is on screen while the film is being rendered.
  const poster = new URLSearchParams(location.search).get('poster');
  if (poster === null) {
    applyAt(0);
  } else {
    // Twice, a moment apart, so the popup has laid out the state the first one gave it.
    applyAt(poster === '' ? POSTER_AT : Number(poster));
    await tick(40);
    applyAt(poster === '' ? POSTER_AT : Number(poster));
    fade(scrim, 1);
    document.body.append(h('div', 'play', svg(PLAY)));
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => {
  document.documentElement.dataset.ready = 'error: ' + (e instanceof Error ? e.message : String(e));
});
