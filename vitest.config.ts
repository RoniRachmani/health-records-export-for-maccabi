// Tests get their own config so vitest doesn't fall back to vite.config.ts and pull the crxjs
// extension-build plugin into every run. The include keeps the run to test/ and to the tests beside a tool in tools/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'tools/**/*.test.ts'],
    // `npm run coverage`: a report to read, not a gate. The entry points that only wire chrome.* together
    // (and the dev build's own files) are left out, so the numbers are about code a test can reach.
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
    },
  },
});
