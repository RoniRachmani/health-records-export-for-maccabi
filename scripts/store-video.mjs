// Renders the Chrome Web Store's promo video into store/assets/promo-video.mp4: store/src/video.ts draws
// one frame at a time in headless Chrome (no real data, the same made-up popup states as the store
// images), and each frame goes straight into an H.264 encoder as it is photographed. Give two times in
// seconds to render only that slice while working on it, e.g. `npm run store-video -- 8 12`.
//
// The soundtrack is mixed from the same timeline (soundtrack.mjs): the narration spoken by ElevenLabs
// (narration.mjs), the music from Eleven Music v2.5 and the effects from ElevenLabs Sound Effects
// (eleven-sound.mjs), brought in by hand or asked for with ELEVENLABS_API_KEY (from the environment or
// .env). It is built before the first frame, so a missing sound costs seconds, not a render.
//   --audio-only    write the soundtrack alone, to store/assets/promo-soundtrack.wav, and stop
//   --no-narration  music and effects only
//   --silent        no soundtrack at all
//   --clip          the popup over a white page instead of the film's ground, and no pointer, for the landing
//                   page's clip
//   --script        print the narration as one take's text, to paste into ElevenLabs, and stop
//   --captions      write the narration as subtitles, to store/assets/promo-captions.srt, and stop: in
//                   phrases timed by word (forced alignment, with ELEVENLABS_API_KEY), else a line per cue,
//                   to upload beside the film
//   --import <file> cut such a take into its lines for the narration (see narration.mjs): on its words with
//                   ELEVENLABS_API_KEY, else at its pauses; then go on
//   --remux         keep the picture of the last render and give it this soundtrack: seconds, not a
//                   render, for trying a sound
//   --synth         soundtrack.mjs's own synthesized music and effects instead of ElevenLabs': nothing to
//                   bring in or pay for
//   --third-film    the Before Thursday draft (store/src/film-story.ts) instead: every output above is named
//                   before-thursday… rather than promo…
//
// The stage is laid out at 1920x1080 and drawn at twice that, so the film is 4K: text, the popup and
// every line drawing are rendered at 3840x2160 rather than scaled up to it, and YouTube gives a 4K
// upload its better codecs at every size it serves, 1080p included.
//
// Encodes with ffmpeg when it is on PATH; otherwise, on macOS, with scripts/encode-mp4.swift,
// compiled on the spot. The store takes a YouTube link rather than a file, so the MP4 this writes
// is what you upload to YouTube (see docs/store-listing.md).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { THIRD_FILM_STEM, thirdFilmSoundOptions } from './film-three-audio.mjs';
import { alignClips, importTake, script, speak } from './narration.mjs';
import { elevenSound } from './eleven-sound.mjs';
import { buildSoundtrack, writeWav } from './soundtrack.mjs';
import { isFile, openStage, root } from './stage.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;
const SCALE = 2;
const THIRD_FILM = process.argv.includes('--third-film');
const STEM = THIRD_FILM ? THIRD_FILM_STEM : 'promo';
const OUT = join(root, 'store', 'assets', THIRD_FILM ? STEM + '.mp4' : 'promo-video.mp4');
// Written here and moved into place only once it is whole, so a failed render leaves the last good film.
const PARTIAL = join(root, 'store', 'assets', THIRD_FILM ? STEM + '.partial.mp4' : 'promo-video.partial.mp4');
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
const OPTIONS = ['--audio-only', '--no-narration', '--silent', '--script', '--captions', '--remux', '--clip', '--synth', '--third-film'];
for (const f of flags) if (!OPTIONS.includes(f)) throw new Error('Unknown option ' + f);
if (THIRD_FILM && flags.has('--clip')) throw new Error('--clip is only supported by the original film');
const PAGE = (THIRD_FILM ? '/store/src/film-story.html' : '/store/src/video.html') + (flags.has('--clip') ? '?clip' : '');
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
      '-c:v', 'libx264', '-preset', THIRD_FILM ? 'medium' : 'slow', '-crf', '16', '-tune', 'animation',
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
  if (!existsSync(picture)) throw new Error('--remux needs a render to take the picture from: ' + OUT.slice(root.length));
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

// A caption's most characters: one line of subtitle as YouTube sets it, so a cue never wraps.
const CUE = 42;

/**
 * A line's words in cues of at most CUE characters: a line too long for one is broken where the two
 * halves come out most even, sooner after a comma or full stop, and each half again if it must be.
 */
function phrases(words) {
  const length = (ws) => ws.map((w) => w.text).join(' ').length;
  const split = (ws) => {
    if (ws.length < 2 || length(ws) <= CUE) return [ws];
    let best = 1;
    let least = Infinity;
    for (let i = 1; i < ws.length; i++) {
      const longer = Math.max(length(ws.slice(0, i)), length(ws.slice(i)));
      const cost = longer + (/[,.;:?!]$/.test(ws[i - 1].text) ? 0 : 12) + (longer > CUE ? 100 : 0);
      if (cost < least) [best, least] = [i, cost];
    }
    return [...split(ws.slice(0, best)), ...split(ws.slice(best))];
  };
  return split(words).map((ws) => ({ text: ws.map((w) => w.text).join(' '), start: ws[0].start, end: ws.at(-1).end }));
}

/**
 * The narration as SubRip subtitles. A line whose words are timed (alignClips) is cued phrase by
 * phrase, each from its first word to its last; one that isn't is cued whole, for as long as its clip.
 */
function captions(clips) {
  const stamp = (t) => {
    const ms = Math.round(t * 1000);
    const part = (n, width = 2) => String(n).padStart(width, '0');
    return part(Math.floor(ms / 3_600_000)) + ':' + part(Math.floor(ms / 60_000) % 60) + ':' + part(Math.floor(ms / 1000) % 60) + ',' + part(ms % 1000, 3);
  };
  const cues = clips.flatMap((c) => c.words
    ? phrases(c.words).map((p) => ({ text: p.text, start: c.at + p.start, end: c.at + p.end }))
    : [{ text: c.text, start: c.at, end: c.at + c.samples.length / c.rate }]);
  return cues.map((cue, i) => {
    // Held a moment after the last word, but never into the next cue.
    const ends = Math.min(cue.end + 0.3, (cues[i + 1]?.start ?? Infinity) - 0.05);
    return (i + 1) + '\n' + stamp(cue.start) + ' --> ' + stamp(ends) + '\n' + cue.text + '\n';
  }).join('\n');
}

/** Scores the film, then draws it frame by frame into the encoder. */
async function render() {
  let page = await stage.open(PAGE, WIDTH, HEIGHT, SCALE);
  const { fps, frames: total, soundtrack, holds = [] } = await page.evaluate(
    '({ fps: window.video.fps, frames: window.video.frames, soundtrack: window.video.soundtrack, holds: window.video.holds })');
  const first = Number.isFinite(from) ? Math.max(0, Math.round(from * fps)) : 0;
  const last = Number.isFinite(to) ? Math.min(total, Math.round(to * fps)) : total;
  if (!(last > first)) throw new Error('Nothing to render between ' + from + 's and ' + to + 's.');
  const seconds = ((last - first) / fps).toFixed(1);

  if (flags.has('--script')) {
    console.log(script(soundtrack.narration));
    await page.close();
    return;
  }
  if (take) await importTake(take, soundtrack.narration);
  if (flags.has('--captions')) {
    writeFileSync(join(root, 'store', 'assets', STEM + '-captions.srt'), captions(await alignClips(await speak(soundtrack.narration))));
    console.log('wrote store/assets/' + STEM + '-captions.srt');
    await page.close();
    return;
  }

  let wav = null;
  if (!flags.has('--silent')) {
    const clips = flags.has('--no-narration') ? null : await speak(soundtrack.narration);
    const synth = flags.has('--synth');
    const { track, summary } = buildSoundtrack(soundtrack, clips, synth ? null : await elevenSound(soundtrack, THIRD_FILM ? thirdFilmSoundOptions(soundtrack) : undefined));
    console.log(summary + (synth ? ', synthesized music and effects' : ', music and effects by ElevenLabs'));
    if (flags.has('--audio-only')) {
      writeWav(join(root, 'store', 'assets', STEM + '-soundtrack.wav'), track, first / fps, last / fps);
      console.log('wrote store/assets/' + STEM + '-soundtrack.wav (' + seconds + 's)');
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

  let shots = 0;
  const fresh = async () => {
    shots = 0;
    await stage.restart();
    page = await stage.open(PAGE, WIDTH, HEIGHT, SCALE);
  };

  /** Draws frame n and photographs it. A browser that dies costs a restart, not the whole render. */
  const shoot = async (n) => {
    if (shots >= PER_BROWSER) await fresh();
    for (let attempt = 1; ; attempt++) {
      try {
        await page.evaluate('window.video.at(' + n + ')');
        const png = await page.screenshot({ fast: true });
        shots++;
        return png;
      } catch (e) {
        if (attempt === TRIES) throw e;
        console.log('  frame ' + n + ': ' + e.message + ' — starting a new browser');
        await fresh();
      }
    }
  };

  let heldPng = null;
  let heldUntil = -1;
  for (let n = first; n < last; n++) {
    const done = n - first;
    // A declared reading hold is visually static. Reuse its PNG while still encoding every
    // frame at the master frame rate; all motion frames are captured normally.
    if (n >= heldUntil) {
      heldPng = null;
      const hold = holds.find(([a, b]) => n >= Math.ceil(a * fps) && n < Math.floor(b * fps));
      if (hold) {
        heldPng = await shoot(n);
        heldUntil = Math.floor(hold[1] * fps);
        // A hold is only declared, so check it: its last frame must draw what its first did. The page's
        // markup, inline styles included, not the PNG, whose bytes differ between two shots of one frame.
        const drawn = () => page.evaluate('document.body.innerHTML');
        const held = await drawn();
        await page.evaluate('window.video.at(' + (heldUntil - 1) + ')');
        if (held !== await drawn()) {
          throw new Error('The hold from ' + hold[0] + 's to ' + hold[1] + 's moves: shorten it or leave it out of window.video.holds');
        }
      }
    }
    await feed(heldPng ?? await shoot(n));
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
