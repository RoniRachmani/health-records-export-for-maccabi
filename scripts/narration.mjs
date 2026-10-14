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
// With ELEVENLABS_API_KEY, a take is cut on its words instead: ElevenLabs' forced alignment times each
// word of the script in the take, and each line runs from its first word to its last, however the
// pauses came out. A clip keeps its words' times beside it, which the captions are timed from; a
// clip that has none is aligned when the captions are written, with the key, or captioned whole.
//
// ELEVENLABS_VOICE (a voice id) and ELEVENLABS_MODEL override the voice and the model below. Set them
// the same way for --script, --import and the render: a clip is kept under the voice and model that spoke it.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAudio } from './audio-file.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(root, '.cache', 'narration');
const API = 'https://api.elevenlabs.io/v1';

// Emma (Professional Commercial Voice), from ElevenLabs' Voice Library: a clear, confident American narrator. Library voices like this one
// need its Creator plan or above; Brian (nPczCjzI2devNBz1zQrb), one of its own voices, works on any.
const VOICE = process.env.ELEVENLABS_VOICE || '9HBoEQ8LqyvVZFYDodnr';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v4';
// v3 and v4 take their direction from the text (audio tags, punctuation) and have only stability and
// similarity to set; they take no SSML, so a pause is an audio tag. Their docs don't list the neighbouring
// lines or a seed either, so a line asked for over the API goes on its own.
const TAGGED = /^eleven_v[34]/.test(MODEL);
const SETTINGS = TAGGED
  ? { stability: 0.5, similarity_boost: 0.75 }
  : { stability: 0.55, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true };
// Asked for so the same line comes back the same way; ElevenLabs treats it as best effort.
const SEED = 20260917;
// Raw 16-bit PCM, at 44.1 kHz where the plan allows it and 24 kHz where it doesn't; soundtrack.mjs
// resamples either to the film's rate.
const FORMATS = [['pcm_44100', 44100], ['pcm_24000', 24000]];

/** Where a line's clip is kept: by voice, model and words, whichever way it was made. */
function cached(text) {
  const id = createHash('sha256').update(JSON.stringify({ voice: VOICE, model: MODEL, text })).digest('hex').slice(0, 24);
  return { pcm: join(CACHE, id + '.pcm'), meta: join(CACHE, id + '.json') };
}

function keep(text, pcm, rate, source, words) {
  mkdirSync(CACHE, { recursive: true });
  const file = cached(text);
  writeFileSync(file.pcm, pcm);
  writeFileSync(file.meta, JSON.stringify({ voice: VOICE, model: MODEL, rate, source, text, ...(words ? { words } : {}) }, null, 2) + '\n');
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
        ...(TAGGED ? {} : { seed: SEED, previous_text: lines[i - 1]?.text, next_text: lines[i + 1]?.text }),
      };
      const { pcm, rate } = await ask(key, request);
      keep(lines[i].text, pcm, rate, 'api');
      fetched++;
    }
    const { rate, words } = JSON.parse(readFileSync(file.meta, 'utf8'));
    out.push({ at: lines[i].at, text: lines[i].text, words, ...clip(readFileSync(file.pcm), rate) });
  }
  console.log('narration: ' + lines.length + ' lines, ' + fetched + ' spoken now, ' + (lines.length - fetched) + ' from the cache');
  return out;
}

// ---- forced alignment --------------------------------------------------------
/** What is spoken of a line: its words, without the audio tags that direct them. */
const spoken = (text) => text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

/** 16-bit mono PCM as a WAV file, which is how a clip goes to the aligner. */
function wav(pcm, rate) {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/**
 * Each word of `text` (split on spaces, as the captions show it) with the second it starts and ends
 * in the audio, from ElevenLabs' forced alignment. Read from the aligner's characters when they match
 * the text one for one, else from its words when there are as many; otherwise it is refused.
 */
async function align(key, pcm, rate, text) {
  const form = new FormData();
  form.append('file', new Blob([wav(pcm, rate)], { type: 'audio/wav' }), 'narration.wav');
  form.append('text', text);
  const res = await fetch(API + '/forced-alignment', { method: 'POST', headers: { 'xi-api-key': key }, body: form });
  if (!res.ok) throw new Error('ElevenLabs could not align "' + text.slice(0, 60) + '…" (HTTP ' + res.status + '): ' + (await res.text()).slice(0, 400));
  const { characters = [], words = [] } = await res.json();
  const tokens = [...text.matchAll(/\S+/g)];
  if (characters.length === text.length) {
    return tokens.map((t) => ({ text: t[0], start: characters[t.index].start, end: characters[t.index + t[0].length - 1].end }));
  }
  const said = words.filter((w) => w.text.trim());
  if (said.length === tokens.length) return tokens.map((t, i) => ({ text: t[0], start: said[i].start, end: said[i].end }));
  throw new Error('ElevenLabs aligned ' + said.length + ' words to ' + tokens.length + ' in "' + text.slice(0, 60) + '…"');
}

const round = (t) => Math.round(t * 1000) / 1000;

/**
 * Gives each clip its words' times, aligning the ones the cache has none for (and keeping them, so
 * that is asked once). Without ELEVENLABS_API_KEY those clips are left as they are.
 */
export async function alignClips(clips) {
  const key = process.env.ELEVENLABS_API_KEY;
  let aligned = 0;
  for (const c of clips) {
    if (c.words || !key) continue;
    const file = cached(c.text);
    const meta = JSON.parse(readFileSync(file.meta, 'utf8'));
    const words = (await align(key, readFileSync(file.pcm), meta.rate, spoken(c.text)))
      .map((w) => ({ text: w.text, start: round(w.start), end: round(w.end) }));
    writeFileSync(file.meta, JSON.stringify({ ...meta, words }, null, 2) + '\n');
    c.words = words;
    aligned++;
  }
  const missing = clips.filter((c) => !c.words).length;
  console.log('captions: ' + aligned + ' lines aligned now' +
    (missing ? ', ' + missing + ' captioned whole (put ELEVENLABS_API_KEY in .env to time them by word)' : ''));
  return clips;
}

// ---- one take of the whole script --------------------------------------------
const PAUSE = 1.0;

/** The script as one take: the lines with a pause between each, to paste into ElevenLabs. */
export function script(lines) {
  return lines.map((l) => l.text).join(TAGGED ? ' [long pause] ' : ' <break time="' + PAUSE.toFixed(1) + 's" /> ');
}

/**
 * Cuts one take of the script into its lines and keeps each as the clip for its line. With
 * ELEVENLABS_API_KEY the take is aligned to the script and cut on its words; without, at the pauses.
 */
export async function importTake(file, lines) {
  const { rate, l, r } = readAudio(file);
  const n = l.length;
  // Kept as 16-bit mono, as the API sends it.
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(((l[i] + r[i]) / 2) * 32767))), i * 2);
  const key = process.env.ELEVENLABS_API_KEY;
  const { spans, how } = key ? await onWords(key, pcm, rate, lines) : onPauses(pcm, rate, lines, file);
  const report = [];
  lines.forEach((line, i) => {
    const { from, to, words } = spans[i];
    const clipWords = words?.map((w) => ({ text: w.text, start: round(w.start - from / rate), end: round(w.end - from / rate) }));
    keep(line.text, pcm.subarray(from * 2, to * 2), rate, 'take', clipWords);
    report.push(((to - from) / rate).toFixed(2) + 's  ' + line.text);
  });
  console.log('imported ' + lines.length + ' lines from ' + file + ' (' + rate + ' Hz; ' + how + '):');
  for (const r of report) console.log('  ' + r);
}

/**
 * The take aligned to the script, and each line from just before its first word to just after its
 * last: a little room for the first consonant and for the last word to fade, but never past halfway
 * to the next line's words.
 */
async function onWords(key, pcm, rate, lines) {
  const texts = lines.map((line) => spoken(line.text));
  const words = await align(key, pcm, rate, texts.join(' '));
  const spans = [];
  let w = 0;
  for (const text of texts) {
    const count = text.split(' ').length;
    spans.push({ words: words.slice(w, w + count) });
    w += count;
  }
  const n = pcm.length >> 1;
  spans.forEach((span, i) => {
    const first = span.words[0].start;
    const last = span.words[span.words.length - 1].end;
    const before = i ? (spans[i - 1].words.at(-1).end + first) / 2 : 0;
    const after = i < spans.length - 1 ? (last + spans[i + 1].words[0].start) / 2 : n / rate;
    if (!(last > first)) throw new Error('The take has no time for "' + lines[i].text + '". Is it a take of the current script?');
    span.from = Math.max(0, Math.round(Math.max(before, first - 0.08) * rate));
    span.to = Math.min(n, Math.round(Math.min(after, last + 0.2) * rate));
  });
  return { spans, how: 'cut on its words, aligned by ElevenLabs' };
}

/**
 * The take cut at its pauses. The cuts go in the longest silences; a take whose silences don't
 * separate into one per gap — a line read twice, a pause left out — is refused rather than guessed at.
 */
function onPauses(pcm, rate, lines, file) {
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
  // A little room either side of the words: before the first consonant, and for the last to fade.
  const spans = lines.map((_, i) => ({
    from: Math.max(0, bounds[2 * i] * frame - Math.round(0.04 * rate)),
    to: Math.min(n, bounds[2 * i + 1] * frame + Math.round(0.15 * rate)),
  }));
  return { spans, how: 'pauses cut ' + shortest.toFixed(2) + 's and longer' };
}
