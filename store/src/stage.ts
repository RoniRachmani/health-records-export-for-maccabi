/* Store images: one layout per image (?shot=...), built around the real popup, which runs in an
   iframe with a made-up state (mock-chrome.ts), an AI assistant opened on the export, or the export's folder. The page sets
   <html data-ready="1"> when it has finished rendering, for scripts/store-assets.mjs. */
import '@fontsource-variable/heebo';
import {
  BUILDS, CHECK, FOLDER, LOCK, MARK, ONE_THING, STANDS_OUT, chatWindow, dots, exportRows, h, img, pageSkeleton, paper, svg,
  type Exchange,
} from './parts';

/** What the window beside the copy shows. */
type View =
  /** The real popup in a browser window, in this state (mock-chrome.ts). */
  | { popup: string; badge?: Badge }
  /** An AI assistant opened on the export, answering, with these questions under the answer. */
  | { chat: Exchange; chips?: string[] }
  /** The unzipped export, with a file of the member's own added to it. */
  | { folder: true };

/** Toolbar badge, as the background sets it (src/extension/background/ui.ts). */
interface Badge {
  text: string;
  color: string;
  textColor?: string;
}

interface Shot {
  title: string;
  text: string;
  points: string[];
  view: View;
}

// docs/positioning.md, in its order: what the member gets (the whole history, a friend who has read it, theirs to
// keep), then how they get it. Privacy and price are conditions, said once and lightly, on the shot that starts it.
const SHOTS: Record<string, Shot> = {
  ask: {
    title: 'Your whole Maccabi history, and a genius friend who’s read all of it',
    text: 'Save everything from Maccabi Online to your computer, then ask anything: what changed, what stands out, what to do next.',
    points: [
      'Every answer names the record it came from, so you can check it',
      'Answers in plain English, from records written in Hebrew',
    ],
    view: { chat: STANDS_OUT },
  },
  whole: {
    title: 'Everything, in one place',
    text: 'Your full medical file, plus every result, visit, prescription, referral, vaccination and letter the site has.',
    points: [
      'The medical file for the widest range Maccabi allows',
      'Every PDF the site offers, with its data beside it',
      'Saved on your computer, to keep, share or add to',
    ],
    view: { folder: true },
  },
  advice: {
    title: 'Advice about you, not an average person',
    text: 'Small, doable steps tied to your own numbers, and plans built around what’s in your file.',
    points: [
      'Walk into appointments prepared',
      'Catch what’s due before it’s overdue',
      'It advises; you and your doctor decide',
    ],
    view: { chat: ONE_THING, chips: BUILDS },
  },
  start: {
    title: 'Log in and press Start export',
    text: 'On Maccabi Online, click the extension’s icon. It works through every section on its own.',
    points: [
      'Keep the Maccabi Online tab open and in front',
      'Session timed out? Log in again and press Resume',
      'Free, and your records stay on your computer',
    ],
    view: { popup: 'ready' },
  },
  open: {
    title: 'Then open it in Claude or ChatGPT',
    text: 'Use the desktop app, which reads the whole folder: a chat takes a few dozen files, and your export has hundreds.',
    points: [
      'Claude: choose Project or folder, under the message box',
      'ChatGPT: switch to Work, then Choose project',
      'Start with “Read README.md first. Then summarize my health history from my full medical file.”',
    ],
    view: { popup: 'done', badge: { text: '✓', color: '#1a7a48' } },
  },
};

function copy(shot: Shot): HTMLElement {
  return h('section', 'copy',
    h('div', 'eyebrow', img('/icons/icon-32.png'), 'Health Records Export for Maccabi'),
    h('h1', '', shot.title),
    h('p', 'lead', shot.text),
    h('ul', '', ...shot.points.map((p) => h('li', '', svg(CHECK, 'check'), h('span', '', p)))),
    h('p', 'disclaimer', 'Unofficial. Not affiliated with Maccabi Healthcare Services.'),
  );
}

async function popupFrame(state: string, parent: HTMLElement): Promise<void> {
  const frame = document.createElement('iframe');
  frame.className = 'popup';
  const loaded = new Promise((r) => (frame.onload = r));
  frame.src = '/src/extension/popup/popup.html?state=' + state;
  parent.append(frame);
  await loaded;
  const doc = frame.contentDocument as Document;
  for (let i = 0; i < 200 && !doc.querySelector('#view > :not(.loading)'); i++) await new Promise((r) => setTimeout(r, 25));
  await doc.fonts.ready;
  // The popup sets its own width; scale it down if it would not fit in the window.
  frame.style.width = doc.body.offsetWidth + 'px';
  const height = doc.documentElement.scrollHeight;
  frame.style.height = height + 'px';
  const room = parent.clientHeight - frame.offsetTop - 12;
  frame.style.transform = 'scale(' + Math.min(1.3, room / height) + ')';
}

async function browserWindow(state: string, badge?: Badge): Promise<HTMLElement> {
  const ext = h('span', 'ext', img('/icons/icon-32.png'));
  if (badge) {
    const b = h('span', 'badge', badge.text);
    b.style.background = badge.color;
    if (badge.textColor) b.style.color = badge.textColor;
    ext.append(b);
  }
  const win = h('div', 'window browser',
    h('div', 'toolbar', dots(), h('div', 'address', svg(LOCK), h('span', '', 'online.maccabi4u.co.il')), ext),
    pageSkeleton(),
  );
  document.body.append(win); // the popup frame loads only once attached
  await popupFrame(state, win);
  return win;
}

/** The unzipped export, as a file manager shows it, with the member's own file just added. */
function folderWindow(): HTMLElement {
  const { readme, medical, added, folders } = exportRows();
  return h('div', 'window files',
    h('div', 'toolbar', dots(), h('div', 'files-title', svg(FOLDER, 'folder'), h('span', '', 'maccabi-export-2026-09-17'))),
    h('div', 'files-list', readme, medical, added, ...folders),
  );
}

function promo(): HTMLElement {
  // The icon's folder, over two documents; no text, as the store asks.
  return svg(`<svg viewBox="0 0 440 280" width="440" height="280">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#296bed"/><stop offset="1" stop-color="#083f92"/></linearGradient></defs>
    <rect width="440" height="280" fill="url(#bg)"/>
    <circle cx="70" cy="240" r="120" fill="#ffffff" opacity="0.06"/>
    <circle cx="400" cy="30" r="90" fill="#ffffff" opacity="0.07"/>
    <g transform="translate(220 144)">
      <g transform="rotate(-14) translate(-118 -84)">${paper(0.35)}</g>
      <g transform="rotate(12) translate(18 -84)">${paper(0.55)}</g>
      <g transform="translate(-90 -94) scale(7.5)">${MARK}</g>
    </g>
  </svg>`, 'promo');
}

// The marquee tile (1400x560): the same artwork, larger, beside the extension's name and its
// one line. The store crops the right of this image on narrow screens, so the text stays left.
function marquee(): HTMLElement {
  return h('div', 'mq',
    h('section', 'mq-copy',
      h('div', 'eyebrow', img('/icons/icon-128.png'), 'Health Records Export for Maccabi'),
      h('h1', '', 'Ask an AI assistant about your Maccabi health records'),
      h('p', 'lead', 'Save your tests, visits, prescriptions, letters and full medical file as one ZIP on your computer. Open it in the assistant you choose, and ask in your own language.'),
      h('p', 'disclaimer', 'Unofficial. Not affiliated with Maccabi Healthcare Services.'),
    ),
    svg(`<svg viewBox="0 0 540 440" width="540" height="440">
      <g transform="translate(270 220)">
        <g transform="rotate(-14) translate(-186 -134) scale(1.6)">${paper(0.3)}</g>
        <g transform="rotate(12) translate(28 -134) scale(1.6)">${paper(0.5)}</g>
        <g transform="translate(-138 -144) scale(11.5)">${MARK}</g>
      </g>
    </svg>`, 'mq-art'),
  );
}

// The link preview of the published AI assistant page (1200x630, not a store field): the marquee's artwork and line,
// centred, because WhatsApp and others crop previews to a narrower box, or a square, around the middle. The page's
// own title is printed under it by the app showing the preview, so the picture says the rest. The `social` shot is
// the same picture at GitHub's 1280x640, for the repository's social preview (uploaded by hand in its settings).
function og(): HTMLElement {
  return h('div', 'og',
    svg(`<svg viewBox="0 0 540 440" width="290" height="236">
      <g transform="translate(270 220)">
        <g transform="rotate(-14) translate(-186 -134) scale(1.6)">${paper(0.3)}</g>
        <g transform="rotate(12) translate(28 -134) scale(1.6)">${paper(0.5)}</g>
        <g transform="translate(-138 -144) scale(11.5)">${MARK}</g>
      </g>
    </svg>`, 'og-art'),
    h('h1', '', 'Ask an AI assistant about your Maccabi health records'),
    h('div', 'eyebrow', img('/icons/icon-128.png'), 'Health Records Export for Maccabi · Unofficial'),
  );
}

async function main(): Promise<void> {
  const name = new URLSearchParams(location.search).get('shot') || 'start';
  if (name === 'promo' || name === 'marquee' || name === 'og' || name === 'social') {
    document.body.className = name === 'promo' ? 'tile' : name === 'social' ? 'og social' : name;
    document.body.append(name === 'promo' ? promo() : name === 'marquee' ? marquee() : og());
  } else {
    const shot = SHOTS[name];
    if (!shot) throw new Error('unknown shot ' + name);
    document.body.className = 'shot ' + name;
    document.body.append(copy(shot));
    const view = shot.view;
    if ('popup' in view) await browserWindow(view.popup, view.badge);
    else if ('chat' in view) document.body.append(chatWindow(view.chat, view.chips).el);
    else document.body.append(folderWindow());
  }
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => {
  document.documentElement.dataset.ready = 'error: ' + (e instanceof Error ? e.message : String(e));
});
