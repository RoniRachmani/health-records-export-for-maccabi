import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest(({ mode }) => ({
  manifest_version: 3,
  name: mode === 'development' ? 'Health Records Export for Maccabi (dev)' : 'Health Records Export for Maccabi',
  version: pkg.version,
  description: 'Ask an AI assistant about your Maccabi Online medical records: save them and every PDF as one ZIP on your computer. Unofficial.',
  minimum_chrome_version: '116',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'Health Records Export for Maccabi',
    default_popup: 'src/extension/popup/popup.html',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  background: {
    service_worker: 'src/extension/background/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'unlimitedStorage', 'scripting', 'downloads', 'offscreen', 'alarms', 'notifications'],
  host_permissions: ['https://online.maccabi4u.co.il/*'],
  ...(mode === 'development'
    ? {
        content_scripts: [
          {
            matches: ['https://online.maccabi4u.co.il/*'],
            js: ['src/extension/dev/bridge.ts'],
            run_at: 'document_start' as const,
          },
        ],
      }
    : {}),
}));
