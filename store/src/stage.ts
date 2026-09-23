/* Store images: one layout per image (?shot=...), built around the real popup,
   which runs in an iframe with a made-up state (mock-chrome.ts). The page sets
   <html data-ready="1"> when it has finished rendering, for scripts/store-assets.mjs. */
import '@fontsource-variable/heebo';
import { CHECK, LOCK, MARK, chatWindow, dots, h, img, pageSkeleton, paper, svg } from './parts';

interface Shot {
  title: string;
  text: string;
  points: string[];
  /** Popup state shown in the browser window; without one, an AI assistant opened on the export is shown. */
  popup?: string;
  /** A <details> in the popup to show open. */
  open?: string;
  /** Toolbar badge, as the background sets it (src/extension/background/ui.ts). */
  badge?: { text: string; color: string; textColor?: string };
}

const SHOTS: Record<string, Shot> = {
  ask: {
    title: 'Ask an AI assistant about your Maccabi health records',
    text: 'Save them as one ZIP, open it in the assistant you choose, and ask in plain language.',
    points: [
      'Records in Hebrew, answers in your language',
      'See your whole history, and how each result has changed',
      'It’s asked to name the file behind each answer, so you can check',
    ],
  },
  start: {
    title: 'Start it on Maccabi Online',
    text: 'Log in to Maccabi Online as usual, click the extension icon and press Start export. You get one ZIP on your computer.',
    points: [
      'Test results, visits, prescriptions, referrals, vaccinations and letters',
      'Every PDF the site offers, plus the site’s own data as JSON',
      'A freshly ordered copy of your full medical file',
    ],
    popup: 'ready',
  },
  progress: {
    title: 'It works through your records on its own',
    text: 'Progress shows on the toolbar icon. You can close the popup; keep the Maccabi Healthcare Services tab open and in front.',
    points: [
      'Usually done in 5 to 20 minutes',
      'Read-only, except for ordering your medical file',
      'Session timed out? Log in again and press Resume',
    ],
    popup: 'running',
    badge: { text: '34%', color: '#296bed' },
  },
  done: {
    title: 'One file in your Downloads folder',
    text: 'Everything collected, in one dated ZIP file. The popup lists anything that could not be exported.',
    points: [
      'Its README tells your AI assistant how to read your records',
      'Keep it for your records or share it with a doctor',
      'The extension then deletes its own copy',
    ],
    popup: 'done',
    badge: { text: '✓', color: '#1a7a48' },
  },
  privacy: {
    title: 'Private by design',
    text: 'Your records stop at your computer. You choose which AI assistant, if any, reads them.',
    points: [
      'No servers, analytics or tracking',
      'Talks only to online.maccabi4u.co.il and never sees your password',
      'Open source, so anyone can check what it does',
    ],
    popup: 'ready',
    open: 'details.more',
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

async function popupFrame(state: string, parent: HTMLElement, open?: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.className = 'popup';
  const loaded = new Promise((r) => (frame.onload = r));
  frame.src = '/src/extension/popup/popup.html?state=' + state;
  parent.append(frame);
  await loaded;
  const doc = frame.contentDocument as Document;
  for (let i = 0; i < 200 && !doc.querySelector('#view > :not(.loading)'); i++) await new Promise((r) => setTimeout(r, 25));
  if (open) (doc.querySelector(open) as HTMLDetailsElement).open = true;
  await doc.fonts.ready;
  // The popup sets its own width; scale it down if it would not fit in the window.
  frame.style.width = doc.body.offsetWidth + 'px';
  const height = doc.documentElement.scrollHeight;
  frame.style.height = height + 'px';
  const room = parent.clientHeight - frame.offsetTop - 12;
  frame.style.transform = 'scale(' + Math.min(1.3, room / height) + ')';
}

async function browserWindow(shot: Shot): Promise<HTMLElement> {
  const ext = h('span', 'ext', img('/icons/icon-32.png'));
  if (shot.badge) {
    const badge = h('span', 'badge', shot.badge.text);
    badge.style.background = shot.badge.color;
    if (shot.badge.textColor) badge.style.color = shot.badge.textColor;
    ext.append(badge);
  }
  const win = h('div', 'window browser',
    h('div', 'toolbar', dots(), h('div', 'address', svg(LOCK), h('span', '', 'online.maccabi4u.co.il')), ext),
    pageSkeleton(),
  );
  document.body.append(win); // the popup frame loads only once attached
  await popupFrame(shot.popup as string, win, shot.open);
  return win;
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

async function main(): Promise<void> {
  const name = new URLSearchParams(location.search).get('shot') || 'start';
  if (name === 'promo' || name === 'marquee') {
    document.body.className = name === 'promo' ? 'tile' : 'marquee';
    document.body.append(name === 'promo' ? promo() : marquee());
  } else {
    const shot = SHOTS[name];
    if (!shot) throw new Error('unknown shot ' + name);
    document.body.className = 'shot';
    document.body.append(copy(shot));
    if (shot.popup) await browserWindow(shot);
    else document.body.append(chatWindow().el);
  }
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => {
  document.documentElement.dataset.ready = 'error: ' + (e instanceof Error ? e.message : String(e));
});
