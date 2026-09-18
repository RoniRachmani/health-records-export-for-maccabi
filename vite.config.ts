import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import manifest from './manifest.config.ts';

export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest })],
  define: {
    __DEV_BRIDGE__: JSON.stringify(mode === 'development'),
  },
  build: {
    outDir: mode === 'development' ? 'dist-dev' : 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // Readable output: store reviewers and users can audit what ships.
    minify: false,
    rollupOptions: {
      input: {
        offscreen: 'src/extension/offscreen/offscreen.html',
      },
    },
  },
}));
