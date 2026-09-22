// Renders the Chrome Web Store's promo video into store/assets/promo-video.mp4: store/src/video.ts draws
// one frame at a time in headless Chrome (no real data, the same made-up popup states as the store
// images), and the frames are encoded to H.264. Give two times in seconds to render only that
// slice while working on it, e.g. `npm run store-video -- 8 12`.
//
// Encodes with ffmpeg when it is on PATH; otherwise, on macOS, with scripts/encode-mp4.swift,
// compiled on the spot. The store takes a YouTube link rather than a file, so the MP4 this writes
// is what you upload to YouTube (see docs/store-listing.md).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { isFile, openStage, root } from './stage.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;
const OUT = join(root, 'store', 'assets', 'promo-video.mp4');
// Frames per browser. The stage draws frame n from n alone, so the browser can be replaced at any
// point without the film changing — and a render of a thousand frames then doesn't rest on one
// browser process staying healthy (and small) to the end.
const PER_BROWSER = 150;
const TRIES = 3;

const [from, to] = process.argv.slice(2).map(Number);

function onPath(name) {
  return (process.env.PATH || '').split(delimiter).map((dir) => join(dir, name)).find(isFile);
}

function run(exe, args) {
  const res = spawnSync(exe, args, { stdio: 'inherit' });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(exe + ' failed (' + res.status + ')');
}

/** Turns the folder of frames into an MP4, with whatever encoder this machine has. */
function encode(frames, fps) {
  const ffmpeg = process.env.FFMPEG_PATH || onPath('ffmpeg');
  if (ffmpeg) {
    run(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%06d.png'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
    return 'ffmpeg';
  }
  const swiftc = onPath('swiftc') || (isFile('/usr/bin/swiftc') && '/usr/bin/swiftc');
  if (process.platform !== 'darwin' || !swiftc) {
    throw new Error('No encoder: install ffmpeg (or set FFMPEG_PATH). The bundled encoder needs macOS and swiftc.');
  }
  const exe = join(frames, '..', 'encode-mp4');
  // -suppress-warnings: AVAssetWriter's pull-based API is deprecated in favour of the async one,
  // and says so at length every time. It still works, and the encoder is 90 lines.
  run(swiftc, ['-O', '-suppress-warnings', '-o', exe, join(root, 'scripts', 'encode-mp4.swift')]);
  run(exe, [frames, OUT, String(fps)]);
  return 'AVFoundation';
}

const work = mkdtempSync(join(tmpdir(), 'hrem-video-'));
const frames = join(work, 'frames');
mkdirSync(frames);
const stage = await openStage();
try {
  let page = await stage.open('/store/src/video.html', WIDTH, HEIGHT);
  const { fps, frames: total } = await page.evaluate('({ fps: window.video.fps, frames: window.video.frames })');
  const first = Number.isFinite(from) ? Math.max(0, Math.round(from * fps)) : 0;
  const last = Number.isFinite(to) ? Math.min(total, Math.round(to * fps)) : total;
  if (!(last > first)) throw new Error('Nothing to render between ' + from + 's and ' + to + 's.');
  const seconds = ((last - first) / fps).toFixed(1);
  console.log('rendering ' + (last - first) + ' frames (' + seconds + 's) at ' + WIDTH + 'x' + HEIGHT);

  const fresh = async () => {
    await stage.restart();
    page = await stage.open('/store/src/video.html', WIDTH, HEIGHT);
  };

  /** Draws frame n and photographs it. A browser that dies costs a restart, not the whole render. */
  const shoot = async (n) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await page.evaluate('window.video.at(' + n + ')');
        return await page.screenshot();
      } catch (e) {
        if (attempt === TRIES) throw e;
        console.log('  frame ' + n + ': ' + e.message + ' — starting a new browser');
        await fresh();
      }
    }
  };

  for (let n = first; n < last; n++) {
    const done = n - first;
    if (done > 0 && done % PER_BROWSER === 0) await fresh();
    writeFileSync(join(frames, String(done).padStart(6, '0') + '.png'), await shoot(n));
    if (done % fps === 0) console.log('  ' + (done / fps).toFixed(0) + 's of ' + seconds + 's');
  }
  await page.close();

  const encoder = encode(frames, fps);
  const mb = (statSync(OUT).size / 1e6).toFixed(1);
  console.log('wrote store/assets/promo-video.mp4 (' + seconds + 's, ' + mb + ' MB, ' + encoder + ')');
} finally {
  await stage.close();
  rmSync(work, { recursive: true, force: true });
}
