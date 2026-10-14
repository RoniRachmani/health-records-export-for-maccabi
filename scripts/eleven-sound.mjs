// The promo video's music and effects, from ElevenLabs (`npm run store-video -- --synth` uses
// soundtrack.mjs's synthesizer instead): the music from Eleven Music v2.5, composed to a plan with one
// chunk per part of the film, so that each part's change of music lands on its cut; and each effect
// in SOUNDS (store/src/video.ts) from its Sound Effects model, one sound per kind and length (a few
// takes of the tick, so a run of files landing doesn't sound like one sample repeated).
//
// Each sound comes one of two ways, as the narration does (narration.mjs):
//
//   - brought in: made anywhere ElevenLabs runs (its web app, or its connector for Claude, which
//     takes a prompt and a length but no composition plan) and saved in .cache/elevenlabs-sound/import/
//     as music.mp3 and <kind>.mp3, or <kind>-1.mp3, <kind>-2.mp3… for several takes. What is there is
//     used as it is, whatever length SOUNDS asks for. Music made without the plan doesn't change where
//     the film cuts, so bring in music.mp3 only when there is no key to compose it with.
//   - asked for over the API, with ELEVENLABS_API_KEY (from the environment or the gitignored .env,
//     which store-video.mjs loads; the music API needs a paid plan), and kept in .cache/elevenlabs-sound/
//     under a hash of the request, so a re-render asks for — and pays for — only what changed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAudio } from './audio-file.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(root, '.cache', 'elevenlabs-sound');
const IMPORT = join(CACHE, 'import');
const API = 'https://api.elevenlabs.io/v1';
const MUSIC_MODEL = 'music_v2_5';
const SFX_MODEL = 'eleven_text_to_sound_v2';
// The best each API offers this plan: Eleven Music's 48 kHz MP3 at 320 kbps, and the effects' MP3 at
// 192 kbps (their PCM above 24 kHz needs the Pro plan).
const MUSIC_FORMAT = 'mp3_48000_320';
const SFX_FORMAT = 'mp3_44100_192';

// The register of the whole score: calm and unhurried, so it sits under the voice rather than
// competing with it — what soundtrack.mjs plays, described rather than written, but softer.
const STYLE = ['instrumental', 'calm ambient underscore', 'gentle warm electronic', 'D major', '76 BPM',
  'soft felt piano and mellow marimba', 'warm airy synth pads', 'soft round bass', 'very light brushed percussion',
  'spacious', 'intimate', 'clean modern production'];
const NEVER = ['vocals', 'singing', 'choir', 'spoken word', 'lyrics', 'distorted guitar', 'aggressive drops',
  'loud drums', 'risers', 'big hits', 'busy arrangement', 'EDM'];

/** Each part of the film (scenes in store/src/video.ts) and how the music moves in it: small changes, never loud. */
const PARTS = [
  ['answer', '[Intro]', ['sparse', 'a soft pad and a few felt piano notes', 'curious', 'no percussion']],
  ['cards', '[Build]', ['a gentle marimba pulse joins', 'slowly opening up', 'still soft']],
  ['title', '[Reveal]', ['warm', 'open pad chord', 'hopeful', 'soft bass enters']],
  ['browser', '[Verse]', ['light and simple', 'steady gentle pulse', 'unhurried piano arpeggio', 'relaxed']],
  ['runFrom', '[Groove]', ['quietly moving forward', 'soft flowing marimba arpeggios', 'light brushed percussion', 'calm focus']],
  ['open', '[Lift]', ['warm', 'content', 'percussion drops out', 'pads swell gently']],
  ['uses', '[Chorus]', ['warm and reassuring', 'fuller but still soft', 'tender piano melody']],
  ['ask', '[Bridge]', ['calm', 'thoughtful', 'sparse piano and pad', 'reassuring']],
  ['close', '[Outro]', ['resolving on the tonic', 'final soft chord rings out', 'fading to silence']],
];

/** The music's composition plan: a chunk per part, each as long as that part runs. */
export function musicRequest(spec) {
  const s = spec.scenes;
  const edges = PARTS.map(([key]) => s[key] ?? (key === 'answer' ? 0 : undefined));
  if (edges.some((e) => typeof e !== 'number')) throw new Error('The film has no part ' + PARTS[edges.findIndex((e) => typeof e !== 'number')][0]);
  const total = Math.round(spec.duration * 1000);
  const ms = edges.map((e) => Math.round(e * 1000)).concat(total);
  const chunks = PARTS.map(([, text, styles], i) => ({
    text,
    duration_ms: ms[i + 1] - ms[i],
    positive_styles: [...STYLE, ...styles],
    negative_styles: NEVER,
    context_adherence: 'high',
  }));
  for (const c of chunks) if (c.duration_ms < 3000) throw new Error('A part of the film is under the 3 s a music chunk needs: ' + c.text);
  return { model_id: MUSIC_MODEL, composition_plan: { chunks }, seed: 20260917 };
}

/** What each kind of effect is asked for as: SOUNDS' kinds, which soundtrack.mjs synthesizes. All soft and close, nothing cinematic. */
const EFFECTS = {
  pop: { text: 'Very soft, muted UI bubble pop, gentle and quiet, short and dry', seconds: 0.5 },
  whoosh: { text: 'Soft gentle air swish, a quiet breath of wind for a calm screen transition, no impact', seconds: 1 },
  riser: { text: 'Soft gentle swell, a quiet airy pad rising slowly, calm, no cymbal', seconds: 1 },
  impact: { text: 'Soft low warm thump, a gentle muted felt bass note with a short soft tail, quiet', seconds: 1.5 },
  suck: { text: 'Gentle soft swoosh, paper cards sliding softly into a folder, quiet and smooth', seconds: 1 },
  click: { text: 'A single soft quiet mouse click, close up, gentle, dry', seconds: 0.5 },
  tick: { text: 'A tiny very soft UI tick, a quiet muted wooden tap as a file lands in a list, very short', seconds: 0.5, takes: 4 },
  chime: { text: 'Soft gentle success chime, two warm mellow rising notes on a felt marimba, calm', seconds: 1.5 },
  shimmer: { text: 'Soft gentle shimmer, a few quiet warm bell tones fading slowly, calm end card', seconds: 2 },
};

// The recorded effects sit this much below the synthesized ones they are matched to: calmer than the score's.
const EFFECTS_TRIM_DB = -3;

function file(request, ext) {
  const id = createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 24);
  return join(CACHE, id + '.' + ext);
}

async function fetched(path, query, request, what) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('No ' + what + ' kept yet, and no ELEVENLABS_API_KEY to ask for it: put ELEVENLABS_API_KEY=… in .env (gitignored).');
  const res = await fetch(API + path + query, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error('ElevenLabs refused the ' + what + ' (' + res.status + '): ' + (await res.text()).slice(0, 600));
  return Buffer.from(await res.arrayBuffer());
}

async function kept(request, path, query, what) {
  const out = file({ ...request, query }, 'mp3');
  if (!existsSync(out)) {
    console.log('  asking ElevenLabs for ' + what);
    const body = await fetched(path, query, request, what);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(out, body);
  }
  return readAudio(out);
}

/**
 * The music and effects for `spec` (window.video.soundtrack), as soundtrack.mjs's buildSoundtrack
 * takes them: { music: { rate, l, r }, effects: (kind, dur, n) => { rate, l, r } }.
 */
/** The takes of `name` brought in by hand, in order: name.mp3, then name-1.mp3, name-2.mp3… */
function brought(name) {
  if (!existsSync(IMPORT)) return [];
  const pattern = new RegExp('^' + name + '(?:-(\\d+))?\\.(?:mp3|wav|m4a)$');
  return readdirSync(IMPORT)
    .map((f) => [f, f.match(pattern)])
    .filter(([, m]) => m)
    .sort(([, a], [, b]) => Number(a[1] ?? 0) - Number(b[1] ?? 0))
    .map(([f]) => join(IMPORT, f));
}

export async function elevenSound(spec) {
  const [own] = brought('music');
  if (own) console.log('  music: ' + own.slice(root.length));
  const music = own ? readAudio(own) : await kept(musicRequest(spec), '/music', '?output_format=' + MUSIC_FORMAT, 'the music (Eleven Music v2.5, ' + spec.duration.toFixed(1) + 's)');
  const takes = new Map();
  for (const s of spec.sounds) {
    const kind = EFFECTS[s.kind];
    if (!kind) throw new Error('No ElevenLabs sound for the effect ' + s.kind + ': add it to EFFECTS in scripts/eleven-sound.mjs');
    const seconds = Math.max(0.5, Math.round((s.dur ?? kind.seconds) * 10) / 10);
    const id = s.kind + '@' + seconds;
    if (takes.has(id)) continue;
    const mine = brought(s.kind);
    if (mine.length) {
      takes.set(id, mine.map(readAudio));
      continue;
    }
    const list = [];
    for (let take = 0; take < (kind.takes ?? 1); take++) {
      // `take` only tells the takes apart in the cache; it is not sent.
      const request = { text: kind.text, duration_seconds: seconds, prompt_influence: 0.6, model_id: SFX_MODEL };
      const out = file({ ...request, take, format: SFX_FORMAT }, 'mp3');
      if (!existsSync(out)) {
        console.log('  asking ElevenLabs for the ' + s.kind + ' (' + seconds + 's' + (kind.takes ? ', take ' + (take + 1) : '') + ')');
        mkdirSync(CACHE, { recursive: true });
        writeFileSync(out, await fetched('/sound-generation', '?output_format=' + SFX_FORMAT, request, 'the ' + s.kind));
      }
      list.push(readAudio(out));
    }
    takes.set(id, list);
  }
  return {
    music,
    trim: EFFECTS_TRIM_DB,
    effects: (kind, dur, n) => {
      const seconds = Math.max(0.5, Math.round((dur ?? EFFECTS[kind].seconds) * 10) / 10);
      const list = takes.get(kind + '@' + seconds);
      return list[n % list.length];
    },
  };
}
