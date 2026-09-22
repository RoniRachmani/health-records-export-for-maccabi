// Draws the extension icon into public/icons/icon-<size>.png: a folder with a download arrow in it.
// The register is Maccabi Online's own illustration set — a navy (#083f92) outline of even weight with
// round joins, and a pale-pink (#f1c1cd) echo of the same outline offset up and to the left, so the mark
// reads as slightly off-register print. The folder is filled white so the navy stays visible on a dark
// toolbar. No image libraries: the outline is a polygon with a radius per corner, flattened to a
// polyline; each pixel is sampled 8x8 against that polyline's distance and written as an RGBA PNG with
// node:zlib.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const NAVY = [8, 63, 146];
const PINK = [241, 193, 205];
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

// The mark on a 24-unit grid. `folder` is [x, y, corner radius] per vertex, clockwise from the tab's
// top-left; `arrow` is a list of segments. `echo` is the pink copy's offset and its (heavier) weight.
// The design is scaled for 48 px and up.
const DESIGN = {
  w: 1.6,
  folder: [
    [2.75, 4.25, 2.75],
    [9.4, 4.25, 0.8],
    [11.75, 7, 0.8],
    [21.25, 7, 2.75],
    [21.25, 21, 2.75],
    [2.75, 21, 2.75],
  ],
  arrow: [
    [[12, 11.25], [12, 16.75]],
    [[9.4, 14.15], [12, 16.75]],
    [[12, 16.75], [14.6, 14.15]],
  ],
  echo: { dx: -1.1, dy: -1.1, w: 2.55 },
};

// 16 and 32 px have their own layouts, already in device pixels and placed on the pixel grid so the
// lines stay sharp: a stroke reads crisply when its centre sits on a half-pixel at width 1, and on a
// whole pixel at width 2. The arrow is off the folder's centre by half a pixel at 16 px, which is
// invisible at that size and buys a clean shaft. 16 px drops the echo — it lands under a pixel wide
// there and only muddies the outline — and loses the tab's small radii, which cannot survive anyway.
const PIXEL = {
  16: {
    w: 1,
    folder: [
      [1.5, 3.5, 1.75],
      [6.5, 3.5, 0],
      [8.5, 5.5, 0],
      [14.5, 5.5, 1.75],
      [14.5, 13.5, 1.75],
      [1.5, 13.5, 1.75],
    ],
    // Drawn solid rather than stroked: a 1 px chevron cannot read as an arrowhead at this size, it
    // just makes a cross. Nor can a sloped head — its half-covered pixels wash out and leave the same
    // cross — so the head is a staircase of whole pixels, 6 wide then 4 then 2, under a 2 px shaft.
    // A fill lands on whole pixels when its edges are whole numbers, where a stroke wants its centre
    // on a half; these are integers, symmetric about the folder's centre at x 8.
    arrow: [],
    solid: [[
      [7, 7], [9, 7], [9, 9], [11, 9], [11, 10], [10, 10], [10, 11], [9, 11],
      [9, 12], [7, 12], [7, 11], [6, 11], [6, 10], [5, 10], [5, 9], [7, 9],
    ]],
    echo: null,
  },
  32: {
    w: 2,
    folder: [
      [4, 6, 3.5],
      [13, 6, 1],
      [16, 9, 1],
      [28, 9, 3.5],
      [28, 28, 3.5],
      [4, 28, 3.5],
    ],
    arrow: [
      [[16, 14], [16, 23]],
      [[11, 18], [16, 23]],
      [[16, 23], [21, 18]],
    ],
    echo: { dx: -1.5, dy: -1.5, w: 3.4 },
  },
};

const norm = (x, y) => {
  const h = Math.hypot(x, y);
  return [x / h, y / h];
};

// A polygon with a radius per corner, flattened to a closed polyline: each corner becomes its two
// tangent points and the arc between them, stepped fine enough that the curve is smooth at 128 px.
function flatten(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [vx, vy, r] = pts[i];
    const [px, py] = pts[(i - 1 + pts.length) % pts.length];
    const [nx, ny] = pts[(i + 1) % pts.length];
    if (r <= 0) {
      out.push([vx, vy]);
      continue;
    }
    const u = norm(px - vx, py - vy);
    const w = norm(nx - vx, ny - vy);
    const half = Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1]))) / 2;
    const t = r / Math.tan(half);
    const bis = norm(u[0] + w[0], u[1] + w[1]);
    const d = r / Math.sin(half);
    const cx = vx + bis[0] * d;
    const cy = vy + bis[1] * d;
    const a0 = Math.atan2(vy + u[1] * t - cy, vx + u[0] * t - cx);
    let sweep = Math.atan2(vy + w[1] * t - cy, vx + w[0] * t - cx) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * r) / 0.2));
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (sweep * s) / steps;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return out;
}

// Segments packed flat as [ax, ay, dx, dy, 1/len^2], so the inner loop stays in one typed array.
function pack(segments) {
  const e = new Float64Array(segments.length * 5);
  segments.forEach(([ax, ay, bx, by], i) => {
    const dx = bx - ax;
    const dy = by - ay;
    e.set([ax, ay, dx, dy, 1 / (dx * dx + dy * dy || 1)], i * 5);
  });
  return e;
}

const closed = (poly) => pack(poly.map((a, i) => [...a, ...poly[(i + 1) % poly.length]]));

// Squared distance, so the whole sample runs without a square root.
function dist2(px, py, e) {
  let best = Infinity;
  for (let i = 0; i < e.length; i += 5) {
    const ax = e[i];
    const ay = e[i + 1];
    const dx = e[i + 2];
    const dy = e[i + 3];
    let t = ((px - ax) * dx + (py - ay) * dy) * e[i + 4];
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = px - ax - t * dx;
    const qy = py - ay - t * dy;
    const d2 = qx * qx + qy * qy;
    if (d2 < best) best = d2;
  }
  return best;
}

// Ray casting, so the white fill follows whatever the outline happens to be.
function inside(px, py, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// art: the artwork's size in pixels; pad: the transparent margin around it. A PIXEL layout is already
// in device pixels, so it is used as-is — but only when it is being drawn at its own size, unpadded.
function layout(art, pad) {
  const k = art / 24;
  const place = (d, s, off) => ({
    folder: d.folder.map(([x, y, r]) => [x * s + off, y * s + off, r * s]),
    arrow: d.arrow.map(([a, b]) => [a[0] * s + off, a[1] * s + off, b[0] * s + off, b[1] * s + off]),
    solid: (d.solid || []).map((p) => p.map(([x, y]) => [x * s + off, y * s + off])),
    echo: d.echo && { dx: d.echo.dx * s, dy: d.echo.dy * s, w: d.echo.w * s },
    w: d.w * s,
  });
  const d = !pad && PIXEL[art] ? place(PIXEL[art], 1, 0) : place(DESIGN, k, pad);
  const poly = flatten(d.folder);
  return {
    poly,
    edges: closed(poly),
    echo: d.echo && closed(poly.map(([x, y]) => [x + d.echo.dx, y + d.echo.dy])),
    arrow: pack(d.arrow),
    solid: d.solid,
    r2: (d.w / 2) ** 2,
    echoR2: d.echo ? (d.echo.w / 2) ** 2 : 0,
  };
}

// Painted back to front: the pink echo, the folder's white fill, then the navy outline and arrow.
function sample(x, y, s) {
  if (dist2(x, y, s.edges) <= s.r2 || dist2(x, y, s.arrow) <= s.r2) return NAVY;
  for (const p of s.solid) if (inside(x, y, p)) return NAVY;
  if (inside(x, y, s.poly)) return WHITE;
  if (s.echo && dist2(x, y, s.echo) <= s.echoR2) return PINK;
  return null;
}

// pad: transparent margin in pixels on each side, around the artwork.
function render(size, pad = 0) {
  const shape = layout(size - 2 * pad, pad);
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
