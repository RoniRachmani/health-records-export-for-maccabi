// Builds dist-store, serves it and opens it in headless Chrome, for the two scripts that
// photograph it: store-assets.mjs (the store images) and store-video.mjs (the promo video).
// Needs Chrome, Chromium or Edge; set CHROME_PATH if it isn't found.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'dist-store');

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

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Builds the store bundle, serves it and opens a headless browser on it. Returns the stage:
 * `open()` for a page to photograph, `restart()` for a fresh browser, `close()` when there is
 * nothing left to shoot.
 */
export async function openStage() {
  await build({ root, configFile: join(root, 'vite.store.config.ts'), logLevel: 'warn' });

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

  let browser;
  let profile;
  let ws;
  let send;
  let stopping = false;

  // A headless browser that outlives this script is invisible and holds on to a lot of memory,
  // which is exactly what makes the next render fail. It goes when we go, however we go.
  const kills = () => browser?.kill('SIGKILL');
  process.once('exit', kills);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
      kills();
      process.exit(1);
    });
  }

  async function launch() {
    stopping = false;
    profile = mkdtempSync(join(tmpdir(), 'hrem-store-'));
    browser = spawn(exe, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      // Nothing here needs the parts of a browser that talk to the world.
      '--disable-extensions',
      '--disable-sync',
      '--disable-background-networking',
      '--metrics-recording-only',
      '--mute-audio',
      'about:blank',
    ]);

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
    ws = new WebSocket(wsUrl);
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = j;
    });
    let lastId = 0;
    const pending = new Map();
    // A browser that dies mid-shoot must not leave the script waiting for a reply that can no
    // longer come: fail everything outstanding, loudly.
    const abandon = (why) => {
      if (stopping) return;
      for (const p of pending.values()) p.reject(new Error('the headless browser ' + why));
      pending.clear();
    };
    ws.onclose = () => abandon('closed the DevTools connection');
    ws.onerror = () => abandon('broke the DevTools connection');
    browser.on('exit', (code, signal) => abandon('exited (' + (signal || 'code ' + code) + ')'));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const p = m.id && pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    };
    send = (method, params = {}, sessionId) => {
      const id = ++lastId;
      ws.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((res, rej) => {
        // A browser can die without closing its end of the socket, and then a reply simply never
        // comes. Without this the script would wait for it for ever, looking like slow progress.
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(method + ': no reply in 30s; the headless browser is gone or wedged'));
        }, 30_000);
        pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            res(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            rej(e);
          },
        });
      });
    };
  }

  async function kill() {
    stopping = true;
    ws.close();
    // The profile can only go once the browser has: until it exits it is still writing to it, and
    // a busy 4K browser takes a while. Asked to stop, then told to, then its folder removed — with
    // retries, for the files it was still closing.
    const gone = browser.exitCode !== null || browser.signalCode !== null
      ? Promise.resolve()
      : new Promise((r) => browser.once('exit', r));
    browser.kill();
    await Promise.race([gone, sleep(5000)]);
    if (browser.exitCode === null && browser.signalCode === null) {
      browser.kill('SIGKILL');
      await Promise.race([gone, sleep(2000)]);
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }

  await launch();

  return {
    base,
    /**
     * Opens `path` at this size and waits until the page says it has finished rendering
     * (`<html data-ready="1">`, or `data-ready="error: …"` when it gave up). `scale` is the device
     * pixel ratio: the page lays out at width x height and is drawn, and photographed, `scale` times
     * as large, which is how the video comes out in 4K from a 1920x1080 stage.
     */
    async open(path, width, height, scale = 1) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
      await send('Page.navigate', { url: base + path }, sessionId);
      const page = {
        /** Evaluates an expression in the page; awaits it when it returns a promise. */
        async evaluate(expression) {
          const { result, exceptionDetails } = await send(
            'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
          if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
          return result.value;
        },
        /**
         * The page as it looks now, as PNG bytes. `fast` trades file size for encoding time, for
         * frames that only pass through on their way to the video encoder.
         */
        async screenshot({ fast = false } = {}) {
          const { data } = await send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: fast }, sessionId);
          return Buffer.from(data, 'base64');
        },
        async close() {
          await send('Target.closeTarget', { targetId });
        },
      };
      for (let i = 0; ; i++) {
        const ready = await page.evaluate('document.documentElement.dataset.ready || ""');
        if (ready === '1') break;
        if (ready) throw new Error(path + ': ' + ready);
        if (i > 150) throw new Error(path + ': timed out');
        await sleep(100);
      }
      return page;
    },
    /** A fresh browser, for a long shoot: whatever the last one was holding on to is let go. */
    async restart() {
      await kill();
      await launch();
    },
    async close() {
      await kill();
      server.close();
    },
  };
}
