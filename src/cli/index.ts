/* What scripts/headless-export.mjs needs from the TypeScript sources, bundled by that script with
   Vite into dist-cli/ before it runs: the collector and its steps (core/), and the export's root files
   (README.md, CLAUDE.md, AGENTS.md, export-errors.json) as the extension writes them, so an export made
   from the terminal reads the same as one made from the popup. Nothing here reaches chrome.*: readme.ts
   and state.ts are plain data and functions over core. */
export * from '../core';
export { EXPORT_ERRORS, INSTRUCTION_POINTERS, exportErrors, exportReadme } from '../extension/shared/readme';
export { FILE_LAYOUT, MACCABI_ORIGIN, SONLINE_PAGE, SUMMARY_PAGE, exportName } from '../extension/shared/state';
