// The promo video's narration (NARRATION in store/src/video.ts), spoken by ElevenLabs and kept a line
// at a time in .cache/narration/ (gitignored), so a re-render asks for — and pays for — only the
// lines that changed. A line gets there one of two ways:
//
//   - asked for over the API, which needs ELEVENLABS_API_KEY (from the environment or a gitignored
//     .env at the repository root; store-video.mjs loads it). Only the line itself is sent, with the
//     lines either side of it so the delivery flows between them.
//   - cut from one take of the whole script, made anywhere ElevenLabs runs — its web app, or its
//     connector for Claude — with the text `npm run store-video -- --script` prints, and brought in
//     with `npm run store-video -- --import <take>`. One take keeps the delivery even from line to
//     line; the script puts a second's pause between lines, which is where it is cut.
//
// ELEVENLABS_VOICE (a voice id) and ELEVENLABS_MODEL override the voice and the model below.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(root, '.cache', 'narration');
const API = 'https://api.elevenlabs.io/v1';

// Vino, from ElevenLabs' Voice Library: a warm, calm American narrator. Library voices like this one
// need its Creator plan or above; Brian (nPczCjzI2devNBz1zQrb), one of its own voices, works on any.
const VOICE = process.env.ELEVENLABS_VOICE || '0eoTRDoAaymfOXt2wp08';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true };
// Asked for so the same line comes back the same way; ElevenLabs treats it as best effort.
const SEED = 20260917;
// Raw 16-bit PCM, at 44.1 kHz where the plan allows it and 24 kHz where it doesn't; soundtrack.mjs
// resamples either to the film's rate.
const FORMATS = [['pcm_44100', 44100], ['pcm_24000', 24000]];

/** Where a line's clip is kept: by voice and words, whichever way it was made. */
function cached(text) {
  const id = createHash('sha256').update(JSON.stringify({ voice: VOICE, text })).digest('hex').slice(0, 24);
  return { pcm: join(CACHE, id + '.pcm'), meta: join(CACHE, id + '.json') };
}

function keep(text, pcm, rate, source) {
  mkdirSync(CACHE, { recursive: true });
  const file = cached(text);
  writeFileSync(file.pcm, pcm);
  writeFileSync(file.meta, JSON.stringify({ voice: VOICE, model: MODEL, rate, source, text }, null, 2) + '\n');
}

/** A clip as the soundtrack takes it: mono samples in -1..1, at `rate`. */
function clip(pcm, rate) {
  const samples = new Float32Array(pcm.length >> 1);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return { rate, samples };
}

async function ask(key, request) {
  let refused = '';
  for (const [format, rate] of FORMATS) {
    const res = await fetch(API + '/text-to-speech/' + encodeURIComponent(VOICE) + '?output_format=' + format, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (res.ok) return { pcm: Buffer.from(await res.arrayBuffer()), rate };
    const why = (await res.text()).slice(0, 400);
    // A plan without 44.1 kHz output says so about the format; anything else is a real failure.
    if ((res.status === 400 || res.status === 403 || res.status === 422) && /format|tier|subscription|plan/i.test(why)) {
      refused = format + ': ' + why;
      continue;
    }
    throw new Error('ElevenLabs refused "' + request.text + '" (HTTP ' + res.status + '): ' + why);
  }
  throw new Error('ElevenLabs offered none of ' + FORMATS.map(([f]) => f).join(', ') + '. Last: ' + refused);
}

/**
 * The narration, spoken: one clip per line, in order, each { at, text, rate, samples }. Lines
 * already in the cache cost nothing; the rest need ELEVENLABS_API_KEY.
 */
export async function speak(lines) {
  const out = [];
  let fetched = 0;
  for (let i = 0; i < lines.length; i++) {
    const file = cached(lines[i].text);
    if (!existsSync(file.pcm) || !existsSync(file.meta)) {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) {
        throw new Error('No narration for "' + lines[i].text + '". Bring in a take of the script (npm run store-video -- ' +
          '--script, then --import <take>), or put ELEVENLABS_API_KEY=… in .env (gitignored) to have it spoken ' +
          'line by line; or render without a voice: npm run store-video -- --no-narration');
      }
      const request = {
        text: lines[i].text,
        model_id: MODEL,
        voice_settings: SETTINGS,
        seed: SEED,
        previous_text: lines[i - 1]?.text,
        next_text: lines[i + 1]?.text,
      };
      const { pcm, rate } = await ask(key, request);
      keep(lines[i].text, pcm, rate, 'api');
      fetched++;
    }
    const { rate } = JSON.parse(readFileSync(file.meta, 'utf8'));
    out.push({ at: lines[i].at, text: lines[i].text, ...clip(readFileSync(file.pcm), rate) });
  }
  console.log('narration: ' + lines.length + ' lines, ' + fetched + ' spoken now, ' + (lines.length - fetched) + ' from the cache');
  return out;
}

// ---- one take of the whole script --------------------------------------------
const PAUSE = 1.0;

/** The script as one take: the lines with a pause between each, to paste into ElevenLabs. */
export function script(lines) {
  return lines.map((l) => l.text).join(' <break time="' + PAUSE.toFixed(1) + 's" /> ');
}

/** Any audio file as 16-bit mono PCM at its own rate, by ffmpeg or, on macOS, afconvert. */
function decode(file) {
  const work = mkdtempSync(join(tmpdir(), 'hrem-take-'));
  try {
    const wav = join(work, 'take.wav');
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
    let res = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    if (res.error || res.status !== 0) res = spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16', '-c', '1', file, wav]);
    if (res.error || res.status !== 0) throw new Error('Could not read ' + file + ': it needs ffmpeg, or afconvert on macOS.');
    const buf = readFileSync(wav);
    // Walk the RIFF chunks for the format and the samples.
    let rate = 0;
    for (let at = 12; at + 8 <= buf.length;) {
      const id = buf.toString('ascii', at, at + 4);
      const size = buf.readUInt32LE(at + 4);
      if (id === 'fmt ') rate = buf.readUInt32LE(at + 12);
      if (id === 'data') return { rate, pcm: buf.subarray(at + 8, at + 8 + size) };
      at += 8 + size + (size % 2);
    }
    throw new Error(file + ' decoded to no samples');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Cuts one take of the script into its lines, at the pauses between them, and keeps each as the
 * clip for its line. The cuts go in the longest silences; a take whose silences don't separate
 * into one per gap — a line read twice, a pause left out — is refused rather than guessed at.
 */
export function importTake(file, lines) {
  const { rate, pcm } = decode(file);
  const n = pcm.length >> 1;
  const at = (i) => pcm.readInt16LE(i * 2) / 32768;
  const frame = Math.round(rate / 100);
  const level = [];
  for (let f = 0; f * frame < n; f++) {
    let sum = 0;
    for (let i = f * frame; i < Math.min(n, (f + 1) * frame); i++) sum += at(i) ** 2;
    level.push(Math.sqrt(sum / frame));
  }
  const quiet = Math.max(...level) * 10 ** (-42 / 20);
  const speaking = level.map((v) => v > quiet);
  const first = speaking.indexOf(true);
  const last = speaking.lastIndexOf(true);
  const gaps = [];
  for (let f = first; f <= last;) {
    if (speaking[f]) {
      f++;
      continue;
    }
    const start = f;
    while (f <= last && !speaking[f]) f++;
    gaps.push({ start, end: f, frames: f - start });
  }
  const cuts = [...gaps].sort((a, b) => b.frames - a.frames).slice(0, lines.length - 1).sort((a, b) => a.start - b.start);
  const shortest = Math.min(...cuts.map((c) => c.frames)) / 100;
  const longestLeft = Math.max(0, ...gaps.filter((g) => !cuts.includes(g)).map((g) => g.frames)) / 100;
  if (cuts.length !== lines.length - 1 || shortest < PAUSE * 0.6 || longestLeft > shortest * 0.8) {
    throw new Error('Could not find ' + (lines.length - 1) + ' clear pauses in ' + file + ' (the shortest cut is ' +
      shortest.toFixed(2) + 's, the longest pause left in a line ' + longestLeft.toFixed(2) + 's). Is it a take of ' +
      'the current script (npm run store-video -- --script)?');
  }
  const bounds = [first, ...cuts.flatMap((c) => [c.start, c.end]), last + 1];
  const report = [];
  lines.forEach((line, i) => {
    // A little room either side of the words: before the first consonant, and for the last to fade.
    const from = Math.max(0, bounds[2 * i] * frame - Math.round(0.04 * rate));
    const to = Math.min(n, bounds[2 * i + 1] * frame + Math.round(0.15 * rate));
    keep(line.text, pcm.subarray(from * 2, to * 2), rate, 'take');
    report.push(((to - from) / rate).toFixed(2) + 's  ' + line.text);
  });
  console.log('imported ' + lines.length + ' lines from ' + file + ' (' + rate + ' Hz; pauses cut ' + shortest.toFixed(2) + 's and longer):');
  for (const r of report) console.log('  ' + r);
}
