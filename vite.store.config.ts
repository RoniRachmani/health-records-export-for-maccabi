import { defineConfig, type Plugin } from 'vite';

/** Loads the stand-in extension APIs before the real popup script (store assets only). */
function mockChrome(): Plugin {
  return {
    name: 'store-mock-chrome',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('/popup/popup.html')) return html;
        return { html, tags: [{ tag: 'script', attrs: { type: 'module', src: '/store/src/mock-chrome.ts' }, injectTo: 'head-prepend' }] };
      },
    },
  };
}

// Built and captured by scripts/store-assets.mjs (the images) and scripts/store-video.mjs (the video).
export default defineConfig({
  plugins: [mockChrome()],
  define: {
    __DEV_BRIDGE__: 'false',
  },
  build: {
    outDir: 'dist-store',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        popup: 'src/extension/popup/popup.html',
        stage: 'store/src/stage.html',
        video: 'store/src/video.html',
      },
    },
  },
});
