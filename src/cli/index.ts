/* What scripts/headless-export.mjs needs from the TypeScript sources, bundled by that script with
   Vite into dist-cli/ before it runs: the collector and its steps (core/), and the export's root files
   (README.md, CLAUDE.md, AGENTS.md, export-errors.json) as the extension writes them, so an export made
   from the terminal reads the same as one made from the popup, and the functions the extension runs inside
   the Maccabi Online tab (tab.ts), which the script evaluates in its own page from their source, so the two
   send a request the same way. Nothing here reaches chrome.*: readme.ts and state.ts are plain data and
   functions over core, and of tab.ts only those self-contained functions and their limits are kept. */
export * from '../core';
export { EXPORT_ERRORS, INSTRUCTION_POINTERS, exportErrors, exportReadme, notCollected } from '../extension/shared/readme';
export { STALL_MS, TAB_FETCH_TIMEOUT_MS, TAB_MAX_BYTES, activityInPage, fetchInPage, snapshotInPage, xhrInPage } from '../extension/background/tab';
export { FILE_LAYOUT, MACCABI_ORIGIN, SUMMARY_PAGE, exportName } from '../extension/shared/state';
