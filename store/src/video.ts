/* The Chrome Web Store promo video, drawn one frame at a time: scripts/store-video.mjs asks for
   frame n, this page puts the whole stage where it should be at n/FPS seconds, and the script
   photographs it. Nothing animates by itself — every position is a function of time — so the
   render is the same on every machine, however long a frame takes to capture.

   The export it shows is the real popup (mock-chrome.ts gives it a made-up state, never real data)
   driven through a whole run: the states pushed into it are built from the real PLAN and WEIGHTS,
   so the bar, the step names and the section list move as they do in an export. */
import '@fontsource-variable/heebo';
import { DESCRIPTIONS } from '../../src/extension/popup/model';
import { LABELS, PLAN, WEIGHTS, percentOf, type RunState } from '../../src/extension/shared/state';
import { CHECK, LOCK, MARK, dots, fileRows, h, img, pageSkeleton, paper, svg } from './parts';

const FPS = 30;

/** When each part of the film starts, in seconds. The last one is the end. */
const T = {
  title: 0,
  /** The window arrives and the pointer does the two clicks. */
  start: 4,
  clickIcon: 6.05,
  popupIn: 6.15,
  reachButton: 7.9,
  clickStart: 8.35,
  /** The export runs, from 0 to 100 per cent. */
  runFrom: 8.6,
  runTo: 23.4,
  saved: 23.9,
  contents: 30,
  privacy: 38,
  close: 44,
  end: 49,
};

/** The second the README's poster is taken from: the export running, which is what the film is about. */
const POSTER_AT = 15.5;

// What a long-standing member's export comes to, the same numbers the store images show.
const FILES = 486;
const BYTES = 38_400_000;
const ZIP = 'maccabi-export-2026-09-17.zip';

const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

/** 0 before `from`, 1 after `from + dur`, eased at both ends. */
function ramp(t: number, from: number, dur: number): number {
  const u = clamp01((t - from) / dur);
  return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
}

/** 1 while something is on screen, fading in at `from` and out again by `to`. */
function showing(t: number, from: number, to: number, fade = 0.45): number {
  return Math.min(ramp(t, from, fade), 1 - ramp(t, to - fade, fade));
}

/** Fades an element in while it rises the last few pixels into place. */
function rise(el: HTMLElement, u: number, dy = 30): void {
  el.style.opacity = u.toFixed(3);
  el.style.transform = 'translate3d(0,' + ((1 - u) * dy).toFixed(2) + 'px,0)';
}

/** A ring or ripple: 1 at `when`, gone `dur` later. */
function pulse(t: number, when: number, dur = 0.5): number {
  return t < when ? 0 : 1 - clamp01((t - when) / dur);
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

interface Point {
  x: number;
  y: number;
}
const between = (a: Point, b: Point, u: number): Point => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });

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

// ---- the stage ----------------------------------------------------------
const ZIP_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#296bed" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><rect x="10.5" y="15" width="3" height="3" rx=".8"/></svg>';
// Drawn so the triangle's centre of gravity sits on the middle of its box (a triangle centred by its
// box looks pushed left), which is the whole of its optical centring - the circle then just centres it.
const PLAY = '<svg viewBox="0 0 48 48" width="74" height="74"><path d="M18.5 13.5l17 10.5-17 10.5z" fill="#ffffff" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/></svg>';
const POINTER = '<svg viewBox="0 0 24 32" width="30" height="40"><path d="M3 2l17.5 13.2-7.7.7 4.4 9.1-3.6 1.7-4.4-9.2-5.4 5z" fill="#ffffff" stroke="#083f92" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** The mark over its two tilted documents, as on the promo tiles. */
function artwork(width: number): HTMLElement {
  return svg(`<svg viewBox="0 0 540 440" width="${width}" height="${Math.round((width * 440) / 540)}">
    <g transform="translate(270 220)">
      <g transform="rotate(-14) translate(-186 -134) scale(1.6)">${paper(0.3)}</g>
      <g transform="rotate(12) translate(28 -134) scale(1.6)">${paper(0.5)}</g>
      <g transform="translate(-138 -144) scale(11.5)">${MARK}</g>
    </g>
  </svg>`, 'art');
}

function eyebrow(): HTMLElement {
  return h('div', 'eyebrow', img('/icons/icon-128.png'), 'Health Records Export for Maccabi');
}

const DISCLAIMER = 'Unofficial. Not affiliated with, endorsed by or sponsored by Maccabi Healthcare Services.';

/** What is said beside the window, one caption per part of the run. */
const CAPTIONS: { from: number; to: number; title: string; text: string; chip?: string }[] = [
  {
    from: T.start + 0.5, to: 9,
    title: 'Two clicks to start',
    text: 'Log in to Maccabi Online as usual. On that tab, click the extension’s icon and press Start export.',
  },
  {
    from: 9, to: 24.2,
    title: 'It works through your records on its own',
    text: 'Test results, visits, prescriptions, referrals, vaccinations, letters and your full medical file — every PDF the site offers, plus the site’s own data as JSON.',
    chip: 'Sped up · a real export takes 5 to 20 minutes',
  },
  {
    from: 24.2, to: T.contents + 0.2,
    title: 'One file in your Downloads folder',
    text: 'One dated ZIP, and the extension then deletes its own copy. The popup lists anything that could not be exported.',
  },
  {
    from: T.contents + 0.2, to: T.privacy,
    title: 'Every record, every PDF',
    text: 'One folder per part of Maccabi Online, your full medical file on top, and a README that explains what each folder holds.',
  },
];

const PRIVACY = [
  'No servers, analytics or tracking',
  'Talks only to online.maccabi4u.co.il',
  'Never sees your password or one-time codes',
  'Open source, and what ships is not minified',
];

function slate(...children: HTMLElement[]): HTMLElement {
  return h('div', 'scene', h('div', 'slate', ...children));
}

async function popupFrame(parent: HTMLElement): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe');
  frame.className = 'popup';
  const loaded = new Promise((r) => (frame.onload = r));
  frame.src = '/src/extension/popup/popup.html?state=ready';
  parent.append(frame);
  await loaded;
  const doc = frame.contentDocument as Document;
  for (let i = 0; i < 200 && !doc.querySelector('#view > :not(.loading)'); i++) await new Promise((r) => setTimeout(r, 25));
  await doc.fonts.ready;
  return frame;
}

async function main(): Promise<void> {
  document.body.className = 'video';

  // ---- the opening and closing cards ----
  const title = slate(
    artwork(400),
    h('h1', '', 'Your Maccabi records in one ZIP'),
    h('p', 'sub', 'Tests, visits, prescriptions, referrals, vaccinations, letters and your full medical file — saved to your own computer.'),
    h('p', 'disclaimer', DISCLAIMER),
  );
  const privacy = h('div', 'scene',
    h('div', 'privacy',
      h('h2', '', 'Private by design'),
      h('ul', '', ...PRIVACY.map((p) => h('li', '', svg(CHECK, 'check'), h('span', '', p)))),
    ),
  );
  const close = slate(
    artwork(300),
    eyebrow(),
    h('p', 'sub', 'Free and open source. Your records go from Maccabi Online straight to a file on your computer.'),
    h('p', 'link', 'github.com/RoniRachmani/health-records-export-for-maccabi'),
    h('p', 'disclaimer', DISCLAIMER),
  );

  // ---- the words beside the window ----
  const captions = CAPTIONS.map((c) => h('section', 'caption',
    eyebrow(),
    h('h2', '', c.title),
    h('p', '', c.text),
    c.chip ? h('span', 'chip', c.chip) : null,
  ));

  // ---- the window: the browser for the run, the ZIP's folders after it ----
  const badge = h('span', 'badge');
  const ext = h('span', 'ext', img('/icons/icon-32.png'), badge);
  const download = h('div', 'download',
    svg(ZIP_ICON, 'zip'),
    h('div', '', h('strong', '', ZIP), h('span', '', '38 MB · Done')),
  );
  const browser = h('div', 'window browser',
    h('div', 'toolbar', dots(), h('div', 'address', svg(LOCK), h('span', '', 'online.maccabi4u.co.il')), ext),
    pageSkeleton(4),
    download,
  );
  const files = h('div', 'window files',
    h('div', 'toolbar', dots(), h('div', 'files-title', 'maccabi-export-2026-09-17')),
    h('div', 'files-list', ...fileRows()),
  );
  const cursor = h('span', 'cursor', svg(POINTER));
  const ripple = h('span', 'ripple');

  document.body.append(title, ...captions, browser, files, privacy, close, ripple, cursor);
  const rows = Array.from(files.querySelectorAll<HTMLElement>('.file-row'));

  // ---- the real popup, in the browser window ----
  const frame = await popupFrame(browser);
  const doc = frame.contentDocument as Document;
  const push = (run: RunState | null): void => (frame.contentWindow as unknown as { demoRun: (r: RunState | null) => void }).demoRun(run);
  // How tall the popup's content is; the iframe's own height doesn't come into it, because the
  // popup's body is only as tall as what is in it.
  const popupHeight = (): number => Math.ceil(doc.body.getBoundingClientRect().height);
  const heightOf = async (run: RunState | null): Promise<number> => {
    push(run);
    await new Promise((r) => setTimeout(r, 40));
    return popupHeight();
  };
  // One scale for the whole film — the popup must not change size under the viewer — chosen so
  // that its tallest view still fits in the window. Its height does follow the view, as a real
  // popup's does, and it is anchored under the toolbar, so only its bottom edge moves.
  const tallest = Math.max(await heightOf(null), await heightOf(runAt(0.45)), await heightOf(doneRun()));
  push(null);
  await new Promise((r) => setTimeout(r, 60));
  const room = browser.clientHeight - frame.offsetTop - 18;
  const scale = Math.min(1.55, room / tallest);
  frame.style.transform = 'scale(' + scale + ')';

  /** A point inside the popup, in the stage's own coordinates. */
  const inPopup = (el: Element): Point => {
    const r = el.getBoundingClientRect();
    const f = frame.getBoundingClientRect(); // scaled about its top right corner, which stays put
    return {
      x: f.right - (frame.clientWidth - (r.left + r.width / 2)) * scale,
      y: f.top + (r.top + r.height / 2) * scale,
    };
  };
  const startButton = doc.querySelector('#view button.primary') as HTMLElement;
  const onButton = inPopup(startButton);
  const extRect = ext.getBoundingClientRect();
  const onIcon = { x: extRect.left + extRect.width / 2, y: extRect.top + extRect.height / 2 };
  const offStage = { x: 1840, y: 1120 };

  // ---- where everything is, at time t ----
  let pushed = '';
  let shown = 0;
  function applyAt(t: number): void {
    rise(title, showing(t, T.title, T.start, 0.5) * ramp(t, T.title, 0.7), 26);
    privacy.style.opacity = showing(t, T.privacy, T.close, 0.5).toFixed(3);
    PRIVACY.forEach((_, i) => {
      const li = privacy.querySelectorAll<HTMLElement>('li')[i];
      rise(li, ramp(t, T.privacy + 0.5 + i * 0.35, 0.5), 22);
    });
    close.style.opacity = showing(t, T.close, T.end + 1, 0.5).toFixed(3);

    captions.forEach((el, i) => rise(el, showing(t, CAPTIONS[i].from, CAPTIONS[i].to), 24));

    // The browser window arrives once and stays until the ZIP's folders take its place.
    const inView = showing(t, T.start, T.contents + 0.35, 0.5);
    browser.style.opacity = inView.toFixed(3);
    browser.style.transform = 'translate3d(0,' + ((1 - ramp(t, T.start, 0.6)) * 46).toFixed(2) + 'px,0)';
    files.style.opacity = showing(t, T.contents, T.privacy, 0.5).toFixed(3);
    rows.forEach((row, i) => rise(row, ramp(t, T.contents + 0.35 + i * 0.055, 0.45), 14));

    // The export itself: one state per frame, exactly as the background writes them.
    const u = clamp01((t - T.runFrom) / (T.runTo - T.runFrom));
    const run = t < T.runFrom ? null : t < T.saved ? runAt(u) : doneRun();
    const key = run ? run.status + run.percent.toFixed(2) + run.fileCount : 'idle';
    if (key !== pushed) {
      pushed = key;
      push(run);
      const tall = popupHeight();
      if (tall !== shown) {
        shown = tall;
        frame.style.height = tall + 'px';
      }
    }
    frame.style.opacity = ramp(t, T.popupIn, 0.35).toFixed(3);
    frame.style.transform = 'scale(' + (scale * lerp(0.94, 1, ramp(t, T.popupIn, 0.4))) + ')';

    // The toolbar badge, as src/extension/background/ui.ts sets it.
    badge.textContent = run ? (run.status === 'done' ? '✓' : run.percent + '%') : '';
    badge.style.background = run?.status === 'done' ? '#1a7a48' : '#296bed';
    badge.style.opacity = run ? '1' : '0';
    ext.style.setProperty('--ring-o', (pulse(t, T.clickIcon) * 0.9).toFixed(3));
    ext.style.setProperty('--ring-s', String(1 + 0.5 * (1 - pulse(t, T.clickIcon))));

    download.style.opacity = showing(t, T.saved + 0.5, T.contents, 0.4).toFixed(3);
    download.style.transform = 'translate3d(0,' + ((1 - ramp(t, T.saved + 0.5, 0.45)) * 24).toFixed(2) + 'px,0)';

    // The pointer: in, to the icon, to Start export, and away.
    const path = t < T.start + 0.8 ? offStage
      : t < T.clickIcon ? between(offStage, onIcon, ramp(t, T.start + 0.8, 1.1))
      : t < T.reachButton ? between(onIcon, onButton, ramp(t, T.clickIcon + 0.75, 1.0))
      : between(onButton, offStage, ramp(t, T.clickStart + 0.3, 1.2));
    cursor.style.transform = 'translate3d(' + path.x.toFixed(1) + 'px,' + path.y.toFixed(1) + 'px,0)';
    // Gone before the export starts, so nothing hovers over the progress.
    cursor.style.opacity = Math.min(ramp(t, T.start + 0.8, 0.3), 1 - ramp(t, T.clickStart + 0.3, 0.4)).toFixed(3);
    const ring = Math.max(pulse(t, T.clickIcon), pulse(t, T.clickStart));
    ripple.style.opacity = (ring * 0.55).toFixed(3);
    ripple.style.transform = 'translate3d(' + path.x.toFixed(1) + 'px,' + path.y.toFixed(1) + 'px,0) scale(' + (0.4 + 0.9 * (1 - ring)) + ')';

    // Start export under the pointer: hovered, then pressed.
    const pressed = t >= T.clickStart && t < T.clickStart + 0.16;
    const hovered = t >= T.reachButton - 0.15 && t < T.runFrom;
    startButton.style.background = hovered ? '#1f5bd6' : '';
    startButton.style.borderColor = hovered ? '#1f5bd6' : '';
    startButton.style.transform = pressed ? 'scale(0.975)' : '';
  }

  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => undefined)));

  (window as unknown as { video: unknown }).video = {
    fps: FPS,
    frames: Math.round(T.end * FPS),
    /** Puts the stage where it belongs at this frame, and waits until it is drawn. */
    async at(n: number): Promise<void> {
      applyAt(n / FPS);
      await new Promise((r) => setTimeout(r, 0));
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
    applyAt(poster === '' ? POSTER_AT : Number(poster));
    document.body.append(h('div', 'scrim'), h('div', 'play', svg(PLAY)));
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => {
  document.documentElement.dataset.ready = 'error: ' + (e instanceof Error ? e.message : String(e));
});
