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
// `npm run site-check -- popup` checks the popup instead (CI runs it on every pull request): each made-up state the
// store renders (store/src/mock-chrome.ts) stays inside the 600px Chrome gives a popup, but the first-run notice, which
// may scroll. It runs first in the default check too.
//
// `npm run site-check -- frames <selector> [time <from> <to> <step> | scroll <steps>] [<width>x<height>]` photographs
// one picture instead, into a folder of its own under site-frames/ (gitignored): at moments of the time-based animations (the hero's loop, the
// sweeps that play as the page opens), or as it is scrolled up from the foot of the screen to 40% from its top. Look at
// the frames before trusting a change to the motion; the checks above only say that it ends where it should.
//
// `npm run site-check -- styles save`, then `npm run site-check -- styles` after a change, proves a CSS change that
// should change nothing on screen (rules folded together, dead ones removed) changed nothing: every element's computed
// style, in every state of the landing page and the popup and in every store image, against the ones save kept in
// site-styles.json (gitignored).
//
// Needs Chrome, Chromium or Edge, as the store images do (CHROME_PATH).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStage, root } from './stage.mjs';
import { IMAGES, openImage } from './store-assets.mjs';

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
/** In the popup: once it has drawn its (mock) state in place of "Checking this tab…", and a frame has gone by. */
const drawn = `(async () => {
  for (let i = 0; i < 200 && !document.querySelector('#view > :not(.loading)'); i++) await new Promise((r) => setTimeout(r, 25));
  if (!document.querySelector('#view > :not(.loading)')) throw new Error('the popup did not draw its state');
  await ${settle};
})()`;

/** In the page: plays every time-based animation to its end. A loop's end is the end of an iteration, wherever its
 * delay makes it start (the hero's opens a third of the way in). */
const finishAll = `(() => {
  for (const a of document.getAnimations()) {
    if (a.timeline !== document.timeline) continue;
    const { iterations, duration, delay } = a.effect.getTiming();
    if (iterations === Infinity) { a.pause(); a.currentTime = duration + Math.min(0, delay); } else a.finish();
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

/** @param {any} stage @param {number[]} viewport */
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
      for (let t = 0; t < 13000; t += 250) {
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

/** Chrome cuts a popup off at 600px. The states store/src/mock-chrome.ts makes up, with every <details> closed. */
const POPUP_MAX = 600;
const POPUP_STATES = ['ready', 'login', 'running', 'paused', 'error', 'done', 'problems'];

async function popup(stage) {
  const fails = [];
  for (const state of POPUP_STATES) {
    // In a window taller than the cap, so what is measured is the popup's own height and not the window's.
    const page = await stage.open('/src/extension/popup/popup.html?state=' + state, 800, 1200, 1, 'true');
    await page.evaluate(drawn); // the popup asks the (mock) service worker for its state, then draws
    const height = await page.evaluate(`Math.ceil(document.documentElement.getBoundingClientRect().height)`);
    console.log('popup ' + state + ': ' + height + 'px');
    if (height > POPUP_MAX) fails.push('the popup\'s ' + state + ' state is ' + height + 'px tall, over Chrome\'s ' + POPUP_MAX + 'px');
    await page.close();
  }
  return fails;
}

/** @param {any} stage @param {string[]} spec */
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
    const [from = 0, to = 13, step = 0.5] = nums;
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

/** In the page: every element's computed style, ::before and ::after included, each as a hash. Animations are held
 * still first (a transition at its end, a time-based one at its start; scroll-driven ones stay at the top), and the
 * declarations are sorted, since Chrome lists custom properties in no fixed order. */
const STYLES = `(() => {
  for (const a of document.getAnimations()) {
    if (a instanceof CSSTransition) a.finish();
    else if (a.timeline === document.timeline) { a.pause(); a.currentTime = 0; }
  }
  const hash = (s) => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const out = {};
  [...document.querySelectorAll('*')].forEach((e, i) => {
    const parts = [];
    for (const pseudo of ['', '::before', '::after']) {
      const cs = getComputedStyle(e, pseudo || null);
      if (pseudo && cs.content === 'none') continue;
      for (let k = 0; k < cs.length; k++) parts.push(pseudo + cs[k] + ':' + cs.getPropertyValue(cs[k]));
    }
    const cls = e.className && e.className.baseVal === undefined ? '.' + e.className.trim().replace(/\\s+/g, '.') : '';
    out[i + ' ' + e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls] = hash(parts.sort().join(';'));
  });
  return out;
})()`;
const STYLES_FILE = join(root, 'site-styles.json');

/**
 * The computed styles of the landing page (at each of VIEWPORTS, with and without reduced motion, in every state of
 * its radio buttons), of the popup's made-up states, and of each store image as it is photographed. `save` keeps them; otherwise they are compared with what was
 * kept, for a change to the CSS that should change nothing on screen (folding rules together, removing dead ones).
 * @param {any} stage @param {string | undefined} action
 */
async function styles(stage, action) {
  /** @type {Record<string, Record<string, string>>} */
  const now = {};
  const pages = [
    ...VIEWPORTS.map(([w, h]) => ({ name: w + 'x' + h, path: PAGE, w, h })),
    ...POPUP_STATES.map((s) => ({ name: 'popup ' + s, path: '/src/extension/popup/popup.html?state=' + s, w: 800, h: 1200 })),
  ];
  for (const { name, path, w, h } of pages) {
    for (const motion of ['no-preference', 'reduce']) {
      const page = await stage.open(path, w, h, 1, 'true');
      try {
        if (path !== PAGE) await page.evaluate(drawn);
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
        const radios = await page.evaluate(`[...document.querySelectorAll('input[type=radio]')].map((r) => r.id)`);
        for (const id of [null, ...radios]) {
          if (id) await page.evaluate(`document.getElementById(${JSON.stringify(id)}).checked = true`);
          now[name + ' ' + motion + ' ' + (id || 'initial')] = await page.evaluate(STYLES);
        }
      } finally {
        await page.close();
      }
    }
  }
  // The store images, each as it is photographed: their CSS (listing.css, parts.css) is folded the same way.
  for (const image of IMAGES) {
    const page = await openImage(stage, image);
    try {
      now['store ' + image.shot] = await page.evaluate(STYLES);
    } finally {
      await page.close();
    }
  }
  const states = Object.keys(now).length;
  if (action === 'save') {
    writeFileSync(STYLES_FILE, JSON.stringify(now));
    console.log('kept the computed styles of ' + states + ' states in ' + STYLES_FILE);
    return [];
  }
  if (!existsSync(STYLES_FILE)) throw new Error('nothing kept to compare with: run site-check -- styles save first');
  const kept = JSON.parse(readFileSync(STYLES_FILE, 'utf8'));
  const fails = [];
  for (const state of new Set([...Object.keys(kept), ...Object.keys(now)])) {
    if (!kept[state] || !now[state]) { fails.push(state + ': only in ' + (kept[state] ? 'the kept styles' : 'this run')); continue; }
    const differ = [...new Set([...Object.keys(kept[state]), ...Object.keys(now[state])])].filter((e) => kept[state][e] !== now[state][e]);
    if (differ.length) fails.push(state + ': ' + differ.length + ' element(s), first ' + differ.slice(0, 3).join(', '));
  }
  console.log(fails.length ? fails.length + ' of ' + states + ' states differ' : 'the same in all ' + states + ' states');
  return fails;
}

const args = process.argv.slice(2);
const stage = await openStage();
let failed = false;
try {
  if (args[0] === 'styles') {
    const fails = await styles(stage, args[1]);
    for (const f of fails.slice(0, 20)) console.log('  - ' + f);
    if (fails.length) failed = true;
  } else if (args[0] === 'frames') {
    if (!args[1]) throw new Error('frames needs a selector, e.g. frames .path scroll 10 375x812');
    await frames(stage, args.slice(1));
  } else {
    const tall = await popup(stage);
    for (const f of tall) console.log('  - ' + f);
    if (tall.length) failed = true;
    for (const vp of args[0] === 'popup' ? [] : VIEWPORTS) {
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
