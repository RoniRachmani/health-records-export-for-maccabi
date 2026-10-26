/* The pieces the promo video (video.ts) draws: the little
   DOM helper, the icons, the fake browser window's insides, the ZIP's folder list, the AI
   assistant opened on the export, and the mark.
   Nothing here decides a layout — each page's own CSS places these. */

// The mark and the two file icons are shared with the listing images (store/design/listing.mjs), which run in Node.
import { DOC, FOLDER, MARK, MARK_PATH } from '../design/glyphs.mjs';

export { DOC, FOLDER, MARK, MARK_PATH };

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

export const LOCK = '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="#72758c"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="#72758c" stroke-width="1.6"/></svg>';

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
function fileRow(icon: string, name: string, what: string, kinds: string): HTMLElement {
  return h('div', 'file-row',
    svg(icon, 'folder'),
    h('span', 'file-name', name),
    h('span', 'file-what', what),
    h('span', 'file-kinds', kinds),
  );
}

/** What the member adds to the folder themselves, after the export: it is theirs to grow. */
const ADDED = { name: 'private-clinic-letter.pdf', what: 'Added by you', kinds: 'PDF' };

/** The unzipped export's rows: its README, the medical file, a file of the member's own (class `added`), and the folders. */
export function exportRows(): { readme: HTMLElement; medical: HTMLElement; added: HTMLElement; folders: HTMLElement[] } {
  const added = fileRow(DOC, ADDED.name, ADDED.what, ADDED.kinds);
  added.classList.add('added');
  return {
    readme: fileRow(DOC, 'README.md', 'What every folder holds, and what isn’t there', 'Markdown'),
    medical: fileRow(DOC, '2026-09-17_medical-file.pdf', 'Your full medical file', 'PDF'),
    added,
    folders: FOLDERS.map(([name, what, kinds]) => fileRow(FOLDER, name, what, kinds)),
  };
}

/** A generic assistant's mark: a four-point spark, in the extension's blue. */
const SPARK = '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 1.5c.6 4.4 4.1 7.9 8.5 8.5-4.4.6-7.9 4.1-8.5 8.5-.6-4.4-4.1-7.9-8.5-8.5 4.4-.6 7.9-4.1 8.5-8.5z" fill="#296bed"/></svg>';

/** More questions a member might ask, offered under the answer: docs/positioning.md's Ask use cases. */
const FOLLOW_UPS = ['What might I be due for?', 'What changed in my latest blood test?', 'What should I raise with my doctor on Thursday?'];

/** A question put to the assistant, and its answer: paragraphs, then the file it names as its source. */
export interface Exchange {
  question: string;
  answer: () => HTMLElement[];
}

/** A source pill: the folder quiet, the record's name bright, and the page when it is a PDF's. */
function source(dir: string, stem: string, ext: string, page?: string): HTMLElement {
  return h('p', 'source', svg(DOC, 'source-icon'),
    h('span', 'dir', dir), h('span', 'stem', stem), h('span', 'dir', ext + (page ? ' · ' + page : '')));
}

// The two answers the film and the store's screenshots show, both about the same made-up member (docs/positioning.md's demo persona): in
// their mid-40s, cholesterol creeping up, blood sugar at the top of normal, asthma quiet since 2019.

/** The first "wow": years of records turned into the few things worth knowing. The film's opening, and screenshot 1. */
export const STANDS_OUT: Exchange = {
  question: 'What stands out in my records?',
  answer: () => [
    h('p', '', h('strong', '', 'Your cholesterol has crept up for three years,'), ' though each result is still inside the lab’s range.'),
    h('p', '', h('strong', '', 'Your vitamin D has been low'), ' at every test since 2021.'),
    h('p', '', h('strong', '', 'Your asthma has been quiet since 2019,'), ' with no inhaler bought since.'),
    source('test-results/history/', '1121_כולסטרול', '.json'),
  ],
};

/** Advice about this member rather than an average one, small and tied to their own numbers. The film's end, and screenshot 3. */
export const ONE_THING: Exchange = {
  question: 'What’s one thing I should do today to improve my health?',
  answer: () => [
    h('p', '', h('strong', '', 'A 20-minute walk after dinner.'), ' Your cholesterol has crept up since 2023 and your blood sugar is at the top of normal, and a daily walk is the easiest thing that helps both.'),
    h('p', '', 'Check with your family doctor before any bigger change.'),
    source('test-results/history/', '1121_כולסטרול', '.json'),
  ],
};

export interface Chat {
  el: HTMLElement;
  question: HTMLElement;
  /** The answer's paragraphs, then the file it names as its source. */
  answer: HTMLElement[];
  chips: HTMLElement[];
  input: HTMLElement;
}

/**
 * An AI assistant with the export's folder open, drawn plain so that it is no real product: the
 * export's README taken as its instructions, a question, an answer in English from a record whose name is Hebrew, the file it came from, and
 * more questions to ask (`questions`). The records are made up, as everywhere else in these images.
 */
export function chatWindow(exchange: Exchange, questions = FOLLOW_UPS): Chat {
  const question = h('div', 'msg ask', exchange.question);
  const answer = exchange.answer();
  const chips = questions.map((q) => h('span', 'ask-chip', q));
  const input = h('div', 'chat-input', 'Ask about your records…');
  const el = h('div', 'window chat',
    h('div', 'toolbar', dots(), h('div', 'chat-title', svg(FOLDER, 'folder'), h('span', '', 'maccabi-export-2026-09-17'))),
    h('div', 'chat-body',
      h('p', 'chat-note', svg(DOC, 'source-icon'), 'Read README.md, the instructions for working with these records'),
      question, h('div', 'msg reply', svg(SPARK, 'avatar'), h('div', 'reply-body', ...answer))),
    h('div', 'chat-foot', h('div', 'ask-chips', ...chips), input),
  );
  return { el, question, answer, chips, input };
}

// The two tilted documents and the icon's own artwork (scripts/make-icons.mjs, on its 24-unit
// grid), shared by the promo tiles and the video so they read as one family.
export function paper(opacity: number): string {
  return `<rect width="104" height="136" rx="10" fill="#ffffff" opacity="${opacity}"/>
    <rect x="18" y="30" width="60" height="8" rx="4" fill="#083f92" opacity="0.35"/>
    <rect x="18" y="48" width="44" height="8" rx="4" fill="#083f92" opacity="0.35"/>`;
}

