// Checks the landing page's motion (site/, laid over public/ as the Pages workflow lays it out) in headless Chrome,
// at a laptop, a phone and a tall monitor:
//   - each picture, played to its end, is the picture the page shows without motion: what reduced motion and a
//     browser without scroll timelines see, and what the link preview photographs;
//   - every scroll timeline follows the page. An ancestor with overflow: hidden (or auto, or scroll) is a scroll
//     container, and a timeline would follow that box, which never scrolls: use overflow: clip, which clips the same;
//   - nothing moves the page sideways at 375px, at any scroll position or any moment of the hero's loop;
//   - every animation is inside one of PICTURES, so a new one is checked too (add its picture to the list).
// It exits non-zero on the first failing viewport, naming what failed.
//
// `npm run site-check -- frames <selector> [time <from> <to> <step> | scroll <steps>] [<width>x<height>]` photographs
// one picture instead, into a folder of its own under site-frames/ (gitignored): at moments of the time-based animations (the hero's loop, the
// sweeps that play as the page opens), or as it is scrolled up from the foot of the screen to 40% from its top. Look at
// the frames before trusting a change to the motion; the checks above only say that it ends where it should.
//
// Needs Chrome, Chromium or Edge, as the store images do (CHROME_PATH).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStage, root } from './stage.mjs';

/** Everything on the page that moves, by the element that holds it. */
const PICTURES = [
  '#hero-picture',
  '#timeline-picture',
  '#p-summary .chat',
  '#collect .numbered',
  '#collect-clip',
  '#folder-clip',
  '#app-claude',
  '#app-chatgpt',
  '.path',
];
// A laptop, a phone, full HD, a tall monitor and one stood on end: a picture near the foot of the page has less room to
// play out the taller the screen is.
const VIEWPORTS = [[1440, 900], [375, 812], [1920, 1080], [2560, 1440], [1200, 1920]];
const PAGE = '/site/index.html';

/** Waits for the page to draw twice, so a scroll or a paused animation has been applied. */
const settle = '(new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))';

/** In the page: plays every time-based animation to its end. The hero's loop ends where it starts, at 0. */
const finishAll = `(() => {
  for (const a of document.getAnimations()) {
    if (a.timeline !== document.timeline) continue;
    if (a.effect.getTiming().iterations === Infinity) { a.pause(); a.currentTime = 0; } else a.finish();
  }
})()`;

/** In the page: what each element of a picture looks like, in the properties the motion changes. */
const looks = (sel) => `(() => {
  const PROPS = ['opacity', 'transform', 'translate', 'rotate', 'scale', 'clip-path', 'stroke-dashoffset', 'box-shadow',
    'background-color', 'visibility'];
  // A transform or a clip that does nothing reads the same as none.
  const plain = (p, v) => {
    if (/^(transform|translate|rotate|scale)$/.test(p) && /^(none|matrix\\(1, 0, 0, 1, 0, 0\\)|0px( 0px)?|0deg|1)$/.test(v)) return 'none';
    // An inset clip with no positive inset cuts nothing (an animated one ends as calc(0% - 8px), which is -8px).
    if (p === 'clip-path' && v.startsWith('inset(')) {
      const flat = v.replace(/calc\\(0% ([+-]) ([\\d.]+)px\\)/g, (_, sign, n) => (sign === '-' ? '-' : '') + n + 'px');
      if (!flat.includes('calc') && (flat.match(/-?[\\d.]+/g) || []).every((n) => +n <= 0)) return 'none';
    }
    return v;
  };
  const root = document.querySelector(${JSON.stringify(sel)});
  if (!root) return null;
  // What cannot be seen (at opacity 0, or inside something that is) looks the same whatever else it has.
  const unseen = (e) => { for (; e; e = e.parentElement) if (getComputedStyle(e).opacity === '0') return true; return false; };
  return [root, ...root.querySelectorAll('*')].map((e, i) => {
    const cs = getComputedStyle(e);
    if (unseen(e)) return i + ' ' + e.tagName.toLowerCase() + ' unseen';
    return i + ' ' + e.tagName.toLowerCase() + (e.className && e.className.baseVal === undefined ? '.' + e.className.trim().replace(/\\s+/g, '.') : '') +
      ' ' + PROPS.map((p) => p + ':' + plain(p, cs.getPropertyValue(p))).join('; ');
  });
})()`;

async function check(stage, [width, height]) {
  const fails = [];
  const page = await stage.open(PAGE, width, height, 1, 'true');
  const motion = (value) => page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const scrollTo = (sel) => page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
    window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 120, behavior: 'instant' }); })(), ${settle}`);

  // Still: every picture as the page shows it without motion.
  await motion('reduce');
  const still = {};
  for (const sel of PICTURES) {
    await scrollTo(sel);
    still[sel] = await page.evaluate(looks(sel));
    if (!still[sel]) fails.push(sel + ': not on the page');
  }

  // Played: each picture with its animations run to their end.
  await motion('no-preference');
  await page.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' }), ${settle}`);
  for (const sel of PICTURES) {
    if (!still[sel]) continue;
    await scrollTo(sel);
    await page.evaluate(finishAll + ', ' + settle);
    const played = await page.evaluate(looks(sel));
    const differ = played.filter((line, i) => line !== still[sel][i]);
    if (differ.length) fails.push(sel + ' ends differently from the still page, at ' + differ.length + ' element(s), first:\n    played: ' +
      differ[0] + '\n    still:  ' + still[sel][played.indexOf(differ[0])]);
  }

  // Every animation is in a picture, and every scroll timeline follows the page.
  const stray = await page.evaluate(`(() => {
    const pics = ${JSON.stringify(PICTURES)}.map((s) => document.querySelector(s)).filter(Boolean);
    const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().replace(/\\s+/g, '.') : '');
    const out = [];
    for (const a of document.getAnimations()) {
      const t = a.effect.target;
      if (!pics.some((p) => p.contains(t))) out.push(a.animationName + ' on ' + name(t) + ' is in none of PICTURES');
      const src = a.timeline && a.timeline.source;
      if (src && src !== document.scrollingElement) out.push(a.animationName + ' on ' + name(t) + ' follows ' + name(src) + ', a scroll container that never scrolls (overflow: hidden? use clip)');
    }
    return [...new Set(out)];
  })()`);
  fails.push(...stray);

  // Nothing moves the page sideways on a phone.
  if (width <= 375) {
    const wide = await page.evaluate(`(async () => {
      const worst = [];
      for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await ${settle};
        if (document.documentElement.scrollWidth > innerWidth) worst.push('at ' + y + 'px down: ' + document.documentElement.scrollWidth + 'px wide');
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      const loop = document.getAnimations().filter((a) => a.timeline === document.timeline);
      for (let t = 0; t < 16000; t += 250) {
        for (const a of loop) { a.pause(); a.currentTime = t; }
        await ${settle};
        if (document.documentElement.scrollWidth > innerWidth) worst.push('at ' + t + 'ms of the loop: ' + document.documentElement.scrollWidth + 'px wide');
      }
      return worst;
    })()`);
    if (wide.length) fails.push('the page scrolls sideways ' + wide.slice(0, 3).join('; '));
  }

  await page.close();
  return fails;
}

async function frames(stage, [sel, mode = 'scroll', ...rest]) {
  const size = rest.find((a) => /^\d+x\d+$/.test(a)) || '1440x900';
  const nums = rest.filter((a) => !/x/.test(a)).map(Number);
  const [width, height] = size.split('x').map(Number);
  // One folder for each picture, way and size, emptied first, so a folder only ever holds one run's frames.
  const dir = join(root, 'site-frames', [sel.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''), mode, size].join('_'));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await stage.open(PAGE, width, height, 1, 'true');
  const shoot = async (name) => {
    const clip = await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
      const y = Math.max(0, r.top - 20), bottom = Math.min(innerHeight, r.bottom + 20);
      return bottom - y < 4 ? null : { x: 0, y: y + scrollY, width: innerWidth, height: bottom - y }; })()`);
    if (!clip) return;
    const file = join(dir, name + '.png');
    writeFileSync(file, await page.screenshot({ clip }));
    console.log('wrote ' + file);
  };
  if (mode === 'time') {
    const [from = 0, to = 16, step = 0.5] = nums;
    await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 120, behavior: 'instant' }); })(), ${settle}`);
    for (let t = from, i = 0; t <= to + 1e-9; t += step, i++) {
      await page.evaluate(`(() => { for (const a of document.getAnimations())
        if (a.timeline === document.timeline) { a.pause(); a.currentTime = ${t * 1000}; } })(), ${settle}`);
      await shoot(String(i).padStart(3, '0') + '_' + t.toFixed(2) + 's');
    }
  } else {
    const [steps = 10] = nums;
    for (let i = 0; i <= steps; i++) {
      const at = Math.round(height - (i / steps) * height * 0.6);
      await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
        window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - ${at}, behavior: 'instant' }); })(), ${settle}`);
      await shoot(String(i).padStart(3, '0') + '_top-at-' + at + 'px');
    }
  }
  await page.close();
}

const args = process.argv.slice(2);
const stage = await openStage();
let failed = false;
try {
  if (args[0] === 'frames') {
    if (!args[1]) throw new Error('frames needs a selector, e.g. frames .path scroll 10 375x812');
    await frames(stage, args.slice(1));
  } else {
    for (const vp of VIEWPORTS) {
      const fails = await check(stage, vp);
      console.log(vp.join('x') + ': ' + (fails.length ? fails.length + ' problem(s)' : 'ok'));
      for (const f of fails) console.log('  - ' + f);
      if (fails.length) failed = true;
    }
  }
} finally {
  await stage.close();
}
if (failed) process.exit(1);
