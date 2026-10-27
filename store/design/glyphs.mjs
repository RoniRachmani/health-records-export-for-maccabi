// The mark and the two file icons, shared by the browser pages in store/src (through parts.ts) and the listing
// images (listing.mjs), which are assembled in Node. Plain JavaScript so both can import it.

export const DOC = '<svg viewBox="0 0 24 20" width="24" height="20"><path d="M5 0h10l5 5v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z" fill="#296bed"/><path d="M15 0v3a2 2 0 0 0 2 2h3z" fill="#c4e5f8"/><path d="M7 10h10M7 13h10M7 16h6" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/></svg>';
export const FOLDER = '<svg viewBox="0 0 24 20" width="24" height="20"><path d="M1 3a2 2 0 0 1 2-2h6l2 2.5h10a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="#c4e5f8"/><path d="M1 7h22v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill="#296bed"/></svg>';

// The folder outline, as scripts/make-icons.mjs rounds it: the tab's corners at r 0.8, the rest at
// r 2.75. Keep the two in step — this is the same mark, drawn twice.
const MARK_PATH = 'M2.75 7A2.75 2.75 0 0 1 5.5 4.25L9.031 4.25A0.8 0.8 0 0 1 9.64 4.53L11.51 6.72A0.8 0.8 0 0 0 12.119 7L18.5 7A2.75 2.75 0 0 1 21.25 9.75L21.25 18.25A2.75 2.75 0 0 1 18.5 21L5.5 21A2.75 2.75 0 0 1 2.75 18.25Z';
export const MARK = `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${MARK_PATH}" transform="translate(-1.1 -1.1)" stroke="#f1c1cd" stroke-width="2.55"/>
    <path d="${MARK_PATH}" fill="#ffffff" stroke="#083f92" stroke-width="1.6"/>
    <path d="M12 11.25v5.5M9.4 14.15L12 16.75l2.6-2.6" stroke="#083f92" stroke-width="1.6"/>
  </g>`;
