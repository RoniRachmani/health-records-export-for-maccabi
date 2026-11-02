// The TypeScript sources, bundled for Node into dist-cli/ by Vite: src/cli/index.ts re-exports what the terminal
// scripts use (npm run export, npm run drift). Shared so both run the same bundle.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { root } from './stage.mjs';

export async function loadCore() {
  const out = join(root, 'dist-cli');
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    define: { __DEV_BRIDGE__: 'false' },
    build: {
      outDir: out,
      emptyOutDir: true,
      minify: false,
      target: 'es2022',
      lib: { entry: join(root, 'src/cli/index.ts'), formats: ['es'], fileName: () => 'core.mjs' },
      rollupOptions: { external: ['fflate'] },
    },
  });
  return import(pathToFileURL(join(out, 'core.mjs')).href);
}
