// ElevenLabs music and effects for the retained Before Thursday draft.
import { musicRequest } from './eleven-sound.mjs';
const STYLE = ['instrumental only', 'intimate narrative short film score', 'warm felt piano',
  'subtle chamber strings', 'delicate organic textures', '92 BPM', 'D major',
  'restrained dynamics', 'space for narration'];
const NEVER = ['vocals', 'singing', 'speech', 'lyrics', 'choir', 'trailer booms', 'aggressive drums',
  'cheesy corporate jingle', 'dramatic EDM drops', 'busy lead melody', 'early fade-out', 'silence', 'pauses'];
/** @type {[string, string, string[]][]} */
const PARTS = [
  ['answer', '[Opening]', ['tentative intimate piano', 'curiosity before an appointment']],
  ['cards', '[Gather]', ['soft overlapping plucked patterns', 'years accumulating', 'gentle uncertainty']],
  ['browser', '[Collect]', ['precise muted pulse', 'steady practical forward movement']],
  ['open', '[Keep]', ['breath and space', 'a quiet deliberate choice']],
  ['uses', '[Understand]', ['interlocking piano phrases', 'discovery through connecting details']],
  // The last two keep playing to the end: asked for a resolution and an ending, the music faded out from 46 s and
  // left the film near-silent before its last line.
  ['privacy', '[Reassure]', ['warm and continuous', 'relief and personal confidence', 'carries straight on into the next part']],
  ['close', '[Resolve]', ['simple piano motif over sustained strings', 'full and warm under the last line', 'final chord rings out only in the last two seconds']],
];
/** The draft's file names: before-thursday.mp4, before-thursday-captions.srt and the rest. */
export const BEFORE_THURSDAY_STEM = 'before-thursday';
export function beforeThursdaySoundOptions(spec) {
  return {
    useImports: false,
    soundModel: 'eleven_text_to_sound_v3',
    music: musicRequest(spec, { style: STYLE, never: NEVER, parts: PARTS, seed: 2026102503 }),
    effects: {
      whoosh: { text: 'One understated airy silk swish for a premium documentary screen transition. Smooth short movement, dry and soft, no impact, no music, no voice.' },
      suck: { text: 'A single gentle paper shuffle pulled inward, ending in a soft cloth tap. Refined short folder gathering sound, no loud vacuum, no music, no voice.' },
      click: { text: 'One precise, quiet tactile mouse click. Clean and close, premium interface interaction, no extra clicks, no background sound, no music.' },
      pop: { text: 'A single tiny rounded wooden tap with a soft plucky pop. Restrained friendly interface reveal, dry, no reverb, no music, no speech.' },
      tick: { text: 'One extremely delicate glass and wood tap. A quiet precise detail appearing on a clean interface, short natural decay, no sharp ping, no music.' },
      chime: { text: 'A single soft two-note felt piano and glass success chime, rising gently, warm reassuring completion, natural short decay, no voice, no background music.' },
      shimmer: { text: 'An elegant restrained crystalline shimmer for a final brand reveal. Delicate high glass tones with an airy warm tail, soft and graceful, no dramatic swell, no voice, no background music.' },
    },
  };
}
