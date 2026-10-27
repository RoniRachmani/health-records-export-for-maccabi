// Tests get their own config so vitest doesn't fall back to vite.config.ts and pull the crxjs
// extension-build plugin into every run. The include keeps the run to test/ and to the tests beside a tool in tools/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'tools/**/*.test.ts'],
    // `npm run coverage`: the report, and CI's gate. The entry points that only wire chrome.* together
    // (and the dev build's own files) are left out, so the numbers are about code a test can reach. The
    // floors sit a little under today's numbers: they catch a part that loses its tests, not a line or two.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/extension/background/index.ts',
        'src/extension/background/dev.ts',
        'src/extension/background/rawDump.ts',
        'src/extension/dev/**',
        'src/extension/offscreen/**',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 90,
        statements: 87,
        functions: 86,
        branches: 79,
        'src/core/**': { lines: 95, statements: 93, functions: 100, branches: 84 },
        'src/extension/popup/model.ts': { lines: 100, statements: 98, functions: 100, branches: 96 },
      },
    },
  },
});
