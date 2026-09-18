// Draws the extension icon into public/icons/icon-<size>.png: a page with a folded corner and two lines of
// text, standing in a tray with a slot. Round-capped blue lines (1.5 units on a 24-unit grid, the popup's
// #2563c9) on a transparent background; the page and tray are filled white so the icon stays visible on
// dark toolbars. No image libraries: each pixel is sampled 8x8 against the lines' distances and written as
// an RGBA PNG with node:zlib.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BLUE = [37, 99, 201];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Distances in pixels.
function segment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// A quarter circle from angle a0 to a0 + 90 degrees (screen coordinates, y down).
function quarter(px, py, cx, cy, r, a0) {
  let a = Math.atan2(py - cy, px - cx);
  while (a < a0) a += 2 * Math.PI;
  if (a <= a0 + Math.PI / 2) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  const a1 = a0 + Math.PI / 2;
  return Math.min(
    Math.hypot(px - cx - r * Math.cos(a0), py - cy - r * Math.sin(a0)),
    Math.hypot(px - cx - r * Math.cos(a1), py - cy - r * Math.sin(a1)),
  );
}

// Signed: negative inside the rounded rectangle.
function roundedBox(px, py, x0, y0, x1, y1, r) {
  const qx = Math.abs(px - (x0 + x1) / 2) - ((x1 - x0) / 2 - r);
  const qy = Math.abs(py - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Line centres. page: its sides, top (with a rounded top-left corner of radius r), the fold (a diagonal edge
// from foldX on the top to foldY on the right, and the fold's own two edges) and its text lines, which run
// from x0 to x1. The page's sides end at the tray's top edge. The 24-unit design is scaled for 48 px and up;
// 16 and 32 px have their own, placed on the pixel grid so their lines stay sharp.
const DESIGN = {
  w: 1.5,
  page: { x0: 5.75, x1: 18.25, y0: 2.75, r: 2, foldX: 14, foldY: 7 },
  text: [
    { y: 10, x0: 9, x1: 15 },
    { y: 13, x0: 9, x1: 12.5 },
  ],
  tray: { x0: 2.75, y0: 16, x1: 21.25, y1: 21.25, r: 1.75 },
  slot: { y: 18.625, x0: 9.5, x1: 14.5 },
};
const PIXEL = {
  16: {
    w: 1,
    page: { x0: 3.5, x1: 12.5, y0: 2.5, r: 0, foldX: 9.5, foldY: 5.5 },
    text: [{ y: 7.5, x0: 6.5, x1: 9.5 }],
    tray: { x0: 1.5, y0: 10.5, x1: 14.5, y1: 14.5, r: 1.5 },
    slot: { y: 12.5, x0: 6.5, x1: 9.5 },
  },
  32: {
    w: 2,
    page: { x0: 7, x1: 25, y0: 3, r: 2, foldX: 19, foldY: 9 },
    text: [
      { y: 13, x0: 12, x1: 20 },
      { y: 17, x0: 12, x1: 16 },
    ],
    tray: { x0: 3, y0: 21, x1: 29, y1: 29, r: 2.5 },
    slot: { y: 25, x0: 13, x1: 19 },
  },
};

const LENGTHS = new Set(['r', 'w']);

function layout(art, pad) {
  if (PIXEL[art]) return PIXEL[art];
  const k = art / 24;
  const place = (o) => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, v * k + (LENGTHS.has(key) ? 0 : pad)]));
  return { w: DESIGN.w * k, page: place(DESIGN.page), text: DESIGN.text.map(place), tray: place(DESIGN.tray), slot: place(DESIGN.slot) };
}

function sample(x, y, shape) {
  const { page: p, text, tray: t, slot } = shape;
  const inTray = roundedBox(x, y, t.x0, t.y0, t.x1, t.y1, t.r);
  const d = Math.min(
    Math.abs(inTray),
    segment(x, y, slot.x0, slot.y, slot.x1, slot.y),
    // Page outline, left side up and round to the right side.
    segment(x, y, p.x0, t.y0, p.x0, p.y0 + p.r),
    p.r ? quarter(x, y, p.x0 + p.r, p.y0 + p.r, p.r, Math.PI) : Infinity,
    segment(x, y, p.x0 + p.r, p.y0, p.foldX, p.y0),
    segment(x, y, p.foldX, p.y0, p.x1, p.foldY),
    segment(x, y, p.x1, p.foldY, p.x1, t.y0),
    // The fold.
    segment(x, y, p.foldX, p.y0, p.foldX, p.foldY),
    segment(x, y, p.foldX, p.foldY, p.x1, p.foldY),
    ...text.map((l) => segment(x, y, l.x0, l.y, l.x1, l.y)),
  );
  if (d <= shape.w / 2) return BLUE;
  if (inTray < 0) return WHITE;
  const inCorner = x < p.x0 + p.r && y < p.y0 + p.r && Math.hypot(x - p.x0 - p.r, y - p.y0 - p.r) > p.r;
  const pastFold = x - p.foldX > y - p.y0;
  return x > p.x0 && x < p.x1 && y > p.y0 && y < t.y0 && !inCorner && !pastFold ? WHITE : null;
}

// pad: transparent margin in pixels on each side, around the artwork.
function render(size, pad = 0) {
  const art = size - 2 * pad;
  const shape = layout(art, pad);
  const rgba = Buffer.alloc(size * size * 4);
  const S = 8;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = sample(px + (sx + 0.5) / S, py + (sy + 0.5) / S, shape);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a++;
          }
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  return png(size, rgba);
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), render(size));
}
// The store icon: 96x96 artwork with 16 px of transparent padding, as the Chrome Web Store asks.
mkdirSync(new URL('../store/', import.meta.url), { recursive: true });
writeFileSync(new URL('../store/icon-128.png', import.meta.url), render(128, 16));
console.log('wrote public/icons/icon-{16,32,48,128}.png and store/icon-128.png');
