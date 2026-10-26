# Repository Guidelines

## Project Structure & Module Organization
This is a framework-free Chrome MV3 extension that exports Maccabi Online records as a ZIP.
- `src/core/`: collection logic and section handlers; inject `Transport`, `Sink`, `HtmlParser`, and `Clock`. Keep browser APIs, direct `fetch`, `DOMParser`, and `Date.now()` out of this layer.
- `src/extension/`: background runner, popup, offscreen document, and shared staging/state. Keep popup decisions in `popup/model.ts`.
- `src/cli/` and `scripts/`: terminal exports, development tools, packaging, and asset generation.
- `test/`: synthetic fixtures and unit tests; tool tests also live under `tools/`.
- `public/`: shipped static assets; `site/`: landing page; `store/`: promotional sources/assets; `docs/`: endpoint maps, policies, and release notes.

## Build, Test, and Development Commands
Use Node.js 22 or newer and install dependencies with `npm ci`.
- `npm run dev`: watch-build into `dist-dev/`; load it unpacked at `chrome://extensions`.
- `npm run typecheck`: check strict TypeScript types.
- `npm test`: run the Vitest suite.
- `npx vitest run test/collector.test.ts`: run one test file.
- `npm run build`: typecheck and build the production extension into `dist/`.
- `npm run package`: build and create the release ZIP under `release/`.

## Coding Style & Naming Conventions
Match existing TypeScript: two-space indentation, single quotes, semicolons, camelCase functions/variables, PascalCase types/classes, and UPPER_SNAKE_CASE constants. Use descriptive module names such as `offscreenClient.ts`. No linter or formatter is configured; avoid unrelated reformatting.

## Testing Guidelines
Use Vitest with `*.test.ts` names under `test/` or `tools/`. Reuse `test/fakes.ts` for fake transport, storage, clocks, and synthetic records; DOM tests use happy-dom. Cover changed behavior, failures, and resume safety. No numeric coverage threshold is configured. CI runs typecheck, tests, and the production build.

## Commit & Pull Request Guidelines
History uses short, imperative subjects such as “Never send a refused medical-file order again”; releases use `Release <version>: <summary>`. Branch from `main` and submit changes through a pull request. The `check` CI job must pass against the latest `main`; no second-person approval is required. Run typecheck and tests before pushing. For requested PRs, describe behavior changes and validation, link relevant issues, and include screenshots for UI changes.

## Privacy & Architecture Rules
Never commit real account data, exports, PDFs, tokens, or HAR captures. Keep secrets in ignored `.env` files. Map every request in `docs/endpoints/endpoints.json`. Read `CONTRIBUTING.md` before changing run behavior; preserve repeatable steps and medical-file ordering guards. Update user documentation when behavior changes, keep policy copies synchronized, and regenerate store images after popup changes.
