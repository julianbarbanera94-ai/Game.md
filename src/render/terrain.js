import { TILE, WORLD_W, WORLD_H } from '../config.js';
import { CREEK, GROUND_DECOR, PATHS } from '../data/world.js';
import { PLAZA } from '../data/village.js';
import { RIVER, CREEK_END_X } from '../data/land.js';
import { mulberry32 } from '../core/rng.js';

// Paints the static ground layer.
//
// The ground is not one big canvas. A "plan" of every stamp, flower, path,
// rock and decoration is worked out once (in a fixed random order, so the world
// always looks the same), and square chunks of it are painted on demand and
// kept in a small cache. Memory stays flat however large the world is.
//
// The supplied terrain "tiles" are illustrated vignettes with ragged edges,
// not seamless tiles, so the ground is built by stamping feather-masked
// centre crops of them (texture splatting). This keeps the hand-painted
// texture of the approved art while avoiding visible tile seams.

export const TERRAIN_KEYS = [
  'terrain.grass_detailed', 'terrain2.grass_flower', 'terrain.dirt_detailed', 'terrain2.dirt_path',
  'terrain2.pond_water', 'terrain.water_pond_detailed', 'terrain.cobblestone_detailed', 'terrain2.cobblestone_path', 'foliage.rock_small', 'foliage.rock_cluster',
  'foliage.grass_tall', 'foliage.fern', ...GROUND_DECOR.map((d) => d[0]),
];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Feathered circular stamp cut from the centre of an image.
function makeStamp(img, inset, size, hardness = 0.5) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const sw = img.width * (1 - inset * 2);
  const sh = img.height * (1 - inset * 2);
  g.drawImage(img, img.width * inset, img.height * inset, sw, sh, 0, 0, size, size);
  g.globalCompositeOperation = 'destination-in';
  const grad = g.createRadialGradient(size / 2, size / 2, size * 0.5 * hardness, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function averageColor(img) {
  const c = canvas(8, 8);
  const g = c.getContext('2d');
  g.drawImage(img, img.width * 0.3, img.height * 0.3, img.width * 0.4, img.height * 0.4, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return `rgb(${(r / n) | 0},${(gg / n) | 0},${(b / n) | 0})`;
}

function splat(g, stamps, rand, x0, y0, x1, y1, size, spacing, jitter) {
  for (let y = y0 - size / 2; y < y1 + size / 2; y += spacing) {
    for (let x = x0 - size / 2; x < x1 + size / 2; x += spacing) {
      const s = stamps[Math.floor(rand() * stamps.length)];
      const px = x + (rand() - 0.5) * jitter;
      const py = y + (rand() - 0.5) * jitter;
      g.save();
      g.translate(px, py);
      if (rand() < 0.5) g.scale(-1, 1);
      g.drawImage(s, -size / 2, -size / 2, size, size);
      g.restore();
    }
  }
}

function drawSprite(g, img, x, y, wTiles, flip = false) {
  const w = wTiles * TILE;
  const h = (w * img.height) / img.width;
  g.save();
  g.translate(x * TILE, y * TILE);
  if (flip) g.scale(-1, 1);
  g.drawImage(img, -w / 2, -h, w, h);
  g.restore();
}

function strokePaths(g, extra) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const p of PATHS) {
    g.lineWidth = (p.width + extra) * TILE;
    g.beginPath();
    g.moveTo(p.from[0] * TILE, p.from[1] * TILE);
    g.lineTo(p.to[0] * TILE, p.to[1] * TILE);
    g.stroke();
  }
}

// Wavy creek outline (top and bottom banks), returned as a Path2D.
function creekPath(rand, grow = 0) {
  const p = new Path2D();
  const step = TILE / 2;
  const ph1 = rand() * 6, ph2 = rand() * 6;
  const top = (x) => (CREEK.y0 - grow) * TILE + Math.sin(x / 140 + ph1) * 7 + Math.sin(x / 47 + ph2) * 3;
  const bot = (x) => (CREEK.y1 + grow) * TILE + Math.sin(x / 120 + ph2) * 7 + Math.sin(x / 53 + ph1) * 3;
  p.moveTo(-10, top(0));
  const end = CREEK_END_X * TILE;
  for (let x = 0; x <= end + step; x += step) p.lineTo(x, top(x));
  for (let x = end + step; x >= -step; x -= step) p.lineTo(x, bot(x));
  p.closePath();
  return p;
}

export const CHUNK = 1024; // world px per chunk side
const PAD = 8; // each chunk is painted a little wider so seams never show

// ---------------------------------------------------------------- the plan
// Everything random is decided here, once, in the same order the old
// single-canvas builder used, so chunking does not change how the ground looks.
function makePlan(assets, groundDrawables) {
  const rand = mulberry32(1337);
  const plan = { groundDrawables };
  const collect = (x0, y0, x1, y1, count, size, spacing, jitter) => {
    const out = [];
    for (let y = y0 - size / 2; y < y1 + size / 2; y += spacing) {
      for (let x = x0 - size / 2; x < x1 + size / 2; x += spacing) {
        const si = Math.floor(rand() * count);
        const px = x + (rand() - 0.5) * jitter;
        const py = y + (rand() - 0.5) * jitter;
        out.push({ si, x: px, y: py, flip: rand() < 0.5, size });
      }
    }
    return out;
  };

  // 1. grass
  const grassImg = assets.get('terrain.grass_detailed');
  plan.grassColor = grassImg ? averageColor(grassImg) : '#6fa83c';
  plan.grassStamps = grassImg ? [makeStamp(grassImg, 0.12, 180, 0.45), makeStamp(grassImg, 0.2, 180, 0.45)] : [];
  const flowerImg = assets.get('terrain2.grass_flower');
  plan.flowerStamp = flowerImg ? makeStamp(flowerImg, 0.15, 170, 0.4) : null;
  plan.grass = plan.grassStamps.length ? collect(0, 0, WORLD_W, WORLD_H, plan.grassStamps.length, 170, 100, 50) : [];
  plan.flowers = [];
  if (plan.flowerStamp) for (let i = 0; i < 46; i++) plan.flowers.push({ x: rand() * WORLD_W - 85, y: rand() * WORLD_H - 85 });
  plan.blobs = [];
  for (let i = 0; i < 40; i++) {
    const x = rand() * WORLD_W, y = rand() * WORLD_H, r = 120 + rand() * 260;
    plan.blobs.push({ x, y, r, light: rand() < 0.5 });
  }

  // 2. dirt paths
  const dirtImgs = [assets.get('terrain2.dirt_path'), assets.get('terrain.dirt_detailed')].filter(Boolean);
  plan.dirt = null;
  if (dirtImgs.length) {
    const stamps = dirtImgs.map((im) => makeStamp(im, 0.14, 150, 0.5));
    plan.dirt = { color: averageColor(dirtImgs[0]), stamps, splats: collect(0, 0, WORLD_W, WORLD_H, stamps.length, 150, 90, 40) };
  }

  // 2b. village square: painted once into its own small canvas
  const cobbles = ['terrain2.cobblestone_path', 'terrain.cobblestone_detailed'].map((k) => assets.get(k)).filter(Boolean);
  plan.plaza = null;
  if (cobbles.length) {
    const px = PLAZA.x0 * TILE, py = PLAZA.y0 * TILE, pw = (PLAZA.x1 - PLAZA.x0) * TILE, ph = (PLAZA.y1 - PLAZA.y0) * TILE;
    const pad = 40;
    const sq = canvas(pw + pad * 2, ph + pad * 2);
    const sg = sq.getContext('2d');
    sg.fillStyle = averageColor(cobbles[0]);
    sg.fillRect(0, 0, sq.width, sq.height);
    const cstamps = cobbles.map((im) => makeStamp(im, 0.12, 150, 0.6));
    for (const e of collect(0, 0, sq.width, sq.height, cstamps.length, 150, 80, 30)) {
      sg.save();
      sg.translate(e.x, e.y);
      if (e.flip) sg.scale(-1, 1);
      sg.drawImage(cstamps[e.si], -e.size / 2, -e.size / 2, e.size, e.size);
      sg.restore();
    }
    const edge = canvas(sq.width, sq.height);
    const eg = edge.getContext('2d');
    for (const [grow, alpha] of [[34, 0.2], [26, 0.4], [18, 0.7], [8, 1]]) { // outermost first, fully opaque in the middle
      eg.fillStyle = `rgba(0,0,0,${alpha})`;
      eg.beginPath();
      eg.roundRect(pad - grow, pad - grow, pw + grow * 2, ph + grow * 2, 28);
      eg.fill();
    }
    sg.globalCompositeOperation = 'destination-in';
    sg.drawImage(edge, 0, 0);
    plan.plaza = { px, py, pw, ph, pad, canvas: sq };
  }

  // 3. creek: muddy bank, splatted water, rocks on both banks
  const waterImgs = [assets.get('terrain2.pond_water'), assets.get('terrain.water_pond_detailed')].filter(Boolean);
  plan.bank = creekPath(mulberry32(7), 0.22);
  plan.creekClip = creekPath(mulberry32(7), 0);
  plan.water = null;
  if (waterImgs.length) {
    const stamps = waterImgs.map((im) => makeStamp(im, 0.24, 160, 0.45));
    const h = (CREEK.y1 - CREEK.y0 + 1) * TILE;
    plan.water = { color: averageColor(waterImgs[0]), stamps, offsetY: (CREEK.y0 - 0.5) * TILE, h, splats: collect(0, 0, CREEK_END_X * TILE, h, stamps.length, 160, 95, 40) };
  }
  const rocks = ['foliage.rock_small', 'foliage.rock_cluster'].map((k) => assets.get(k)).filter(Boolean);
  plan.rocks = [];
  if (rocks.length) {
    for (let x = 0.4; x < CREEK_END_X; x += 0.9 + rand() * 1.4) {
      if (x > 16.2 && x < 19.6) continue; // keep the bridge approach clear
      const top = rand() < 0.5;
      const y = top ? CREEK.y0 + 0.3 : CREEK.y1 + 0.35;
      const img = rocks[Math.floor(rand() * rocks.length)];
      plan.rocks.push({ img, x, y, w: 0.7 + rand() * 0.5, flip: rand() < 0.5 });
    }
  }

  // 3b. the east river: bank, water stamped from the pond water, a soft edge
  plan.river = null;
  if (waterImgs.length) {
    const rr = mulberry32(99);
    const stamps = waterImgs.map((im) => makeStamp(im, 0.24, 160, 0.45));
    const pts = RIVER.line.map(([x, y]) => [x * TILE, y * TILE]);
    const splats = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 70));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        splats.push({ si: Math.floor(rr() * stamps.length), x: ax + (bx - ax) * t + (rr() - 0.5) * 40, y: ay + (by - ay) * t + (rr() - 0.5) * 40, flip: rr() < 0.5, size: 190 });
      }
    }
    plan.river = { pts, stamps, splats, color: averageColor(waterImgs[0]) };
  }

  // 4. low decoration
  plan.decor = [];
  for (const [key, x, y, w] of GROUND_DECOR) {
    const img = assets.get(key);
    if (img) plan.decor.push({ img, x, y, w, flip: rand() < 0.5 });
  }
  const tufts = ['foliage.grass_tall', 'foliage.fern'].map((k) => assets.get(k)).filter(Boolean);
  for (let i = 0; i < 26 && tufts.length; i++) {
    const x = 2 + rand() * 32, y = 3 + rand() * 20;
    if (Math.abs(x - 17.9) < 1.5 || Math.abs(y - 11.6) < 1.3 || (x > 3.5 && x < 10.5 && y > 12.5 && y < 20.5)) continue;
    const img = tufts[Math.floor(rand() * tufts.length)];
    plan.decor.push({ img, x, y, w: 0.55 + rand() * 0.3, flip: rand() < 0.5 });
  }
  return plan;
}

// ---------------------------------------------------------------- painting
// A canvas that covers world rect (rx, ry, rw, rh) at `res` px per world px,
// with its context set up to take world coordinates.
function layer(rx, ry, rw, rh, res) {
  const c = canvas(rw * res, rh * res);
  const g = c.getContext('2d');
  g.scale(res, res);
  g.translate(-rx, -ry);
  g.imageSmoothingQuality = 'high';
  return { c, g };
}

// Paints the part of the plan inside world rect (rx, ry, rw, rh) onto `g`
// (already set up for world coordinates, see layer()).
function paintPlan(plan, g, rx, ry, rw, rh, res) {
  const vis = (x, y, r) => x + r > rx && x - r < rx + rw && y + r > ry && y - r < ry + rh;
  const stamp = (gg, stamps, e) => {
    gg.save();
    gg.translate(e.x, e.y);
    if (e.flip) gg.scale(-1, 1);
    gg.drawImage(stamps[e.si], -e.size / 2, -e.size / 2, e.size, e.size);
    gg.restore();
  };
  g.imageSmoothingQuality = 'high';

  // 1. grass, flowers and the slow light/dark drift of the meadow
  g.fillStyle = plan.grassColor;
  g.fillRect(rx, ry, rw, rh);
  for (const e of plan.grass) if (vis(e.x, e.y, e.size)) stamp(g, plan.grassStamps, e);
  for (const f of plan.flowers) {
    if (!vis(f.x + 85, f.y + 85, 90)) continue;
    g.save();
    g.globalAlpha = 0.85;
    g.drawImage(plan.flowerStamp, f.x, f.y, 170, 170);
    g.restore();
  }
  for (const b of plan.blobs) {
    if (!vis(b.x, b.y, b.r)) continue;
    const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    grad.addColorStop(0, b.light ? 'rgba(255,240,150,0.10)' : 'rgba(20,60,10,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }

  // 2. dirt paths: splatted dirt texture masked by soft path strokes
  if (plan.dirt) {
    const dirt = layer(rx, ry, rw, rh, res);
    dirt.g.fillStyle = plan.dirt.color;
    dirt.g.fillRect(rx, ry, rw, rh);
    for (const e of plan.dirt.splats) if (vis(e.x, e.y, e.size)) stamp(dirt.g, plan.dirt.stamps, e);
    const mask = layer(rx, ry, rw, rh, res);
    for (const [extra, alpha] of [[0.5, 0.25], [0.3, 0.5], [0.12, 0.8], [0, 1]]) {
      mask.g.strokeStyle = `rgba(0,0,0,${alpha})`;
      strokePaths(mask.g, extra);
    }
    dirt.g.save();
    dirt.g.setTransform(1, 0, 0, 1, 0, 0);
    dirt.g.globalCompositeOperation = 'destination-in';
    dirt.g.drawImage(mask.c, 0, 0);
    dirt.g.restore();
    g.save(); // darker worn edge under the path
    g.globalAlpha = 0.28;
    g.strokeStyle = '#4a3a17';
    strokePaths(g, 0.55);
    g.restore();
    g.drawImage(dirt.c, rx, ry, rw, rh);
  }

  // 2b. village square
  const pz = plan.plaza;
  if (pz && vis(pz.px + pz.pw / 2, pz.py + pz.ph / 2, Math.max(pz.pw, pz.ph) / 2 + pz.pad + 20)) {
    g.save();
    g.globalAlpha = 0.3;
    g.fillStyle = '#4a3a17';
    g.beginPath();
    g.roundRect(pz.px - 10, pz.py - 10, pz.pw + 20, pz.ph + 20, 30);
    g.fill();
    g.restore();
    g.drawImage(pz.canvas, pz.px - pz.pad, pz.py - pz.pad);
  }

  // 3. creek
  g.fillStyle = '#5d4a2a';
  g.fill(plan.bank);
  const w = plan.water;
  if (w) {
    g.save();
    g.clip(plan.creekClip);
    g.fillStyle = w.color;
    g.fillRect(rx, w.offsetY, rw, w.h);
    for (const e of w.splats) {
      if (!vis(e.x, e.y + w.offsetY, e.size)) continue;
      stamp(g, w.stamps, { ...e, y: e.y + w.offsetY });
    }
    const sh = g.createLinearGradient(0, CREEK.y0 * TILE, 0, CREEK.y1 * TILE); // soft shade along the banks
    sh.addColorStop(0, 'rgba(10,40,60,0.35)');
    sh.addColorStop(0.25, 'rgba(10,40,60,0)');
    sh.addColorStop(0.8, 'rgba(10,40,60,0)');
    sh.addColorStop(1, 'rgba(10,40,60,0.25)');
    g.fillStyle = sh;
    g.fillRect(rx, CREEK.y0 * TILE - 20, rw, (CREEK.y1 - CREEK.y0) * TILE + 40);
    g.restore();
  }
  for (const r of plan.rocks) if (vis(r.x * TILE, r.y * TILE, 160)) drawSprite(g, r.img, r.x, r.y, r.w, r.flip);
  const rv = plan.river;
  if (rv) {
    const trace = () => {
      g.beginPath();
      rv.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    };
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#5d4a2a'; // muddy bank
    g.lineWidth = (RIVER.width + 0.9) * TILE;
    trace(); g.stroke();
    g.strokeStyle = rv.color; // base water colour, then the stamped texture clipped to the channel
    g.lineWidth = RIVER.width * TILE;
    trace(); g.stroke();
    // clip to the channel by drawing stamps into a mask-limited layer
    const ch = layer(rx, ry, rw, rh, res);
    for (const e of rv.splats) if (vis(e.x, e.y, e.size)) stamp(ch.g, rv.stamps, e);
    const cm = layer(rx, ry, rw, rh, res);
    cm.g.lineCap = 'round'; cm.g.lineJoin = 'round';
    cm.g.strokeStyle = '#000'; cm.g.lineWidth = RIVER.width * TILE;
    cm.g.beginPath(); rv.pts.forEach(([x, y], i) => (i ? cm.g.lineTo(x, y) : cm.g.moveTo(x, y))); cm.g.stroke();
    ch.g.save(); ch.g.setTransform(1, 0, 0, 1, 0, 0); ch.g.globalCompositeOperation = 'destination-in'; ch.g.drawImage(cm.c, 0, 0); ch.g.restore();
    g.drawImage(ch.c, rx, ry, rw, rh);
    g.strokeStyle = 'rgba(10,40,60,0.18)'; // darker middle of the channel
    g.lineWidth = RIVER.width * TILE * 0.5;
    trace(); g.stroke();
    g.restore();
  }

  // 4. low decoration
  for (const d of plan.decor) if (vis(d.x * TILE, d.y * TILE, d.w * TILE * 1.6 + 80)) drawSprite(g, d.img, d.x, d.y, d.w, d.flip);

  // 5. flat world objects (bridge)
  for (const d of plan.groundDrawables) {
    if (!vis(d.x, d.y - d.h / 2, Math.max(d.w, d.h))) continue;
    g.drawImage(d.__img, d.x - d.w / 2, d.y - d.h, d.w, d.h);
  }
}

// ---------------------------------------------------------------- the layer
// Square chunks painted on demand and kept in a small cache, plus a small
// whole-world overview for the map screen and for chunks still being built.
export class GroundLayer {
  constructor(assets, res, groundDrawables, { maxLive = 8 } = {}) {
    for (const d of groundDrawables) d.__img = assets.get(d.sprite);
    this.plan = makePlan(assets, groundDrawables.filter((d) => d.__img));
    this.res = res;
    this.maxLive = maxLive;
    this.cols = Math.ceil(WORLD_W / CHUNK);
    this.rows = Math.ceil(WORLD_H / CHUNK);
    this.cache = new Map();
    this.frame = 0;
    this.ovScale = Math.min(0.5, 3000 / WORLD_W);
    const ov = layer(0, 0, WORLD_W, WORLD_H, this.ovScale);
    paintPlan(this.plan, ov.g, 0, 0, WORLD_W, WORLD_H, this.ovScale);
    this.overview = ov.c;
  }

  chunkRect(cx, cy) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    return { x0: x0 - PAD, y0: y0 - PAD, w: Math.min(CHUNK, WORLD_W - x0) + PAD * 2, h: Math.min(CHUNK, WORLD_H - y0) + PAD * 2 };
  }

  get(cx, cy, used = this.frame) {
    const key = cy * this.cols + cx;
    let e = this.cache.get(key);
    if (e) {
      e.used = Math.max(e.used, used);
      return e;
    }
    const r = this.chunkRect(cx, cy);
    const L = layer(r.x0, r.y0, r.w, r.h, this.res);
    paintPlan(this.plan, L.g, r.x0, r.y0, r.w, r.h, this.res);
    e = { c: L.c, r, used };
    this.cache.set(key, e);
    while (this.cache.size > this.maxLive) {
      let oldest = null;
      for (const [k, v] of this.cache) if (v.used < this.frame && (!oldest || v.used < oldest[1].used)) oldest = [k, v];
      if (!oldest) break; // everything is in view: keep it
      this.cache.delete(oldest[0]);
    }
    return e;
  }

  range(v) {
    return {
      c0: Math.max(0, Math.floor(v.x0 / CHUNK)), c1: Math.min(this.cols - 1, Math.floor(v.x1 / CHUNK)),
      r0: Math.max(0, Math.floor(v.y0 / CHUNK)), r1: Math.min(this.rows - 1, Math.floor(v.y1 / CHUNK)),
    };
  }

  // Draw what lies in world rect `v` onto g (already in world coordinates).
  draw(g, v) {
    this.frame++;
    const { c0, c1, r0, r1 } = this.range(v);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const e = this.get(cx, cy);
        g.drawImage(e.c, e.r.x0, e.r.y0, e.r.w, e.r.h);
      }
    }
  }

  // Build one missing chunk next to the view per call, so walking never waits.
  prefetch(v) {
    const { c0, c1, r0, r1 } = this.range({ x0: v.x0 - CHUNK * 0.6, y0: v.y0 - CHUNK * 0.6, x1: v.x1 + CHUNK * 0.6, y1: v.y1 + CHUNK * 0.6 });
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (this.cache.has(cy * this.cols + cx)) continue;
        this.get(cx, cy, this.frame - 1);
        return;
      }
    }
  }

  // Draw the low-resolution whole-world overview (map screen).
  drawOverview(g, rect) {
    const s = this.ovScale;
    g.drawImage(this.overview, rect.x0 * s, rect.y0 * s, (rect.x1 - rect.x0) * s, (rect.y1 - rect.y0) * s, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
  }
}
