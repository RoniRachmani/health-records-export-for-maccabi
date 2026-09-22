/* The pieces the store images (stage.ts) and the promo video (video.ts) both draw: the little
   DOM helper, the icons, the fake browser window's insides, the ZIP's folder list and the mark.
   Nothing here decides a layout — each page's own CSS places these. */

export type Child = Node | string | null | undefined | false;

export function h(tag: string, cls = '', ...children: Child[]): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const c of children) if (c) e.append(c);
  return e;
}

export function svg(markup: string, cls = ''): HTMLElement {
  const span = h('span', cls);
  span.innerHTML = markup;
  return span;
}

export function img(src: string, cls = ''): HTMLImageElement {
  const e = h('img', cls) as HTMLImageElement;
  e.src = src;
  return e;
}

export const CHECK = '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="10" fill="#ffffff"/><path d="M6 10.5l2.6 2.6L14.2 7.5" fill="none" stroke="#083f92" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const LOCK = '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="#72758c"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="#72758c" stroke-width="1.6"/></svg>';
export const DOC = '<svg viewBox="0 0 24 20" width="24" height="20"><path d="M5 0h10l5 5v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z" fill="#296bed"/><path d="M15 0v3a2 2 0 0 0 2 2h3z" fill="#c4e5f8"/><path d="M7 10h10M7 13h10M7 16h6" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/></svg>';
export const FOLDER = '<svg viewBox="0 0 24 20" width="24" height="20"><path d="M1 3a2 2 0 0 1 2-2h6l2 2.5h10a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="#c4e5f8"/><path d="M1 7h22v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="#296bed"/></svg>';

/** The three window buttons in a toolbar. */
export function dots(): HTMLElement {
  return h('span', 'dots', h('i'), h('i'), h('i'));
}

const CARD_WIDTHS = ['60%', '45%', '70%', '35%'];

/** A generic page behind the popup: no real site. Two cards to a row, `rows` of them. */
export function pageSkeleton(rows = 2): HTMLElement {
  const card = (width: string) => {
    const last = h('div', 'line');
    last.style.width = width;
    return h('div', 'card', h('div', 'line strong'), h('div', 'line'), h('div', 'line short'), last);
  };
  const cards = Array.from({ length: rows * 2 }, (_, i) => card(CARD_WIDTHS[i % CARD_WIDTHS.length]));
  return h('div', 'page',
    h('div', 'page-head', h('div', 'logo-block'), h('div', 'nav', h('i'), h('i'), h('i'), h('i'))),
    h('div', 'page-body',
      h('div', 'side', h('i'), h('i'), h('i'), h('i'), h('i')),
      h('div', 'cards', ...cards),
    ),
  );
}

/** One folder in the ZIP: name, what it holds, what it is made of. */
export const FOLDERS: [string, string, string][] = [
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

/** One row of the ZIP's contents; the medical file passes DOC, the folders FOLDER. */
export function fileRow(icon: string, name: string, what: string, kinds: string): HTMLElement {
  return h('div', 'file-row',
    svg(icon, 'folder'),
    h('span', 'file-name', name),
    h('span', 'file-what', what),
    h('span', 'file-kinds', kinds),
  );
}

/** The ZIP's contents: the full medical file, which sorts ahead of the folders, and then FOLDERS. */
export function fileRows(): HTMLElement[] {
  return [
    fileRow(DOC, '2026-09-17_medical-file.pdf', 'Your full medical file', 'PDF'),
    ...FOLDERS.map(([name, what, kinds]) => fileRow(FOLDER, name, what, kinds)),
  ];
}

// The two tilted documents and the icon's own artwork (scripts/make-icons.mjs, on its 24-unit
// grid), shared by the promo tiles and the video so they read as one family.
export function paper(opacity: number): string {
  return `<rect width="104" height="136" rx="10" fill="#ffffff" opacity="${opacity}"/>
    <rect x="18" y="30" width="60" height="8" rx="4" fill="#083f92" opacity="0.35"/>
    <rect x="18" y="48" width="44" height="8" rx="4" fill="#083f92" opacity="0.35"/>`;
}

// The folder outline, as scripts/make-icons.mjs rounds it: the tab's corners at r 0.8, the rest at
// r 2.75. Keep the two in step — this is the same mark, drawn twice.
export const MARK_PATH = 'M2.75 7A2.75 2.75 0 0 1 5.5 4.25L9.031 4.25A0.8 0.8 0 0 1 9.64 4.53L11.51 6.72A0.8 0.8 0 0 0 12.119 7L18.5 7A2.75 2.75 0 0 1 21.25 9.75L21.25 18.25A2.75 2.75 0 0 1 18.5 21L5.5 21A2.75 2.75 0 0 1 2.75 18.25Z';
export const MARK = `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${MARK_PATH}" transform="translate(-1.1 -1.1)" stroke="#f1c1cd" stroke-width="2.55"/>
    <path d="${MARK_PATH}" fill="#ffffff" stroke="#083f92" stroke-width="1.6"/>
    <path d="M12 11.25v5.5M9.4 14.15L12 16.75l2.6-2.6" stroke="#083f92" stroke-width="1.6"/>
  </g>`;
