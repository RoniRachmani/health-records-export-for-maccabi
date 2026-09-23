// The promo video's soundtrack, scored from the film's own timeline (store/src/video.ts hands it over
// as window.video.soundtrack): a music bed written to its parts, the sound of what happens on
// screen, and the narration (narration.mjs), mixed to YouTube's loudness. The music and the effects
// are synthesized here from oscillators and seeded noise — no sample, loop or recording, so there
// is nothing to license — and the same timeline always gives the same audio.
//
// Levels: the voice is set to -16 LUFS, the music to -25 LUFS and dipped 9 dB whenever the voice is
// speaking, the effects sit between the two, and the whole mix is brought to -14 LUFS (what YouTube
// plays at) under a limiter that keeps peaks below -1 dBFS.
import { writeFileSync } from 'node:fs';

export const RATE = 48000;
const TAU = Math.PI * 2;
const dB = (d) => 10 ** (d / 20);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Seeded noise, so the same film always gets the same hiss. */
function noise(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** The left and right gains of an equal-power pan, from -1 (left) to 1 (right). */
const panned = (pan) => [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];

class Stereo {
  constructor(length) {
    this.l = new Float32Array(length);
    this.r = new Float32Array(length);
  }
  /** Adds a sample at i, panned from -1 (left) to 1 (right) at equal power. */
  add(i, v, pan = 0) {
    const [gl, gr] = panned(pan);
    this.put(i, v, gl, gr);
  }
  /** add(), with the pan's two gains worked out beforehand, for the inner loops. */
  put(i, v, gl, gr) {
    if (i < 0 || i >= this.l.length) return;
    this.l[i] += v * gl;
    this.r[i] += v * gr;
  }
  mix(other, gain = 1) {
    for (let i = 0; i < this.l.length; i++) {
      this.l[i] += other.l[i] * gain;
      this.r[i] += other.r[i] * gain;
    }
  }
  scale(gain) {
    for (let i = 0; i < this.l.length; i++) {
      this.l[i] *= gain;
      this.r[i] *= gain;
    }
  }
}

/** The RBJ cookbook's biquad. */
class Biquad {
  constructor(type, f, q = 0.707, gain = 0) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, f, q, gain);
  }
  set(type, f, q = 0.707, gain = 0) {
    const w = TAU * Math.min(f, RATE * 0.45) / RATE;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const A = 10 ** (gain / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else if (type === 'bandpass') {
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else if (type === 'highshelf') {
      const r = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cos + r); b1 = -2 * A * ((A - 1) + (A + 1) * cos); b2 = A * ((A + 1) + (A - 1) * cos - r);
      a0 = (A + 1) - (A - 1) * cos + r; a1 = 2 * ((A - 1) - (A + 1) * cos); a2 = (A + 1) - (A - 1) * cos - r;
    } else if (type === 'peak') {
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
    } else {
      throw new Error('no such filter: ' + type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** A band-limited sawtooth's correction at a wrap (PolyBLEP), so the pads don't alias. */
function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

// ---- the music ---------------------------------------------------------------
// D major, I–vi–IV–V with added tones, voiced close so the pad moves by step. Eighteen bars from the
// first card to the closing card, so the bar lines fall on the film's own cuts: the loop four times,
// then IV–V under the assistant, resolving on the closing card.
const CHORDS = {
  D: { pad: [57, 61, 64, 66], root: 50, bass: 38 },
  Bm: { pad: [57, 61, 62, 66], root: 47, bass: 35 },
  G: { pad: [57, 59, 62, 66], root: 43, bass: 31 },
  A: { pad: [57, 59, 62, 64], root: 45, bass: 33 },
};
const LOOP = ['D', 'Bm', 'G', 'A'];
const BARS = 18;
const ARP = [0, 2, 3, 4, 2, 3, 1, 3];

function grid(scenes) {
  const start = 0.1;
  const bar = (scenes.close - start) / BARS;
  return {
    bar,
    beat: bar / 4,
    at: (b, beat = 0) => start + b * bar + beat * (bar / 4),
    chord: (b) => CHORDS[b >= BARS ? 'D' : b >= 16 ? LOOP[b - 14] : LOOP[b % 4]],
  };
}

/** Which part of the film a second falls in, for the arrangement. */
function partAt(t, s) {
  if (t < s.title) return 'hook';
  if (t < s.browser) return 'title';
  if (t < s.runFrom) return 'start';
  if (t < s.open) return 'run';
  if (t < s.privacy) return 'zip';
  if (t < s.ask) return 'privacy';
  if (t < s.close) return 'ask';
  return 'end';
}

function pad(length, g, s) {
  const bus = new Stereo(length);
  const rand = noise(11);
  // Every bar, then the tonic held to the end.
  for (let b = 0; b <= BARS; b++) {
    const from = g.at(b);
    const to = b === BARS ? s.end : g.at(b + 1);
    const attack = b === 0 ? 1.6 : 0.5;
    const release = 1.4;
    const chord = g.chord(b);
    // The root an octave under the voicing, quieter, to fill the low middle.
    for (const [note, loud] of [...chord.pad.map((n) => [n, 1]), [chord.root, 0.6]]) {
      [-0.11, 0, 0.11].forEach((detune, k) => {
        const f = hz(note + detune);
        const dt = f / RATE;
        let phase = (rand() + 1) / 2;
        const [gl, gr] = panned((k - 1) * 0.55);
        const i0 = Math.round(from * RATE);
        const i1 = Math.round((to + release) * RATE);
        for (let i = i0; i < i1; i++) {
          const t = i / RATE - from;
          const held = to - from;
          const env = Math.min(1, t / attack) * (t < held ? 1 : Math.max(0, 1 - (t - held) / release));
          const saw = 2 * phase - 1 - blep(phase, dt);
          bus.put(i, saw * env * 0.05 * loud, gl, gr);
          phase += dt;
          if (phase >= 1) phase -= 1;
        }
      });
    }
  }
  // Soft in the opening, opening up while the export runs, closing again for the quiet parts.
  const cutoff = { hook: 1300, title: 1900, start: 2300, run: 3400, zip: 2700, privacy: 1700, ask: 2000, end: 2300 };
  const fl = new Biquad('lowpass', 1300, 0.65);
  const fr = new Biquad('lowpass', 1300, 0.65);
  let f = cutoff.hook;
  for (let i = 0; i < length; i++) {
    if (i % 128 === 0) {
      const target = cutoff[partAt(i / RATE, s)];
      f += (target - f) * 0.04; // eased, so a cut never snaps the filter
      fl.set('lowpass', f, 0.65);
      fr.set('lowpass', f, 0.65);
    }
    bus.l[i] = fl.run(bus.l[i]);
    bus.r[i] = fr.run(bus.r[i]);
  }
  return bus;
}

/**
 * A soft mallet: a sine with quieter overtones, each dying away faster than the one below, the
 * highest only there for the strike.
 */
function mallet(bus, at, midi, vel, pan, tau = 0.5) {
  const f = hz(midi);
  const partials = [[1, 1, 1], [2, 0.34, 0.6], [3.98, 0.12, 0.3], [6.27, 0.06, 0.08]].filter(([r]) => f * r < RATE * 0.45);
  const i0 = Math.round(at * RATE);
  const n = Math.round(tau * 6 * RATE);
  const [gl, gr] = panned(pan);
  for (let j = 0; j < n; j++) {
    const t = j / RATE;
    const onset = Math.min(1, t / 0.004);
    let v = 0;
    for (const [ratio, amp, life] of partials) v += Math.sin(TAU * f * ratio * t) * amp * Math.exp(-t / (tau * life));
    bus.put(i0 + j, v * onset * vel, gl, gr);
  }
}

function plucks(length, g, s) {
  const bus = new Stereo(length);
  // Per part: how many notes a bar (4 = quarters, 8 = eighths) and how hard.
  const feel = { hook: [4, 0.5], title: [8, 0.55], start: [8, 0.6], run: [8, 0.72], zip: [8, 0.6], privacy: [4, 0.5], ask: [8, 0.55] };
  for (let b = 0; b < BARS; b++) {
    const chord = g.chord(b);
    const tones = [...chord.pad.map((n) => n + 12), chord.bass + 36].sort((x, y) => x - y);
    for (let step = 0; step < 8; step++) {
      const at = g.at(b, step / 2);
      const [per, vel] = feel[partAt(at + 0.01, s)];
      if (per === 4 && step % 2) continue;
      const accent = step % 4 === 0 ? 1 : 0.78;
      mallet(bus, at, tones[ARP[step]], vel * accent * 0.2, step % 2 ? 0.35 : -0.35);
    }
  }
  // The close: the chord, spelled upward once, and left to ring.
  const last = [62, 66, 69, 73, 74, 78];
  last.forEach((n, i) => mallet(bus, s.close + 0.15 + i * 0.11, n + 12, 0.16, (i / 5) * 1.2 - 0.6, 1.1));
  return bus;
}

function bass(length, g, s) {
  const bus = new Stereo(length);
  for (let b = 3; b <= BARS; b++) {
    const f = hz(g.chord(b).bass);
    const part = partAt(g.at(b) + 0.01, s);
    const vel = part === 'privacy' || part === 'ask' || b === BARS ? 0.13 : 0.19;
    // The root on the bar and again on the "and" of three.
    const notes = b === BARS ? [[0, 3.8]] : [[0, 1.6], [2.5, 1.2]];
    for (const [beat, beats] of notes) {
      const at = g.at(b, beat);
      const len = beats * g.beat;
      const i0 = Math.round(at * RATE);
      const n = Math.round((len + 0.15) * RATE);
      for (let j = 0; j < n; j++) {
        const t = j / RATE;
        const env = Math.min(1, t / 0.012) * (t < len ? 1 - 0.3 * Math.min(1, t / 0.4) : 0.7 * Math.max(0, 1 - (t - len) / 0.15));
        const v = Math.tanh(1.6 * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t))) / 1.3;
        bus.add(i0 + j, v * env * vel, 0);
      }
    }
  }
  return bus;
}

function drums(length, g, s) {
  const bus = new Stereo(length);
  const rand = noise(29);
  const kick = (at, vel) => {
    const i0 = Math.round(at * RATE);
    let phase = 0;
    for (let j = 0; j < 0.5 * RATE; j++) {
      const t = j / RATE;
      phase += TAU * (46 + 100 * Math.exp(-t / 0.03)) / RATE;
      const click = rand() * Math.exp(-t / 0.0025) * 0.25;
      bus.add(i0 + j, (Math.sin(phase) * Math.exp(-t / 0.22) + click) * vel, 0);
    }
  };
  const hat = (at, vel) => {
    const hp = new Biquad('highpass', 7500, 0.8);
    const i0 = Math.round(at * RATE);
    for (let j = 0; j < 0.12 * RATE; j++) {
      const t = j / RATE;
      bus.add(i0 + j, hp.run(rand()) * Math.exp(-t / 0.03) * vel, 0.3);
    }
  };
  const shaker = (at, vel) => {
    const bp = new Biquad('bandpass', 6500, 1.2);
    const i0 = Math.round(at * RATE);
    for (let j = 0; j < 0.08 * RATE; j++) {
      const t = j / RATE;
      bus.add(i0 + j, bp.run(rand()) * Math.min(1, t / 0.006) * Math.exp(-t / 0.018) * vel, -0.35);
    }
  };
  // In while the export runs, lighter over the ZIP, out for the privacy part and the close.
  for (let b = 5; b < 14; b++) {
    const light = partAt(g.at(b) + 0.01, s) === 'zip';
    kick(g.at(b, 0), light ? 0.3 : 0.42);
    kick(g.at(b, 2), light ? 0.22 : 0.36);
    for (let e = 1; e < 8; e += 2) hat(g.at(b, e / 2), light ? 0.06 : 0.09);
    for (let q = 0; q < 16; q++) shaker(g.at(b, q / 4), (q % 4 === 2 ? 0.1 : 0.05) * (light ? 0.7 : 1));
  }
  return bus;
}

/** A ping-pong echo: repeats `delay` apart, left then right, darkening as they go. */
function echo(src, delay, feedback = 0.32) {
  const n = src.l.length;
  const out = new Stereo(n);
  const d = Math.round(delay * RATE);
  const lineL = new Float32Array(n);
  const lineR = new Float32Array(n);
  const lpL = new Biquad('lowpass', 3200);
  const lpR = new Biquad('lowpass', 3200);
  for (let i = 0; i < n; i++) {
    const outL = i >= d ? lineL[i - d] : 0;
    const outR = i >= d ? lineR[i - d] : 0;
    lineL[i] = lpL.run((src.l[i] + src.r[i]) * 0.5 + outR * feedback);
    lineR[i] = lpR.run(outL);
    out.l[i] = outL;
    out.r[i] = outR;
  }
  return out;
}

/** Freeverb (Jezar at Dreampoint's), a stereo room for everything to sit in. */
function reverb(src, room = 0.84, damp = 0.3) {
  const scale = RATE / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const passes = [556, 441, 341, 225];
  const feedback = room * 0.28 + 0.7;
  const d1 = damp * 0.4;
  const channel = (input, spread) => {
    const out = new Float32Array(input.length);
    const cs = combs.map((n) => ({ buf: new Float32Array(Math.round((n + spread) * scale)), i: 0, store: 0 }));
    const as = passes.map((n) => ({ buf: new Float32Array(Math.round((n + spread) * scale)), i: 0 }));
    for (let s = 0; s < input.length; s++) {
      const x = input[s] * 0.015;
      let acc = 0;
      for (const c of cs) {
        const y = c.buf[c.i];
        c.store = y * (1 - d1) + c.store * d1;
        c.buf[c.i] = x + c.store * feedback;
        if (++c.i === c.buf.length) c.i = 0;
        acc += y;
      }
      for (const a of as) {
        const b = a.buf[a.i];
        a.buf[a.i] = acc + b * 0.5;
        if (++a.i === a.buf.length) a.i = 0;
        acc = b - acc;
      }
      out[s] = acc * 3;
    }
    return out;
  };
  const out = new Stereo(src.l.length);
  out.l = channel(src.l, 0);
  out.r = channel(src.r, 23);
  return out;
}

// ---- the effects -------------------------------------------------------------
const EFFECTS = {
  /** Air moving past: noise through a band that sweeps up and back, drifting across. */
  whoosh(bus, at, dur = 0.9, rand) {
    const bpL = new Biquad('bandpass', 400, 0.9);
    const bpR = new Biquad('bandpass', 400, 0.9);
    const i0 = Math.round(at * RATE);
    const n = Math.round(dur * RATE);
    for (let j = 0; j < n; j++) {
      const u = j / n;
      if (j % 64 === 0) {
        const f = 350 * (u < 0.6 ? (3200 / 350) ** (u / 0.6) : (3200 / 350) ** (1 - (u - 0.6) / 0.4 * 0.6));
        bpL.set('bandpass', f, 0.9);
        bpR.set('bandpass', f * 1.07, 0.9);
      }
      const env = Math.sin(Math.PI * u) ** 2;
      const pan = -0.6 + 1.2 * u;
      const a = (pan + 1) * Math.PI / 4;
      if (i0 + j < bus.l.length) {
        bus.l[i0 + j] += bpL.run(rand()) * env * 0.36 * Math.cos(a);
        bus.r[i0 + j] += bpR.run(rand()) * env * 0.36 * Math.sin(a);
      }
    }
  },
  /** A rising sweep that stops dead on its mark. */
  riser(bus, at, dur = 1, rand) {
    const bp = new Biquad('bandpass', 400, 1.4);
    const i0 = Math.round(at * RATE);
    const n = Math.round(dur * RATE);
    let phase = 0;
    for (let j = 0; j < n; j++) {
      const u = j / n;
      if (j % 64 === 0) bp.set('bandpass', 400 * 15 ** u, 1.4);
      phase += TAU * (180 * 4 ** u) / RATE;
      const env = u ** 2 * Math.min(1, (n - j) / (0.015 * RATE));
      bus.add(i0 + j, (bp.run(rand()) * 0.7 + Math.sin(phase) * 0.12) * env * 0.45, 0);
    }
  },
  /** A soft, low thud, for the folder appearing. */
  impact(bus, at, _dur, rand) {
    const lp = new Biquad('lowpass', 700, 0.7);
    const i0 = Math.round(at * RATE);
    let phase = 0;
    for (let j = 0; j < 1.6 * RATE; j++) {
      const t = j / RATE;
      phase += TAU * (50 + 45 * Math.exp(-t / 0.12)) / RATE;
      const v = Math.sin(phase) * Math.exp(-t / 0.5) * 0.8 + lp.run(rand()) * Math.exp(-t / 0.09) * 0.9;
      bus.add(i0 + j, v * Math.min(1, t / 0.003) * 0.5, 0);
    }
  },
  /** The cards pulled in: a sweep that falls and swells towards the folder. */
  suck(bus, at, dur = 1, rand) {
    const bp = new Biquad('bandpass', 2500, 1.1);
    const i0 = Math.round(at * RATE);
    const n = Math.round(dur * RATE);
    for (let j = 0; j < n; j++) {
      const u = j / n;
      if (j % 64 === 0) bp.set('bandpass', 2600 * (380 / 2600) ** u, 1.1);
      const env = u ** 1.5 * Math.min(1, (n - j) / (0.08 * RATE));
      bus.add(i0 + j, bp.run(rand()) * env * 0.5, Math.sin(u * 5) * 0.3);
    }
  },
  /** A mouse button: down, and up a moment later. */
  click(bus, at, _dur, rand) {
    const press = (t0, vel) => {
      const hp = new Biquad('highpass', 1800, 0.7);
      const i0 = Math.round(t0 * RATE);
      for (let j = 0; j < 0.03 * RATE; j++) {
        const t = j / RATE;
        const v = hp.run(rand()) * Math.exp(-t / 0.0015) + Math.sin(TAU * 3100 * t) * Math.exp(-t / 0.004) * 0.5;
        bus.add(i0 + j, v * vel, 0.15);
      }
    };
    press(at, 0.32);
    press(at + 0.075, 0.18);
  },
  /** A small, round blip for things that appear. */
  pop(bus, at) {
    const i0 = Math.round(at * RATE);
    let phase = 0;
    for (let j = 0; j < 0.25 * RATE; j++) {
      const t = j / RATE;
      phase += TAU * (560 + 380 * (1 - Math.exp(-t / 0.018))) / RATE;
      const v = (Math.sin(phase) + 0.15 * Math.sin(2 * phase)) * Math.min(1, t / 0.002) * Math.exp(-t / 0.05);
      bus.add(i0 + j, v * 0.2, 0);
    }
  },
  /**
   * A file landing in the list: a small, soft blip on a note of the key, from the left, where the
   * list is. Dozens come in a row, so each takes a different note and weight.
   */
  tick(bus, at, _dur, rand) {
    const notes = [86, 88, 90, 93, 95];
    const f = hz(notes[Math.floor(((rand() + 1) / 2) * notes.length)]);
    const vel = 0.18 * (0.75 + 0.25 * ((rand() + 1) / 2));
    const i0 = Math.round(at * RATE);
    const [gl, gr] = panned(-0.35);
    for (let j = 0; j < 0.12 * RATE; j++) {
      const t = j / RATE;
      const v = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.01);
      bus.put(i0 + j, v * Math.min(1, t / 0.001) * Math.exp(-t / 0.022) * vel, gl, gr);
    }
  },
  /** Saved: three bell notes, up the tonic chord. */
  chime(bus, at) {
    [81, 86, 90].forEach((n, i) => mallet(bus, at + i * 0.09, n, 0.22, -0.3 + i * 0.3, 0.9));
  },
  /** The close: a scatter of high bells. */
  shimmer(bus, at, _dur, rand) {
    const scale = [86, 88, 90, 93, 95, 98, 100];
    for (let i = 0; i < 9; i++) {
      mallet(bus, at + i * 0.13 + (rand() + 1) * 0.03, scale[Math.floor(((rand() + 1) / 2) * scale.length)], 0.07, rand() * 0.8, 0.7);
    }
  },
};

// ---- measuring and levelling -------------------------------------------------
/** Integrated loudness per ITU-R BS.1770 (K-weighted, gated), in LUFS; -Infinity for silence. */
export function loudness(track) {
  const kweight = (x) => {
    // The standard's two stages, as it gives them for 48 kHz.
    const shelf = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] };
    const hp = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] };
    const out = new Float64Array(x.length);
    let [x1, x2, y1, y2, z1, z2, w1, w2] = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < x.length; i++) {
      const y = shelf.b[0] * x[i] + shelf.b[1] * x1 + shelf.b[2] * x2 - shelf.a[0] * y1 - shelf.a[1] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
      const w = hp.b[0] * y + hp.b[1] * z1 + hp.b[2] * z2 - hp.a[0] * w1 - hp.a[1] * w2;
      z2 = z1; z1 = y; w2 = w1; w1 = w;
      out[i] = w * w;
    }
    return out;
  };
  const l = kweight(track.l);
  const r = kweight(track.r);
  const block = Math.round(0.4 * RATE);
  const hop = Math.round(0.1 * RATE);
  const energies = [];
  for (let s = 0; s + block <= l.length; s += hop) {
    let sum = 0;
    for (let i = s; i < s + block; i++) sum += l[i] + r[i];
    energies.push(sum / block);
  }
  const lufs = (e) => -0.691 + 10 * Math.log10(e);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const loud = energies.filter((e) => lufs(e) > -70);
  if (!loud.length) return -Infinity;
  const gate = lufs(mean(loud)) - 10;
  const kept = loud.filter((e) => lufs(e) > gate);
  return lufs(mean(kept));
}

function peak(track) {
  let p = 0;
  for (let i = 0; i < track.l.length; i++) p = Math.max(p, Math.abs(track.l[i]), Math.abs(track.r[i]));
  return p;
}

/** Brings a track to `target` LUFS; returns the gain it took. */
function level(track, target) {
  const now = loudness(track);
  if (!Number.isFinite(now)) return 1;
  const gain = dB(target - now);
  track.scale(gain);
  return gain;
}

/**
 * A look-ahead peak limiter: the gain starts down 5 ms before a peak arrives, easing (1 ms) so it
 * doesn't click, and comes back up over 120 ms. Whatever the easing leaves over is clipped, which
 * is a fraction of a percent at most.
 */
function limit(track, ceiling) {
  const n = track.l.length;
  const look = Math.round(0.005 * RATE);
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(track.l[i]), Math.abs(track.r[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // The lowest gain needed in the window ahead, then smoothed across the same window, so the gain
  // reaches it exactly at the peak without stepping.
  const ahead = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let k = i; k < Math.min(n, i + look); k++) if (need[k] < m) m = need[k];
    ahead[i] = m;
  }
  const attack = Math.exp(-1 / (0.001 * RATE));
  const release = Math.exp(-1 / (0.12 * RATE));
  let g = 1;
  let reduced = 0;
  let deepest = 1;
  for (let i = 0; i < n; i++) {
    g = ahead[i] + (g - ahead[i]) * (ahead[i] < g ? attack : release);
    if (g < 0.999) reduced++;
    if (g < deepest) deepest = g;
    track.l[i] = Math.max(-ceiling, Math.min(ceiling, track.l[i] * g));
    track.r[i] = Math.max(-ceiling, Math.min(ceiling, track.r[i] * g));
  }
  return { seconds: reduced / RATE, deepest: 20 * Math.log10(deepest) };
}

/**
 * Resamples mono audio to RATE with a windowed sinc (Blackman, 32 taps a side). An output sample
 * falls at one of only a few offsets between input samples (2 from 24 kHz, 160 from 44.1), so each
 * offset's kernel is worked out once.
 */
function resample(samples, from) {
  if (from === RATE) return samples;
  const taps = 32;
  const cut = Math.min(1, RATE / from) * 0.97;
  const kernels = new Map();
  const kernel = (rem) => {
    let k = kernels.get(rem);
    if (k) return k;
    const frac = rem / RATE;
    k = new Float64Array(2 * taps);
    let norm = 0;
    for (let j = 0; j < 2 * taps; j++) {
      const x = frac - (j - taps + 1);
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * cut * x) / (Math.PI * cut * x);
      const w = 0.42 + 0.5 * Math.cos(Math.PI * x / taps) + 0.08 * Math.cos(2 * Math.PI * x / taps);
      k[j] = sinc * w;
      norm += k[j];
    }
    for (let j = 0; j < 2 * taps; j++) k[j] /= norm;
    kernels.set(rem, k);
    return k;
  };
  const out = new Float32Array(Math.floor((samples.length * RATE) / from));
  for (let o = 0; o < out.length; o++) {
    const num = o * from;
    const c = Math.floor(num / RATE);
    const k = kernel(num % RATE);
    let acc = 0;
    for (let j = 0; j < 2 * taps; j++) {
      const idx = c - taps + 1 + j;
      if (idx >= 0 && idx < samples.length) acc += samples[idx] * k[j];
    }
    out[o] = acc;
  }
  return out;
}

/** The narration as one track: each line at its second, filtered and centred. */
function voiceTrack(length, clips, scenes) {
  const track = new Stereo(length);
  const report = [];
  clips.forEach((c, i) => {
    const samples = resample(c.samples, c.rate);
    const hp = new Biquad('highpass', 75, 0.7);
    // A touch of presence, so the voice reads over the music on small speakers.
    const presence = new Biquad('peak', 3200, 0.9, 2);
    const i0 = Math.round(c.at * RATE);
    for (let j = 0; j < samples.length; j++) {
      const v = presence.run(hp.run(samples[j]));
      if (i0 + j < length) {
        track.l[i0 + j] += v;
        track.r[i0 + j] += v;
      }
    }
    const ends = c.at + samples.length / RATE;
    // Room up to the next line, or for the last one, up to the fade at the end.
    const room = (clips[i + 1]?.at ?? scenes.end - 1.5) - 0.12;
    report.push({ text: c.text, at: c.at, seconds: samples.length / RATE, over: ends - room });
  });
  const over = report.filter((r) => r.over > 0);
  for (const r of report) {
    console.log('  ' + r.at.toFixed(2).padStart(6) + 's  ' + r.seconds.toFixed(2) + 's  ' + (r.over > 0 ? 'OVERRUNS ' + r.over.toFixed(2) + 's  ' : '') + r.text);
  }
  if (over.length) {
    throw new Error(over.length + ' narration line(s) run into the next one: shorten them, or give them room in store/src/video.ts');
  }
  return track;
}

/** 1 where the music plays freely, down to `depth` while the voice speaks, easing in and out. */
function duckGain(voice, depth) {
  const n = voice.l.length;
  const gain = new Float32Array(n);
  const lead = Math.round(0.12 * RATE); // dip just before the first syllable, not on it
  const follow = Math.exp(-1 / (0.05 * RATE));
  let env = 0;
  const active = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    env = Math.max(Math.abs(voice.l[i]), env * follow);
    if (env > 0.02) active[Math.max(0, i - lead)] = 1;
  }
  // Short gaps between words don't count as the voice stopping.
  const hold = Math.round(0.35 * RATE);
  let last = -Infinity;
  const down = Math.exp(-1 / (0.08 * RATE));
  const up = Math.exp(-1 / (0.5 * RATE));
  let g = 1;
  for (let i = 0; i < n; i++) {
    if (active[i]) last = i;
    const target = i - last < hold ? depth : 1;
    g = target + (g - target) * (target < g ? down : up);
    gain[i] = g;
  }
  return gain;
}

/** The music written for the film: a pad, mallets and their echo, bass and drums, in one room. */
function score(length, scenes) {
  const g = grid(scenes);
  const music = new Stereo(length);
  const padBus = pad(length, g, scenes);
  const pluckBus = plucks(length, g, scenes);
  music.mix(padBus, 1);
  music.mix(pluckBus, 1);
  music.mix(echo(pluckBus, g.beat * 0.75), 0.45);
  music.mix(bass(length, g, scenes), 1);
  music.mix(drums(length, g, scenes), 1);
  const room = new Stereo(length);
  room.mix(padBus, 0.35);
  room.mix(pluckBus, 0.6);
  music.mix(reverb(room), 0.5);
  // A little air on top.
  const airL = new Biquad('highshelf', 6000, 0.707, 3);
  const airR = new Biquad('highshelf', 6000, 0.707, 3);
  for (let i = 0; i < length; i++) {
    music.l[i] = airL.run(music.l[i]);
    music.r[i] = airR.run(music.r[i]);
  }
  return music;
}

/**
 * The whole soundtrack, for `spec` (window.video.soundtrack) and the spoken narration (or null to
 * leave the voice out). Returns the stereo track at RATE, a line of levels for the log, and the
 * three stems as they went into the mix, for looking at one on its own.
 */
export function buildSoundtrack(spec, clips) {
  const { scenes, sounds, duration } = spec;
  const length = Math.round(duration * RATE);

  // The music, to -25 LUFS.
  const music = score(length, scenes);
  level(music, -25);

  // The effects, at their seconds, in a room of their own.
  const fx = new Stereo(length);
  const rand = noise(47);
  for (const s of sounds) EFFECTS[s.kind](fx, s.at, s.dur, rand);
  fx.mix(reverb(fx, 0.8, 0.35), 0.35);
  fx.scale(dB(-4));

  // The voice, and the music stepping back for it.
  const mix = new Stereo(length);
  let voice = null;
  if (clips) {
    voice = voiceTrack(length, clips, scenes);
    level(voice, -16);
    const duck = duckGain(voice, dB(-9));
    // The effects step back too, less far: a whoosh over a word still has to be heard as a whoosh.
    for (let i = 0; i < length; i++) {
      const soft = duck[i] ** 0.45;
      music.l[i] *= duck[i];
      music.r[i] *= duck[i];
      fx.l[i] *= soft;
      fx.r[i] *= soft;
    }
    mix.mix(voice, 1);
    mix.mix(reverb(voice, 0.5, 0.5), 0.04);
  }
  mix.mix(music, 1);
  mix.mix(fx, 1);

  // Nothing under 30 Hz: no speaker plays it, and it would only take headroom from what they do.
  const rumble = [[new Biquad('highpass', 30, 0.54), new Biquad('highpass', 30, 1.31)], [new Biquad('highpass', 30, 0.54), new Biquad('highpass', 30, 1.31)]];
  for (let i = 0; i < length; i++) {
    mix.l[i] = rumble[0][1].run(rumble[0][0].run(mix.l[i]));
    mix.r[i] = rumble[1][1].run(rumble[1][0].run(mix.r[i]));
  }

  // In over the first 20 ms, out over the last second and a half.
  const tail = Math.round(1.5 * RATE);
  for (let i = 0; i < length; i++) {
    const f = Math.min(1, i / (0.02 * RATE), (length - i) / tail);
    mix.l[i] *= f;
    mix.r[i] *= f;
  }

  level(mix, -14);
  const limited = limit(mix, dB(-1.2));
  const summary = 'soundtrack: ' + loudness(mix).toFixed(1) + ' LUFS, peak ' + (20 * Math.log10(peak(mix))).toFixed(1) +
    ' dBFS, limiting on ' + limited.seconds.toFixed(2) + 's of ' + duration + 's (at most ' + limited.deepest.toFixed(1) + ' dB)' +
    (clips ? '' : ', no narration');
  return { track: mix, summary, stems: { music, fx, voice } };
}

/** Writes seconds `from` to `to` of a track as a 24-bit stereo WAV, with a 10 ms fade at each cut. */
export function writeWav(path, track, from = 0, to = track.l.length / RATE) {
  const i0 = Math.max(0, Math.round(from * RATE));
  const i1 = Math.min(track.l.length, Math.round(to * RATE));
  const frames = i1 - i0;
  const data = Buffer.alloc(frames * 6);
  const rand = noise(5);
  const edge = Math.round(0.01 * RATE);
  for (let j = 0; j < frames; j++) {
    const f = from > 0 || to < track.l.length / RATE ? Math.min(1, j / edge, (frames - j) / edge) : 1;
    for (const [c, ch] of [[0, track.l], [1, track.r]]) {
      // TPDF dither at 24 bits.
      const v = Math.round(ch[i0 + j] * f * 8388607 + (rand() + rand()) * 0.5);
      data.writeIntLE(Math.max(-8388608, Math.min(8388607, v)), (j * 2 + c) * 3, 3);
    }
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 6, 28);
  head.writeUInt16LE(6, 32);
  head.writeUInt16LE(24, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([head, data]));
}
