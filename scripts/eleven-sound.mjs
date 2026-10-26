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
//     used as it is, whatever length SOUNDS asks for.
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

// The register of the whole score: what soundtrack.mjs plays, described rather than written.
const STYLE = ['instrumental', 'modern tech product film score', 'warm optimistic electronic pop', 'D major', '88 BPM',
  'soft mallet and marimba plucks', 'airy synth pads', 'round sub bass', 'light crisp drums', 'clean modern production'];
const NEVER = ['vocals', 'singing', 'choir', 'spoken word', 'lyrics', 'distorted guitar', 'aggressive drops'];

/** Each part of the film (scenes in store/src/video.ts) and how the music moves in it. */
const PARTS = [
  ['answer', '[Intro]', ['sparse', 'gentle pads and a single mallet line', 'curious', 'no drums']],
  ['cards', '[Build]', ['plucks join', 'tension rising', 'filtered', 'building to a hit']],
  ['title', '[Reveal]', ['bright', 'open', 'full pad chord', 'soft kick enters', 'hopeful']],
  ['browser', '[Verse]', ['light and simple', 'steady pulse', 'mallet arpeggio', 'relaxed']],
  ['runFrom', '[Groove]', ['driving', 'busy sixteenth-note plucks', 'full drums', 'energetic', 'forward motion']],
  ['open', '[Lift]', ['warm', 'satisfied', 'drums ease back', 'pads swell']],
  ['uses', '[Chorus]', ['uplifting', 'full arrangement', 'confident', 'catchy mallet hook']],
  ['ask', '[Bridge]', ['calmer', 'thoughtful', 'half-time feel', 'reassuring']],
  ['close', '[Outro]', ['resolving on the tonic', 'final chord rings out', 'fading to silence']],
];

/** The music's composition plan: a chunk per part, each as long as that part runs. Another film passes its own tables. */
export function musicRequest(spec, { style = STYLE, never = NEVER, parts = PARTS, seed = 20260917 } = {}) {
  const s = spec.scenes;
  const edges = parts.map(([key]) => s[key] ?? (key === 'answer' ? 0 : undefined));
  if (edges.some((e) => typeof e !== 'number')) throw new Error('The film has no part ' + parts[edges.findIndex((e) => typeof e !== 'number')][0]);
  const total = Math.round(spec.duration * 1000);
  const ms = edges.map((e) => Math.round(e * 1000)).concat(total);
  const chunks = parts.map(([, text, styles], i) => ({
    text,
    duration_ms: ms[i + 1] - ms[i],
    positive_styles: [...style, ...styles],
    negative_styles: never,
    context_adherence: 'high',
  }));
  for (const c of chunks) if (c.duration_ms < 3000) throw new Error('A part of the film is under the 3 s a music chunk needs: ' + c.text);
  return { model_id: MUSIC_MODEL, composition_plan: { chunks }, seed };
}

/** What each kind of effect is asked for as: SOUNDS' kinds, which soundtrack.mjs synthesizes. */
const EFFECTS = {
  pop: { text: 'Soft, clean UI bubble pop, a friendly app notification, short and dry', seconds: 0.5 },
  whoosh: { text: 'Smooth airy whoosh, a clean swish for a screen transition, no impact', seconds: 1 },
  riser: { text: 'Short rising tension swell, a reverse cymbal riser building up, clean', seconds: 1 },
  impact: { text: 'Soft deep cinematic impact, a warm sub boom with a short tail, subtle', seconds: 1.5 },
  suck: { text: 'Quick reverse swoosh, cards being sucked into a folder, a vacuum swoop that ends abruptly', seconds: 1 },
  click: { text: 'A single crisp computer mouse click, close up, dry', seconds: 0.5 },
  tick: { text: 'A tiny soft UI tick, a light glassy tap as a file lands in a list, very short', seconds: 0.5, takes: 4 },
  chime: { text: 'Gentle bright success chime, two rising notes, download complete', seconds: 1.5 },
  shimmer: { text: 'Magical sparkle shimmer, glittering bells swelling and fading, for an end card', seconds: 2 },
};

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
  const out = file(request, 'mp3');
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

export async function elevenSound(spec, options = {}) {
  const imports = (name) => options.useImports === false ? [] : brought(name);
  const definitions = Object.fromEntries(Object.entries(EFFECTS).map(([name, defaults]) =>
    [name, { ...defaults, ...options.effects?.[name] }]));
  const [own] = imports('music');
  if (own) console.log('  music: ' + own.slice(root.length));
  const music = own ? readAudio(own) : await kept(options.music ?? musicRequest(spec), '/music', '?output_format=mp3_48000_192', 'the music (Eleven Music v2.5, ' + spec.duration.toFixed(1) + 's)');
  const takes = new Map();
  for (const s of spec.sounds) {
    const kind = definitions[s.kind];
    if (!kind) throw new Error('No ElevenLabs sound for the effect ' + s.kind + ': add it to EFFECTS in scripts/eleven-sound.mjs');
    const seconds = Math.max(0.5, Math.round((s.dur ?? kind.seconds) * 10) / 10);
    const id = s.kind + '@' + seconds;
    if (takes.has(id)) continue;
    const mine = imports(s.kind);
    if (mine.length) {
      takes.set(id, mine.map(readAudio));
      continue;
    }
    const list = [];
    for (let take = 0; take < (kind.takes ?? 1); take++) {
      // `take` only tells the takes apart in the cache; it is not sent.
      const request = { text: kind.text, duration_seconds: seconds, prompt_influence: 0.6, model_id: options.soundModel ?? SFX_MODEL };
      const out = file({ ...request, take }, 'mp3');
      if (!existsSync(out)) {
        console.log('  asking ElevenLabs for the ' + s.kind + ' (' + seconds + 's' + (kind.takes ? ', take ' + (take + 1) : '') + ')');
        mkdirSync(CACHE, { recursive: true });
        writeFileSync(out, await fetched('/sound-generation', '?output_format=mp3_44100_128', request, 'the ' + s.kind));
      }
      list.push(readAudio(out));
    }
    takes.set(id, list);
  }
  return {
    music,
    effects: (kind, dur, n) => {
      const seconds = Math.max(0.5, Math.round((dur ?? definitions[kind].seconds) * 10) / 10);
      const list = takes.get(kind + '@' + seconds);
      return list[n % list.length];
    },
  };
}
