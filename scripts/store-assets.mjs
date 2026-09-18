// Renders the Chrome Web Store images into store/: screenshots of the real popup
// fed made-up states (store/src/mock-chrome.ts, no real data) and the small promo
// tile. Needs Chrome, Chromium or Edge; set CHROME_PATH if it isn't found.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'dist-store');

const IMAGES = [
  { file: 'screenshot-1-start.png', shot: 'start', width: 1280, height: 800 },
  { file: 'screenshot-2-progress.png', shot: 'progress', width: 1280, height: 800 },
  { file: 'screenshot-3-done.png', shot: 'done', width: 1280, height: 800 },
  { file: 'screenshot-4-contents.png', shot: 'contents', width: 1280, height: 800 },
  { file: 'screenshot-5-privacy.png', shot: 'privacy', width: 1280, height: 800 },
  { file: 'promo-small-440x280.png', shot: 'promo', width: 440, height: 280 },
];

const BROWSERS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter(Boolean);

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await build({ root, configFile: join(root, 'vite.store.config.ts'), logLevel: 'warn' });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  const file = resolve(outDir, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(outDir + sep) || !isFile(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const exe = BROWSERS.find(isFile);
if (!exe) throw new Error('No Chrome, Chromium or Edge found; set CHROME_PATH.');
const profile = mkdtempSync(join(tmpdir(), 'hrem-store-'));
const browser = spawn(exe, [
  '--headless=new',
  '--remote-debugging-port=0',
  '--user-data-dir=' + profile,
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--force-color-profile=srgb',
  'about:blank',
]);

try {
  const wsUrl = await new Promise((resolveUrl, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('browser did not start:\n' + log)), 30_000);
    browser.stderr.on('data', (d) => {
      log += d;
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolveUrl(m[1]);
      }
    });
  });

  // A minimal DevTools Protocol client.
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let lastId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = m.id && pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  };
  const send = (method, params = {}, sessionId) => {
    const id = ++lastId;
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
  };

  for (const img of IMAGES) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: img.width, height: img.height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId);
    await send('Page.navigate', { url: base + '/store/src/stage.html?shot=' + img.shot }, sessionId);
    for (let i = 0; ; i++) {
      const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.dataset.ready || ""', returnByValue: true }, sessionId);
      if (result.value === '1') break;
      if (result.value) throw new Error(img.shot + ': ' + result.value);
      if (i > 150) throw new Error(img.shot + ': timed out');
      await sleep(100);
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(join(root, 'store', img.file), Buffer.from(data, 'base64'));
    await send('Target.closeTarget', { targetId });
    console.log('wrote store/' + img.file);
  }
  ws.close();
} finally {
  browser.kill();
  server.close();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
