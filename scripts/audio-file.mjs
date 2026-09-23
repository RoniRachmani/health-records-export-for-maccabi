// Reads an audio file (a take of the narration from ElevenLabs, say, as narration.mjs brings in) as
// float samples, by ffmpeg when it is on PATH and otherwise, on macOS, by afconvert. Mono comes back
// in both channels.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The file as { rate, l, r }: 32-bit float samples at the file's own rate. */
export function readAudio(file) {
  const work = mkdtempSync(join(tmpdir(), 'hrem-audio-'));
  try {
    const wav = join(work, 'audio.wav');
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
    let res = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', file, '-ac', '2', '-c:a', 'pcm_f32le', wav]);
    if (res.error || res.status !== 0) res = spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32', '-c', '2', file, wav]);
    if (res.error || res.status !== 0) throw new Error('Could not read ' + file + ': it needs ffmpeg, or afconvert on macOS.');
    const buf = readFileSync(wav);
    // Walk the RIFF chunks for the format and the samples.
    let rate = 0;
    for (let at = 12; at + 8 <= buf.length;) {
      const id = buf.toString('ascii', at, at + 4);
      const size = buf.readUInt32LE(at + 4);
      if (id === 'fmt ') rate = buf.readUInt32LE(at + 12);
      if (id === 'data') {
        const n = Math.floor(size / 8);
        const l = new Float32Array(n);
        const r = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          l[i] = buf.readFloatLE(at + 8 + i * 8);
          r[i] = buf.readFloatLE(at + 12 + i * 8);
        }
        return { rate, l, r };
      }
      at += 8 + size + (size % 2);
    }
    throw new Error(file + ' decoded to no samples');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
