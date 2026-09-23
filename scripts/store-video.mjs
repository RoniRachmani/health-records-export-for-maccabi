// Renders the Chrome Web Store's promo video into store/assets/promo-video.mp4: store/src/video.ts draws
// one frame at a time in headless Chrome (no real data, the same made-up popup states as the store
// images), and each frame goes straight into an H.264 encoder as it is photographed. Give two times in
// seconds to render only that slice while working on it, e.g. `npm run store-video -- 8 12`.
//
// The soundtrack is scored from the same timeline (soundtrack.mjs), with the narration spoken by
// ElevenLabs (narration.mjs, which needs ELEVENLABS_API_KEY, from the environment or .env). It is
// built before the first frame, so a missing key costs seconds, not a render.
//   --audio-only    write the soundtrack alone, to store/assets/promo-soundtrack.wav, and stop
//   --no-narration  music and effects only
//   --silent        no soundtrack at all
//   --script        print the narration as one take's text, to paste into ElevenLabs, and stop
//   --import <file> cut such a take into its lines for the narration (see narration.mjs), then go on
//   --remux         keep the picture of the last render and give it this soundtrack: seconds, not a
//                   render, for trying a sound
//
// The stage is laid out at 1920x1080 and drawn at twice that, so the film is 4K: text, the popup and
// every line drawing are rendered at 3840x2160 rather than scaled up to it, and YouTube gives a 4K
// upload its better codecs at every size it serves, 1080p included.
//
// Encodes with ffmpeg when it is on PATH; otherwise, on macOS, with scripts/encode-mp4.swift,
// compiled on the spot. The store takes a YouTube link rather than a file, so the MP4 this writes
// is what you upload to YouTube (see docs/store-listing.md).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { importTake, script, speak } from './narration.mjs';
import { buildSoundtrack, writeWav } from './soundtrack.mjs';
import { isFile, openStage, root } from './stage.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;
const SCALE = 2;
const OUT = join(root, 'store', 'assets', 'promo-video.mp4');
// Written here and moved into place only once it is whole, so a failed render leaves the last good film.
const PARTIAL = join(root, 'store', 'assets', 'promo-video.partial.mp4');
// Frames per browser. The stage draws frame n from n alone, so the browser can be replaced at any
// point without the film changing — and a render of thousands of frames then doesn't rest on one
// browser process staying healthy (and small) to the end.
const PER_BROWSER = 150;
const TRIES = 3;

const args = process.argv.slice(2);
const importAt = args.indexOf('--import');
const take = importAt < 0 ? null : args.splice(importAt, 2)[1];
if (take === undefined || take?.startsWith('--')) throw new Error('--import needs the take: --import <file>');
const flags = new Set(args.filter((a) => a.startsWith('--')));
const OPTIONS = ['--audio-only', '--no-narration', '--silent', '--script', '--remux'];
for (const f of flags) if (!OPTIONS.includes(f)) throw new Error('Unknown option ' + f);
const [from, to] = args.filter((a) => !a.startsWith('--')).map(Number);
if (flags.has('--remux') && (Number.isFinite(from) || Number.isFinite(to))) throw new Error('--remux takes the whole film; leave out the times');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

/** The soundtrack as AAC in an .m4a, by the encoder macOS ships: 320 kbit/s, its best quality. */
function toAac(wav, work) {
  const m4a = join(work, 'soundtrack.m4a');
  const aac = spawnSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '320000', '-q', '127', wav, m4a], { stdio: 'inherit' });
  if (aac.error || aac.status !== 0) throw aac.error || new Error('afconvert failed (' + aac.status + ')');
  return m4a;
}

function onPath(name) {
  return (process.env.PATH || '').split(delimiter).map((dir) => join(dir, name)).find(isFile);
}

/**
 * Starts whichever encoder this machine has, reading PNG frames on its standard input, with the
 * soundtrack (a WAV) when there is one. Returns the process, its name, and a promise of its exit
 * that rejects if it fails.
 */
function startEncoder(fps, work, wav) {
  let exe;
  let args;
  let name;
  const ffmpeg = process.env.FFMPEG_PATH || onPath('ffmpeg');
  if (ffmpeg) {
    name = 'ffmpeg';
    exe = ffmpeg;
    // Tagged BT.709 throughout, as the AVFoundation path is: untagged, players assume BT.601 for
    // the conversion from RGB and the navy comes out a different navy.
    args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      ...(wav ? ['-i', wav, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-shortest'] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', PARTIAL];
  } else {
    const swiftc = onPath('swiftc') || (isFile('/usr/bin/swiftc') && '/usr/bin/swiftc');
    if (process.platform !== 'darwin' || !swiftc) {
      throw new Error('No encoder: install ffmpeg (or set FFMPEG_PATH). The bundled encoder needs macOS and swiftc.');
    }
    name = 'AVFoundation';
    exe = join(work, 'encode-mp4');
    // -suppress-warnings: AVAssetWriter's pull-based API is deprecated in favour of the async one,
    // and says so at length every time. It still works, and the encoder is short.
    const built = spawnSync(swiftc, ['-O', '-suppress-warnings', '-o', exe, join(root, 'scripts', 'encode-mp4.swift')], { stdio: 'inherit' });
    if (built.error || built.status !== 0) throw built.error || new Error('swiftc failed (' + built.status + ')');
    args = [PARTIAL, String(fps)];
    if (wav) args.push(toAac(wav, work));
  }
  const proc = spawn(exe, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('exit', (code, signal) => (code === 0 ? resolve() : reject(new Error(name + ' failed (' + (signal || code) + ')'))));
  });
  // Seen when the encoder dies mid-stream; its exit says why.
  proc.stdin.on('error', () => {});
  return { proc, name, exited };
}

const work = mkdtempSync(join(tmpdir(), 'hrem-video-'));
const stage = await openStage();
let encoder;

/**
 * Gives the picture of the last full render a new soundtrack: the picture is copied, the sound
 * encoded, and nothing is drawn again.
 */
function remux(wav, seconds) {
  const picture = OUT;
  if (!existsSync(picture)) throw new Error('--remux needs a render to take the picture from: store/assets/promo-video.mp4');
  if (!wav) throw new Error('--remux is for a new soundtrack; there is none with --silent');
  const ffmpeg = process.env.FFMPEG_PATH || onPath('ffmpeg');
  const res = ffmpeg
    ? spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', picture, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', PARTIAL], { stdio: 'inherit' })
    : (() => {
      const exe = join(work, 'encode-mp4');
      const swiftc = onPath('swiftc') || '/usr/bin/swiftc';
      const built = spawnSync(swiftc, ['-O', '-suppress-warnings', '-o', exe, join(root, 'scripts', 'encode-mp4.swift')], { stdio: 'inherit' });
      if (built.error || built.status !== 0) throw built.error || new Error('swiftc failed (' + built.status + ')');
      return spawnSync(exe, ['--mux', picture, toAac(wav, work), PARTIAL], { stdio: 'inherit' });
    })();
  if (res.error || res.status !== 0) throw res.error || new Error('could not put the picture and the sound together');
  renameSync(PARTIAL, OUT);
  console.log('wrote ' + OUT.slice(root.length) + ' (' + seconds + 's, the last render\'s picture with this soundtrack)');
}

/** Scores the film, then draws it frame by frame into the encoder. */
async function render() {
  let page = await stage.open('/store/src/video.html', WIDTH, HEIGHT, SCALE);
  const { fps, frames: total, soundtrack } = await page.evaluate(
    '({ fps: window.video.fps, frames: window.video.frames, soundtrack: window.video.soundtrack })');
  const first = Number.isFinite(from) ? Math.max(0, Math.round(from * fps)) : 0;
  const last = Number.isFinite(to) ? Math.min(total, Math.round(to * fps)) : total;
  if (!(last > first)) throw new Error('Nothing to render between ' + from + 's and ' + to + 's.');
  const seconds = ((last - first) / fps).toFixed(1);

  if (flags.has('--script')) {
    console.log(script(soundtrack.narration));
    await page.close();
    return;
  }
  if (take) importTake(take, soundtrack.narration);

  let wav = null;
  if (!flags.has('--silent')) {
    const clips = flags.has('--no-narration') ? null : await speak(soundtrack.narration);
    const { track, summary } = buildSoundtrack(soundtrack, clips);
    console.log(summary);
    if (flags.has('--audio-only')) {
      writeWav(join(root, 'store', 'assets', 'promo-soundtrack.wav'), track, first / fps, last / fps);
      console.log('wrote store/assets/promo-soundtrack.wav (' + seconds + 's)');
      await page.close();
      return;
    }
    wav = join(work, 'soundtrack.wav');
    writeWav(wav, track, first / fps, last / fps);
  }

  if (flags.has('--remux')) {
    await page.close();
    remux(wav, seconds);
    return;
  }
  console.log('rendering ' + (last - first) + ' frames (' + seconds + 's) at ' + WIDTH * SCALE + 'x' + HEIGHT * SCALE + ', ' + fps + ' fps');

  encoder = startEncoder(fps, work, wav);
  // Frames go in as fast as the encoder takes them, and no faster: a full pipe waits for it to
  // drain — or for the encoder to exit, which would otherwise leave that wait unanswered for ever.
  let failed = null;
  encoder.exited.catch((e) => (failed = e));
  let wake = null;
  encoder.proc.on('exit', () => wake?.());
  const feed = (png) => new Promise((resolve) => {
    if (encoder.proc.stdin.write(png)) return resolve();
    wake = resolve;
    encoder.proc.stdin.once('drain', () => {
      wake = null;
      resolve();
    });
  });

  const fresh = async () => {
    await stage.restart();
    page = await stage.open('/store/src/video.html', WIDTH, HEIGHT, SCALE);
  };

  /** Draws frame n and photographs it. A browser that dies costs a restart, not the whole render. */
  const shoot = async (n) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await page.evaluate('window.video.at(' + n + ')');
        return await page.screenshot({ fast: true });
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
    await feed(await shoot(n));
    if (failed) throw failed;
    if (done % fps === 0) console.log('  ' + (done / fps).toFixed(0) + 's of ' + seconds + 's');
  }
  await page.close();

  encoder.proc.stdin.end();
  await encoder.exited;
  renameSync(PARTIAL, OUT);
  const mb = (statSync(OUT).size / 1e6).toFixed(1);
  console.log('wrote ' + OUT.slice(root.length) + ' (' + seconds + 's, ' + mb + ' MB, ' + encoder.name + (wav ? ', with sound' : ', silent') + ')');
}

try {
  await render();
} finally {
  if (encoder && encoder.proc.exitCode === null) encoder.proc.kill();
  rmSync(PARTIAL, { force: true });
  await stage.close();
  rmSync(work, { recursive: true, force: true });
}
