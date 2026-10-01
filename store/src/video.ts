/* The Chrome Web Store promo video, drawn one frame at a time: scripts/store-video.mjs asks for
   frame n, this page puts the whole stage where it should be at n/FPS seconds, and the script
   photographs it. Nothing animates by itself — every position is a function of time (motion.ts) —
   so the render is the same on every machine, however long a frame takes to capture.

   The film tells docs/positioning.md's story, in nine parts: what it is for, first — an assistant saying
   what stands out in the export · years of records, seen one page at a time, pulled into one folder ·
   the name and the headline · the clicks that start an export, on a placeholder page · the export
   running, with the files it writes · the ZIP opened, and a file of the member's own added to it ·
   what to ask · the assistant again, naming its source · where to get it, and the one line on privacy.

   The export it shows is the real popup (mock-chrome.ts gives it a made-up state, never real data)
   driven through a whole run: the states pushed into it are built from the real PLAN and WEIGHTS,
   so the bar, the step names and the section list move as they do in an export. Every record,
   date, id and file name around it is made up here. */
import '@fontsource-variable/heebo';
import { currentStage, DESCRIPTIONS, formatBytes, STAGES, stageSpan } from '../../src/extension/popup/model';
import { LABELS, PLAN, WEIGHTS, percentOf, type PlanStep, type RunState } from '../../src/extension/shared/state';
import {
  between, clamp01, fade, inCubic, inOut, kinetic, lerp, linear, out, outBack, outQuint, place, pulse, ramp, rise, showing,
  type Point,
} from './motion';
import { LOCK, MARK, ONE_THING, STANDS_OUT, chatWindow, dots, exportRows, h, img, pageSkeleton, paper, svg, type Chat } from './parts';

const FPS = 60;

/**
 * How long the opening answer runs before the first card: two of the music's bars, which the rest of
 * the film is timed from, so that the bar lines still fall on its cuts (scripts/soundtrack.mjs).
 */
const OPEN = 5.43;

/** When each part of the film starts, in seconds. The last one is the end. */
const T = {
  // 0 · What it is for: the assistant, answering from the export.
  answer: 0,
  // 1 · Years of records, pulled into one folder.
  cards: OPEN + 0.15,
  hookLine: OPEN + 0.4,
  swallow: OPEN + 3.65,
  // 2 · The name and the promise.
  title: OPEN + 4.65,
  // 3 · The clicks, on a placeholder page. The camera then closes in on the popup.
  browser: OPEN + 8.7,
  clickIcon: OPEN + 10.6,
  popupIn: OPEN + 10.7,
  zoom: OPEN + 11.1,
  clickStart: OPEN + 13.5,
  // 4 · The export, sped up.
  runFrom: OPEN + 13.8,
  runTo: OPEN + 24.4,
  saved: OPEN + 24.8,
  // 5 · The ZIP, opened, and then added to. Its two parts are as long as their narration needs.
  open: OPEN + 28.3,
  keep: OPEN + 33.8,
  // 6 · What to ask.
  uses: OPEN + 38.5,
  // 7 · Then, asked of the assistant the member chooses: two of the music's bars.
  ask: OPEN + 43.7,
  // 8 · Where to get it.
  close: OPEN + 49.0,
  end: OPEN + 55.85,
};

/** The second the README's poster is taken from: the export running, which is what the film is about. */
const POSTER_AT = OPEN + 19.7;

// What a long-standing member's export comes to, the same numbers the store images show.
const FILES = 486;
const BYTES = 38_400_000;
const ZIP = 'maccabi-export-2026-09-17.zip';
const DISCLAIMER = 'Unofficial. Not affiliated with, endorsed by or sponsored by Maccabi Healthcare Services.';

// ---- the run, as the popup will be given it -----------------------------
const TOTAL_WEIGHT = PLAN.reduce((sum, step) => sum + WEIGHTS[step], 0);

/** How many records each counting part lists, for the panel's "38 of 61". */
const RECORDS: Record<string, number> = {
  prescriptions: 9, 'hospital letters': 2, 'saved documents': 11, 'test results': 96, 'lab histories': 61, visits: 24,
  referrals: 31, approvals: 12, vaccinations: 14, letters: 8, 'doctor inquiries': 17, 'information pages': 4,
};

/** The staged-file keys of the lines finished before `stage`, each with its share of the export's files by weight. */
function filesBefore(stage: number): Record<string, number> {
  const byKey: Record<string, number> = {};
  // The first line orders the file, and writes none of its own.
  for (let i = 1; i < stage; i++) {
    const s = STAGES[i];
    const part = s.parts?.at(-1);
    const { start, end } = stageSpan(i);
    byKey[part ? s.steps.at(-1) + ':' + part : s.steps[0]] = Math.max(1, Math.round((FILES * (end - start)) / 100));
  }
  return byKey;
}

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
  const at = Math.min(parts.length - 1, Math.floor(frac * parts.length));
  const part = parts[at];
  const records = RECORDS[part];
  const detail = part ? LABELS[step] + ': ' + part : undefined;
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
    detail,
    items: records ? { done: Math.floor(clamp01(frac * parts.length - at) * records), total: records } : undefined,
    percent: percentOf(i, frac, 1),
    fileCount: Math.round(u * FILES),
    byteCount: Math.round(u * BYTES),
    filesByKey: filesBefore(currentStage({ next: i, detail })),
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

// Round the edge of the frame, clear of the line in the middle. Made up, like everything here, and the
// same made-up member as the assistant's answers (parts.ts).
const CARDS: Card[] = [
  { kind: 'Test result', title: 'Blood sugar', meta: '14 Feb 2026', glyph: 'test', x: 250, y: 175, turn: -7, scale: 0.95, arrives: 1, leaves: 4 },
  { kind: 'Visit summary', title: 'Family medicine', meta: '2 Mar 2026', glyph: 'visit', pink: true, x: 705, y: 130, turn: 4, scale: 0.8, arrives: 4, leaves: 2 },
  { kind: 'Lab history', title: 'Cholesterol', meta: '2019 – 2026', glyph: 'chart', x: 1215, y: 128, turn: -3, scale: 0.85, arrives: 8, leaves: 3 },
  { kind: 'Prescription', title: 'Three medications', meta: 'Valid until Dec 2026', glyph: 'pill', pink: true, x: 1680, y: 200, turn: 6, scale: 1, arrives: 0, leaves: 6 },
  { kind: 'Referral', title: 'Orthopedics', meta: '28 Jan 2026', glyph: 'referral', x: 190, y: 565, turn: 5, scale: 0.85, arrives: 6, leaves: 8 },
  { kind: 'Vaccination', title: 'Tetanus booster', meta: '3 May 2017', glyph: 'vaccine', x: 1732, y: 590, turn: -5, scale: 0.9, arrives: 3, leaves: 7 },
  { kind: 'Medical file', title: 'Your whole history', meta: 'Full medical file · PDF', glyph: 'file', pink: true, x: 310, y: 930, turn: 3, scale: 1, arrives: 2, leaves: 10 },
  { kind: 'Letter', title: 'From your clinic', meta: '9 Mar 2026', glyph: 'letter', x: 760, y: 962, turn: -4, scale: 0.82, arrives: 9, leaves: 5 },
  { kind: 'Approval', title: 'Physiotherapy', meta: '2 Feb 2026', glyph: 'approval', pink: true, x: 1180, y: 950, turn: 5, scale: 0.9, arrives: 5, leaves: 1 },
  { kind: 'Visit summary', title: 'Pulmonology', meta: '11 Nov 2019', glyph: 'visit', x: 1628, y: 925, turn: -6, scale: 0.95, arrives: 7, leaves: 9 },
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

// ---- icons ----------------------------------------------------------------
const ZIP_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#296bed" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M11 6h1M12 8.5h1M11 11h1M12 13.5h1"/><rect x="10.5" y="16" width="3" height="3" rx=".8"/></svg>';
// Drawn so the triangle's centre of gravity sits on the middle of its box (a triangle centred by its
// box looks pushed left), which is the whole of its optical centring - the circle then just centres it.
const PLAY = '<svg viewBox="0 0 48 48" width="74" height="74"><path d="M18.5 13.5l17 10.5-17 10.5z" fill="#ffffff" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/></svg>';
const POINTER = '<svg viewBox="0 0 24 32" width="30" height="40"><path d="M3 2l17.5 13.2-7.7.7 4.4 9.1-3.6 1.7-4.4-9.2-5.4 5z" fill="#ffffff" stroke="#083f92" stroke-width="1.6" stroke-linejoin="round"/></svg>';
/** A file's icon by its kind, pale on the navy: braces for JSON, a page for everything else. */
function fileIcon(path: string): string {
  const json = path.endsWith('.json');
  const stroke = json ? '#c4e5f8' : '#f1c1cd';
  const d = json
    ? 'M9 4.5c-2.2 0-2.2 1.6-2.2 3v1.8c0 1.3-.8 2.2-2.3 2.2 1.5 0 2.3.9 2.3 2.2v1.8c0 1.4 0 3 2.2 3M15 4.5c2.2 0 2.2 1.6 2.2 3v1.8c0 1.3.8 2.2 2.3 2.2-1.5 0-2.3.9-2.3 2.2v1.8c0 1.4 0 3-2.2 3'
    : 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4';
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="' + stroke +
    '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
}

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

/** A path as the feed shows it: its folders quiet, its own name bright. */
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
  {
    from: T.answer + 0.3, to: T.cards - 0.1, top: 330, title: 'Ask anything about your health', accent: [1],
    text: 'What changed, what stands out, what to do next: answered from your own Maccabi records.',
  },
  { from: T.zoom + 0.9, to: T.runFrom + 0.25, top: 400, step: '3', title: 'Press Start export' },
  { from: T.runFrom + 0.25, to: T.saved + 0.25, top: 118, title: 'It works through your records on its own', chip: 'Sped up · a real export takes 5 to 20 minutes' },
  {
    from: T.saved + 0.25, to: T.open, top: 360, title: 'One ZIP in your Downloads folder', accent: [1],
    text: 'Everything it collected, in one dated file.',
  },
  {
    from: T.open + 0.3, to: T.keep, top: 360, title: 'Your whole history, in one place', accent: [1, 2],
    text: 'Your full medical file, plus every result, visit, prescription, referral, vaccination and letter the site has.',
  },
  {
    from: T.keep, to: T.uses - 0.1, top: 360, title: 'Yours to keep, and to grow', accent: [0],
    text: 'Add to it as you go: a private clinic’s letter, a new result, notes from abroad.',
  },
  {
    from: T.ask + 0.15, to: T.close, top: 330, title: 'A friend who’s read it all', accent: [1],
    text: 'Every answer names the record it came from, so you can check it. You and your doctor decide.',
  },
];

/** The two steps shown over the browser before the camera moves in. */
const STEPS: { from: number; to: number; step: string; text: string }[] = [
  { from: T.browser + 0.6, to: T.clickIcon - 0.05, step: '1', text: 'Log in to Maccabi Online as usual' },
  { from: T.clickIcon - 0.05, to: T.zoom + 0.55, step: '2', text: 'Click the extension’s icon' },
];

/** What a member can ask, as the pill tabs of part 6 name it (docs/positioning.md's Ask use cases), and the example of each. */
const USES: { tab: string; q?: string; a?: string }[] = [
  { tab: 'What stands out?' },
  { tab: 'One thing today' },
  { tab: 'Preventive care', q: 'What might I be due for?', a: 'A tetanus booster: your last one was in May 2017.' },
  { tab: 'Explain a result', q: 'What changed in my latest blood test?', a: 'One value newly above the range, one back to normal, the rest steady since 2021.' },
  { tab: 'Before an appointment', q: 'What should I raise with my doctor on Thursday?', a: 'Three questions, and a one-page summary of your history for a new specialist.' },
  { tab: 'From years ago' },
];
/** The tabs part 6 opens in turn: the ones the opening and the end don't already answer. */
const USE_TABS = USES.flatMap((u, i) => (u.q ? [i] : []));
const USE_EVERY = 1.15;
/** When tab `i` (of USES) comes up. */
const useAt = (i: number): number => T.uses + 1.3 + USE_TABS.indexOf(i) * USE_EVERY;

/**
 * What the narrator says, and when each line starts. scripts/soundtrack.mjs has each line spoken
 * (ElevenLabs), places it at its second and fails the render if one runs into the next, so a line
 * that grows has to be cut or given room here. Numbers are spelled out, as they are to be said.
 */
const NARRATION: { at: number; text: string }[] = [
  { at: T.answer + 0.6, text: 'Ask anything about your health, and get answers from your own records.' },
  { at: T.hookLine, text: 'Maccabi Online shows your records one page at a time.' },
  { at: T.title + 0.3, text: 'Your whole history, and a genius friend who’s read all of it.' },
  { at: T.browser + 0.9, text: 'Log in as usual, click the icon, and press Start export.' },
  { at: T.runFrom + 0.5, text: 'It goes through every section on its own, and collects everything the site has.' },
  { at: T.runFrom + 6.9, text: 'Sped up here. The real thing takes five to twenty minutes.' },
  { at: T.saved + 0.3, text: 'When it’s done, one dated ZIP lands in your Downloads folder.' },
  { at: T.open + 0.85, text: 'Everything in one place, your full medical file included.' },
  { at: T.keep + 0.3, text: 'It’s yours to keep, and to add to as you go.' },
  { at: T.uses + 0.4, text: 'Open it in the Claude or ChatGPT desktop app, and ask anything.' },
  { at: T.ask + 0.4, text: 'Every answer names its source. You and your doctor decide.' },
  { at: T.close + 0.4, text: 'Health Records Export for Maccabi. Free, on the Chrome Web Store.' },
];

/** The sound effects, by kind (scripts/soundtrack.mjs draws each one) and second. */
const SOUNDS: { at: number; kind: string; dur?: number }[] = [
  { at: T.answer + 1.5, kind: 'pop' },
  { at: T.answer + 3.0, kind: 'pop' },
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
  { at: T.keep + 0.75, kind: 'pop' },
  { at: T.uses - 0.3, kind: 'whoosh', dur: 0.9 },
  ...USE_TABS.map((u) => ({ at: useAt(u), kind: 'pop' })),
  { at: T.ask - 0.3, kind: 'whoosh', dur: 0.9 },
  { at: T.ask + 1.5, kind: 'pop' },
  { at: T.ask + 3.0, kind: 'pop' },
  { at: T.close + 0.1, kind: 'shimmer' },
  // A tick for each file that lands in the list, once the list is there to see it land.
  ...FEED.filter((f) => f.at >= T.runFrom + 0.5 && f.at < T.saved).map((f) => ({ at: f.at, kind: 'tick' })),
].sort((a, b) => a.at - b.at);

// ---- the film ----------------------------------------------------------------
async function main(): Promise<void> {
  document.body.className = 'video';

  // The ground: the marquee's glows, drifting, over a faint dot grid.
  const grid = h('div', 'grid');
  const glows = [0, 1, 2].map(() => h('div', 'glow'));
  document.body.append(grid, ...glows);

  // 0 · what it is for: the assistant, saying what stands out in the export
  const openChat = chatWindow(STANDS_OUT);

  // 1 · years of records, as the site shows them
  const cards = CARDS.map(recordCard);
  const hookLine = kinetic('h1', 'hook-line', 'One page at a time.');
  const hook = h('div', 'layer', ...cards, hookLine.el);

  // 2 · the name and the headline
  const art = artwork();
  const lockName = h('p', 'lock-name', 'Health Records Export for Maccabi');
  const promise = kinetic('h1', 'lock-title', 'Your whole Maccabi history,\nand a genius friend who’s read all of it', [6, 7]);
  const lockSub = h('p', 'lock-sub', 'Save everything from Maccabi Online to your computer, then ask anything: what changed, what stands out, what to do next.');
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

  // 5 · the ZIP, opened: the popup's file card grows into its window, and the member adds to it.
  const { readme, medical, added: addedRow, folders: folderRows } = exportRows();
  const added = h('div', 'added-slot', addedRow);
  const filesInner = h('div', 'files-inner',
    h('div', 'toolbar', dots(), h('div', 'files-title', 'maccabi-export-2026-09-17')),
    h('div', 'files-list', readme, medical, ...folderRows),
  );
  filesInner.querySelector('.files-list')?.insertBefore(added, medical.nextSibling);
  const ghost = h('div', 'ghost', svg(ZIP_ICON, 'zip'), h('div', '', h('strong', '', ZIP), h('span', '', '486 files · 38 MB')));
  const files = h('div', 'files-win', filesInner, ghost);
  const fileRowsAll = [readme, medical, ...folderRows];

  // 6 · what to ask: the use cases as pill tabs over a soft panel, a few of them opened in turn
  const usesTitle = kinetic('h2', 'uses-title', 'Ask anything', [1]);
  const usesSub = h('p', 'uses-sub', 'Open the folder in the Claude or ChatGPT desktop app.');
  const tabs = USES.map((u) => h('span', 'tab', u.tab));
  const useCards = USE_TABS.map((i) => h('div', 'use', h('p', 'use-q', '“' + USES[i].q + '”'), h('p', 'use-a', USES[i].a)));
  const usesPanel = h('div', 'uses-panel', ...useCards);
  const uses = h('div', 'layer', usesTitle.el, usesSub, h('div', 'tabs', ...tabs), usesPanel);

  // 7 · the assistant, asked again, and naming its source
  const chat = chatWindow(ONE_THING);

  // 8 · where to get it
  const endArt = artwork();
  const endName = kinetic('h1', 'end-title', 'Health Records Export for Maccabi');
  // The one line on privacy, beside where to get it (docs/positioning.md: say it once, lightly).
  const endSub = h('p', 'end-sub', 'Free on the Chrome Web Store  ·  Stays on your computer');
  const endLink = h('p', 'end-link', 'github.com/RoniRachmani/health-records-export-for-maccabi');
  const endNote = h('p', 'disclaimer', DISCLAIMER);
  const ending = h('div', 'layer', endName.el, endSub, endLink, endNote);

  const scrim = h('div', 'scrim');
  document.body.append(openChat.el, hook, art.el, lockup, world, ...steps, ...captions.map((c) => c.el), feed, files, uses, chat.el, endArt.el, ending, scrim);

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

  /**
   * The camera: which world point is at the middle of the frame, and how close it is. It holds
   * still on either side of its one move: text under a camera that keeps creeping is redrawn at a
   * slightly different size every frame, and reads as shivering rather than as a move.
   */
  const camAt = (t: number): { x: number; y: number; s: number } => {
    const wide = { s: 1, x: 960, y: 540 };
    // Closed in, the popup's top right corner sits at the same point of the frame throughout.
    const close = { s: CLOSE, x: anchor.x - (1800 - 960) / CLOSE, y: anchor.y + (540 - 104) / CLOSE };
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

  /** Where the assistant's window sits in parts 0 and 7, and its scale. */
  const CHAT = { x: 910, y: 137, s: 1.3 };

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

  /** The assistant's window between `from` and `to`: in, the question sent, the answer a line at a time, out. */
  function playChat(c: Chat, t: number, from: number, to: number): void {
    const chatIn = ramp(t, from + 0.5, 0.9, outQuint);
    const chatOut = ramp(t, to - 0.45, 0.45, inOut);
    fade(c.el, t >= from && t < to ? Math.min(ramp(t, from + 0.5, 0.4), 1 - chatOut) : 0);
    place(c.el, CHAT.x, CHAT.y + 60 * (1 - chatIn) - 40 * chatOut, CHAT.s);
    const lift = (el: HTMLElement, at: number, dy = 14): void => {
      const u = ramp(t, at, 0.55, outQuint);
      el.style.opacity = u.toFixed(3);
      el.style.transform = 'translate(0,' + ((1 - u) * dy).toFixed(1) + 'px)';
    };
    lift(c.el.querySelector('.chat-note') as HTMLElement, from + 1.0);
    // The question pops in from its corner, as a sent message does; the answer follows, a line at a time.
    const asked = ramp(t, from + 1.5, 0.5, outBack);
    c.question.style.opacity = clamp01(asked * 2).toFixed(3);
    c.question.style.transformOrigin = 'bottom right';
    c.question.style.transform = 'scale(' + lerp(0.7, 1, asked).toFixed(4) + ')';
    lift(c.el.querySelector('.avatar') as HTMLElement, from + 2.0, 0);
    c.answer.forEach((el, i) => lift(el, from + 2.1 + i * 0.45));
    c.chips.forEach((el, i) => lift(el, from + 3.4 + i * 0.1, 10));
  }

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
      // In, and then still until the folder takes it: a card left drifting, growing or tilting by
      // fractions of a pixel reads as its text shivering, not as life.
      const inU = ramp(t, T.cards + c.arrives * 0.09, 1.0, outQuint);
      let x = c.x + dir.x * 820 * (1 - inU);
      let y = c.y + dir.y * 820 * (1 - inU);
      let turn = c.turn + dir.x * 26 * (1 - inU);
      let s = c.scale;
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
    ripple.style.transform = 'translate(' + path.x.toFixed(1) + 'px,' + path.y.toFixed(1) + 'px) scale(' + (0.4 + 0.9 * (1 - ring)).toFixed(3) + ')';

    // Start export under the pointer: hovered, then pressed.
    const startButton = doc.querySelector<HTMLElement>('#view button.primary');
    if (startButton && !run) {
      const pressed = t >= T.clickStart && t < T.clickStart + 0.16;
      const hovered = t >= T.zoom + 1.85 && t < T.runFrom;
      startButton.style.background = hovered ? '#1f5bd6' : '';
      startButton.style.borderColor = hovered ? '#1f5bd6' : '';
      startButton.style.transform = pressed ? 'scale(0.975)' : '';
    }

    // The popup's own animations (the sheen on the bar, the pulse on the current step) run on the
    // wall clock, which has nothing to do with the film's: each frame would catch them at a random
    // point, and the bar would flicker. They run on the film's clock instead, and its transitions
    // land at once, since the states pushed in already move a frame at a time. Last, after every
    // change made to the popup this frame, so none is caught halfway.
    for (const a of doc.getAnimations()) {
      if ('transitionProperty' in a) {
        a.finish();
      } else {
        a.pause();
        a.currentTime = t * 1000;
      }
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
        el.style.transform = 'translate(0,' + ((1 - u) * 16).toFixed(1) + 'px)';
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
    const filesOut = ramp(t, T.uses - 0.5, 0.5, inCubic);
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
      row.style.transform = 'translate(0,' + ((1 - u) * 14).toFixed(1) + 'px)';
    });
    // A file of the member's own, dropped in under the medical file: the list makes room, and it lands.
    const room = ramp(t, T.keep + 0.3, 0.5, inOut);
    added.style.height = (room * addedRow.offsetHeight).toFixed(1) + 'px';
    const land = ramp(t, T.keep + 0.45, 0.6, outBack);
    addedRow.style.opacity = clamp01(land * 2).toFixed(3);
    addedRow.style.transform = 'translate(' + ((1 - land) * 120).toFixed(1) + 'px,0) rotate(' + ((1 - land) * 2.5).toFixed(2) + 'deg)';
    addedRow.style.setProperty('--hl', ramp(t, T.keep + 0.6, 0.4).toFixed(3));

    // ---- 6 · what to ask ----
    const usesOut = ramp(t, T.ask - 0.45, 0.45, inOut);
    fade(uses, t >= T.uses && t < T.ask ? 1 - usesOut : 0);
    place(uses, 0, -40 * usesOut);
    rise(usesTitle.words, t, T.uses + 0.25, 0.08);
    fade(usesSub, ramp(t, T.uses + 0.6, 0.5));
    place(usesSub, 0, 16 * (1 - ramp(t, T.uses + 0.6, 0.7, outQuint)));
    tabs.forEach((tab, i) => {
      const u = ramp(t, T.uses + 0.7 + i * 0.06, 0.5, outBack);
      tab.style.opacity = clamp01(u * 2).toFixed(3);
      tab.style.transform = 'scale(' + lerp(0.7, 1, u).toFixed(4) + ')';
      // The open tab fills with the panel's pink, and gives way when the next one opens.
      const k = USE_TABS.indexOf(i);
      const on = k < 0 ? 0 : ramp(t, useAt(i), 0.25) * (k === USE_TABS.length - 1 ? 1 : 1 - ramp(t, useAt(i) + USE_EVERY, 0.25));
      tab.style.setProperty('--on', on.toFixed(3));
    });
    const panelIn = ramp(t, T.uses + 0.9, 0.7, outQuint);
    fade(usesPanel, ramp(t, T.uses + 0.9, 0.35));
    place(usesPanel, 0, 40 * (1 - panelIn));
    // One question at a time: each is gone before the next comes up, never the two read over each other.
    useCards.forEach((el, k) => {
      const at = useAt(USE_TABS[k]);
      const u = ramp(t, at + 0.05, 0.5, outQuint);
      const gone = k === USE_TABS.length - 1 ? 0 : ramp(t, at + USE_EVERY - 0.2, 0.2, inOut);
      fade(el, Math.min(ramp(t, at + 0.05, 0.25), 1 - gone));
      place(el, 0, 24 * (1 - u) - 24 * gone);
    });

    // ---- 0 and 7 · the assistant, asked ----
    playChat(openChat, t, T.answer, T.cards);
    playChat(chat, t, T.ask, T.close);

    // ---- 8 · where to get it ----
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
