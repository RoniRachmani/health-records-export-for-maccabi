// Tests get their own config so vitest doesn't fall back to vite.config.ts and pull the crxjs
// extension-build plugin into every run. The include keeps the run to test/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
