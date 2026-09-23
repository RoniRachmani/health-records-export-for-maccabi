/* Time, for the promo video (video.ts). Nothing on its stage animates by itself: every value is a
   function of the second being drawn, so a frame comes out the same however long the one before
   it took. These are those functions — easing, ramps, holds, pulses — and the setters that put
   their results on an element. */

export const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

export type Ease = (u: number) => number;
export const linear: Ease = (u) => u;
export const inOut: Ease = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
export const out: Ease = (u) => 1 - (1 - u) ** 3;
/** Fast away, long settle: for things that arrive. */
export const outQuint: Ease = (u) => 1 - (1 - u) ** 5;
/** Slow away, fast finish: for things that are pulled in. */
export const inCubic: Ease = (u) => u ** 3;
/** Past the mark and back, for things that pop into place. */
export const outBack: Ease = (u) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;

/** 0 before `from`, 1 after `from + dur`, shaped by `ease` in between. */
export function ramp(t: number, from: number, dur: number, ease: Ease = inOut): number {
  return ease(clamp01((t - from) / dur));
}

/** 1 while something is on screen: in over `fadeIn` from `from`, out over `fadeOut` ending at `to`. */
export function showing(t: number, from: number, to: number, fadeIn = 0.45, fadeOut = fadeIn): number {
  return Math.min(ramp(t, from, fadeIn), 1 - ramp(t, to - fadeOut, fadeOut));
}

/** 1 at `when`, gone `dur` later: a ring, a flash, a bump. */
export function pulse(t: number, when: number, dur = 0.5): number {
  return t < when ? 0 : 1 - clamp01((t - when) / dur);
}

export interface Point {
  x: number;
  y: number;
}
export const between = (a: Point, b: Point, u: number): Point => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });

const n2 = (v: number): string => v.toFixed(2);

/**
 * Moves an element (placed at left 0, top 0) to x, y, scaled and turned about its own centre. A 2D
 * transform, never translate3d: that gives the element a layer of its own, whose text Chrome draws
 * once and then slides around, so where it lands depends on where it was when it was drawn — and
 * the render draws the film in a fresh browser every few seconds, which then disagrees with the
 * last. Drawn in place, every frame depends on its second alone.
 */
export function place(el: HTMLElement | SVGElement, x: number, y: number, scale = 1, turn = 0): void {
  el.style.transform = 'translate(' + n2(x) + 'px,' + n2(y) + 'px) scale(' + scale.toFixed(4) + ') rotate(' + n2(turn) + 'deg)';
}

export function fade(el: HTMLElement | SVGElement, o: number): void {
  const v = clamp01(o).toFixed(3);
  if (el.style.opacity !== v) el.style.opacity = v;
  el.style.visibility = o <= 0.001 ? 'hidden' : '';
}

/**
 * A line of words that can rise into place one after another, each from behind its own mask.
 * `accent` words (by index) take the accent colour.
 */
export function kinetic(tag: string, cls: string, text: string, accent: number[] = []): { el: HTMLElement; words: HTMLElement[] } {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  const words: HTMLElement[] = [];
  text.split(' ').forEach((word, i) => {
    if (i) el.append(' ');
    const mask = document.createElement('span');
    mask.className = 'w';
    const inner = document.createElement('span');
    inner.textContent = word;
    if (accent.includes(i)) inner.className = 'accent';
    mask.append(inner);
    el.append(mask);
    words.push(inner);
  });
  return { el, words };
}

/** Raises the words of a kinetic line: the first at `from`, each next one `stagger` later. */
export function rise(words: HTMLElement[], t: number, from: number, stagger = 0.065, dur = 0.7): void {
  words.forEach((w, i) => {
    const u = ramp(t, from + i * stagger, dur, outQuint);
    w.style.transform = 'translate(0,' + ((1 - u) * 110).toFixed(1) + '%)';
  });
}
