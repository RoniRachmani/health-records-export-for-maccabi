/* Store images: one layout per image (?shot=...), built around the real popup,
   which runs in an iframe with a made-up state (mock-chrome.ts). The page sets
   <html data-ready="1"> when it has finished rendering, for scripts/store-assets.mjs. */
import '@fontsource-variable/heebo';

interface Shot {
  title: string;
  text: string;
  points: string[];
  /** Popup state shown in the browser window; without one, the export's folders are shown. */
  popup?: string;
  /** A <details> in the popup to show open. */
  open?: string;
  /** Toolbar badge, as the background sets it (src/extension/background/ui.ts). */
  badge?: { text: string; color: string; textColor?: string };
}

const SHOTS: Record<string, Shot> = {
  start: {
    title: 'Your Maccabi records in one ZIP',
    text: 'Log in to Maccabi Online as usual, click the extension icon and press Start export.',
    points: [
      'Test results, visits, prescriptions, referrals, vaccinations and letters',
      'Every PDF the site offers, plus the site’s own data as JSON',
      'A freshly ordered copy of your full medical file',
    ],
    popup: 'ready',
  },
  progress: {
    title: 'It works through your records on its own',
    text: 'Progress shows on the toolbar icon. You can close the popup; keep the Maccabi tab open and in front.',
    points: [
      'Usually done in 5 to 20 minutes',
      'Read-only, except for ordering your medical file',
      'Session timed out? Log in again and press Resume',
    ],
    popup: 'running',
    badge: { text: '34%', color: '#2563c9' },
  },
  done: {
    title: 'One file in your Downloads folder',
    text: 'Everything collected, in one dated ZIP file. The popup lists anything that could not be exported.',
    points: [
      'A README explains what every folder holds',
      'Keep it for your records or share it with a doctor',
      'The extension then deletes its own copy',
    ],
    popup: 'done',
    badge: { text: '✓', color: '#1a7a48' },
  },
  contents: {
    title: 'Every record, every\u00a0PDF',
    text: 'One folder per part of Maccabi Online. JSON files are the site’s own responses, exactly as sent.',
    points: ['Open formats: JSON and PDF', 'Opens offline, without any account', 'Same layout every time, easy to compare'],
  },
  privacy: {
    title: 'Private by design',
    text: 'Your records go from Maccabi Online straight to a file on your computer.',
    points: [
      'No servers, analytics or tracking',
      'Talks only to online.maccabi4u.co.il and never sees your password',
      'Open source, so anyone can check what it does',
    ],
    popup: 'ready',
    open: 'details.more',
  },
};

const FOLDERS: [string, string, string][] = [
  ['profile', 'Member details and entitlements', 'JSON'],
  ['my-doctor', 'Assigned doctors and eligibilities', 'JSON'],
  ['test-results', 'Tests, lab histories and result PDFs', 'JSON · PDF'],
  ['visit-summaries', 'Visits of the last 12 months', 'JSON · PDF'],
  ['medications-and-prescriptions', 'Prescriptions, purchases and purchase report', 'JSON · PDF'],
  ['referrals', 'Referrals and their PDFs', 'JSON · PDF'],
  ['approvals', 'Approvals and their PDFs', 'JSON · PDF'],
  ['info-pages', 'Information pages from your visits', 'JSON · PDF'],
  ['vaccinations', 'Vaccinations and vaccination booklet', 'JSON · PDF'],
  ['letters', 'Letters and their PDFs', 'JSON · PDF'],
  ['communication-with-doctor', 'Inquiries to doctors and attached forms', 'JSON · PDF'],
  ['uploads', 'Documents you uploaded', 'JSON · files'],
];

type Child = Node | string | null | undefined | false;
function h(tag: string, cls = '', ...children: Child[]): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const c of children) if (c) e.append(c);
  return e;
}

function svg(markup: string, cls = ''): HTMLElement {
  const span = h('span', cls);
  span.innerHTML = markup;
  return span;
}

const CHECK = '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="10" fill="#ffffff"/><path d="M6 10.5l2.6 2.6L14.2 7.5" fill="none" stroke="#083f92" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK = '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="#72758c"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="#72758c" stroke-width="1.6"/></svg>';
const DOC = '<svg viewBox="0 0 24 20" width="24" height="20"><path d="M5 0h10l5 5v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z" fill="#296bed"/><path d="M15 0v3a2 2 0 0 0 2 2h3z" fill="#c4e5f8"/><path d="M7 10h10M7 13h10M7 16h6" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/></svg>';
const FOLDER = '<svg viewBox="0 0 24 20" width="24" height="20"><path d="M1 3a2 2 0 0 1 2-2h6l2 2.5h10a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="#c4e5f8"/><path d="M1 7h22v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="#296bed"/></svg>';

function dots(): HTMLElement {
  return h('span', 'dots', h('i'), h('i'), h('i'));
}

function copy(shot: Shot): HTMLElement {
  const icon = h('img') as HTMLImageElement;
  icon.src = '/icons/icon-32.png';
  return h('section', 'copy',
    h('div', 'eyebrow', icon, 'Health Records Export for Maccabi'),
    h('h1', '', shot.title),
    h('p', 'lead', shot.text),
    h('ul', '', ...shot.points.map((p) => h('li', '', svg(CHECK, 'check'), h('span', '', p)))),
    h('p', 'disclaimer', 'Unofficial. Not affiliated with Maccabi Healthcare Services.'),
  );
}

function pageSkeleton(): HTMLElement {
  const card = (width: string) => {
    const last = h('div', 'line');
    last.style.width = width;
    return h('div', 'card', h('div', 'line strong'), h('div', 'line'), h('div', 'line short'), last);
  };
  return h('div', 'page',
    h('div', 'page-head', h('div', 'logo-block'), h('div', 'nav', h('i'), h('i'), h('i'), h('i'))),
    h('div', 'page-body',
      h('div', 'side', h('i'), h('i'), h('i'), h('i'), h('i')),
      h('div', 'cards', card('60%'), card('45%'), card('70%'), card('35%')),
    ),
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
  const icon = h('img') as HTMLImageElement;
  icon.src = '/icons/icon-32.png';
  const ext = h('span', 'ext', icon);
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

function filesWindow(): HTMLElement {
  return h('div', 'window files',
    h('div', 'toolbar', dots(), h('div', 'files-title', 'maccabi-export-2026-09-17')),
    h('div', 'files-list',
      // The full medical file sits beside the folders, and sorts ahead of them.
      h('div', 'file-row',
        svg(DOC, 'folder'),
        h('span', 'file-name', '2026-09-17_medical-file.pdf'),
        h('span', 'file-what', 'Your full medical file'),
        h('span', 'file-kinds', 'PDF'),
      ),
      ...FOLDERS.map(([name, what, kinds]) => h('div', 'file-row',
        svg(FOLDER, 'folder'),
        h('span', 'file-name', name),
        h('span', 'file-what', what),
        h('span', 'file-kinds', kinds),
      ))),
  );
}

function promo(): HTMLElement {
  // The icon's page and tray, over two more documents; no text, as the store asks.
  return svg(`<svg viewBox="0 0 440 280" width="440" height="280">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#296bed"/><stop offset="1" stop-color="#083f92"/></linearGradient></defs>
    <rect width="440" height="280" fill="url(#bg)"/>
    <circle cx="70" cy="240" r="120" fill="#ffffff" opacity="0.06"/>
    <circle cx="400" cy="30" r="90" fill="#ffffff" opacity="0.07"/>
    <g transform="translate(220 144)">
      <g transform="rotate(-14) translate(-118 -84)"><rect width="104" height="136" rx="10" fill="#ffffff" opacity="0.35"/><rect x="18" y="30" width="60" height="8" rx="4" fill="#083f92" opacity="0.35"/><rect x="18" y="48" width="44" height="8" rx="4" fill="#083f92" opacity="0.35"/></g>
      <g transform="rotate(12) translate(18 -84)"><rect width="104" height="136" rx="10" fill="#ffffff" opacity="0.55"/><rect x="18" y="30" width="60" height="8" rx="4" fill="#083f92" opacity="0.35"/><rect x="18" y="48" width="44" height="8" rx="4" fill="#083f92" opacity="0.35"/></g>
      <g transform="translate(-90 -94) scale(7.5)" fill="none" stroke="#2563c9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5.75 16V4.75a2 2 0 0 1 2-2H14L18.25 7v9z" fill="#ffffff"/>
        <path d="M14 2.75V7h4.25M9 10h6M9 13h3.5"/>
        <rect x="2.75" y="16" width="18.5" height="5.25" rx="1.75" fill="#ffffff"/>
        <path d="M9.5 18.625h5"/>
      </g>
    </g>
  </svg>`, 'promo');
}

async function main(): Promise<void> {
  const name = new URLSearchParams(location.search).get('shot') || 'start';
  if (name === 'promo') {
    document.body.className = 'tile';
    document.body.append(promo());
  } else {
    const shot = SHOTS[name];
    if (!shot) throw new Error('unknown shot ' + name);
    document.body.className = 'shot';
    document.body.append(copy(shot));
    if (shot.popup) await browserWindow(shot);
    else document.body.append(filesWindow());
  }
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => {
  document.documentElement.dataset.ready = 'error: ' + (e instanceof Error ? e.message : String(e));
});
