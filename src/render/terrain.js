import { TILE, WORLD_W, WORLD_H } from '../config.js';
import { CREEK, GROUND_DECOR, PATHS } from '../data/world.js';
import { PLAZA } from '../data/village.js';
import { mulberry32 } from '../core/rng.js';

// Paints the static ground layer once at load.
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
  for (let x = 0; x <= WORLD_W + step; x += step) p.lineTo(x, top(x));
  for (let x = WORLD_W + step; x >= -step; x -= step) p.lineTo(x, bot(x));
  p.closePath();
  return p;
}

export function buildGround(assets, res, groundDrawables) {
  const rand = mulberry32(1337);
  const out = canvas(WORLD_W * res, WORLD_H * res);
  const g = out.getContext('2d');
  g.scale(res, res);
  g.imageSmoothingQuality = 'high';

  // 1. grass
  const grassImg = assets.get('terrain.grass_detailed');
  g.fillStyle = grassImg ? averageColor(grassImg) : '#6fa83c';
  g.fillRect(0, 0, WORLD_W, WORLD_H);
  const grassStamps = [];
  if (grassImg) grassStamps.push(makeStamp(grassImg, 0.12, 180, 0.45), makeStamp(grassImg, 0.2, 180, 0.45));
  const flowerImg = assets.get('terrain2.grass_flower');
  const flowerStamps = flowerImg ? [makeStamp(flowerImg, 0.15, 170, 0.4)] : [];
  if (grassStamps.length) splat(g, grassStamps, rand, 0, 0, WORLD_W, WORLD_H, 170, 100, 50);
  if (flowerStamps.length) {
    for (let i = 0; i < 46; i++) {
      g.save();
      g.globalAlpha = 0.85;
      g.drawImage(flowerStamps[0], rand() * WORLD_W - 85, rand() * WORLD_H - 85, 170, 170);
      g.restore();
    }
  }
  // gentle large-scale light/dark variation so the meadow doesn't look uniform
  for (let i = 0; i < 40; i++) {
    const x = rand() * WORLD_W, y = rand() * WORLD_H, r = 120 + rand() * 260;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() < 0.5;
    grad.addColorStop(0, light ? 'rgba(255,240,150,0.10)' : 'rgba(20,60,10,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 2. dirt paths: splatted dirt texture masked by soft path strokes
  const dirtImgs = [assets.get('terrain2.dirt_path'), assets.get('terrain.dirt_detailed')].filter(Boolean);
  if (dirtImgs.length) {
    const dirt = canvas(WORLD_W, WORLD_H);
    const dg = dirt.getContext('2d');
    dg.fillStyle = averageColor(dirtImgs[0]);
    dg.fillRect(0, 0, WORLD_W, WORLD_H);
    splat(dg, dirtImgs.map((im) => makeStamp(im, 0.14, 150, 0.5)), rand, 0, 0, WORLD_W, WORLD_H, 150, 90, 40);
    const mask = canvas(WORLD_W, WORLD_H);
    const mg = mask.getContext('2d');
    for (const [extra, alpha] of [[0.5, 0.25], [0.3, 0.5], [0.12, 0.8], [0, 1]]) {
      mg.strokeStyle = `rgba(0,0,0,${alpha})`;
      strokePaths(mg, extra);
    }
    dg.globalCompositeOperation = 'destination-in';
    dg.drawImage(mask, 0, 0);
    // darker worn edge under the path
    g.save();
    g.globalAlpha = 0.28;
    g.strokeStyle = '#4a3a17';
    strokePaths(g, 0.55);
    g.restore();
    g.drawImage(dirt, 0, 0);
  }

  // 2b. village square: cobbles, feathered at the edge, with a worn dark rim
  const cobbles = ['terrain2.cobblestone_path', 'terrain.cobblestone_detailed'].map((k) => assets.get(k)).filter(Boolean);
  if (cobbles.length) {
    const px = PLAZA.x0 * TILE, py = PLAZA.y0 * TILE, pw = (PLAZA.x1 - PLAZA.x0) * TILE, ph = (PLAZA.y1 - PLAZA.y0) * TILE;
    const pad = 40;
    const sq = canvas(pw + pad * 2, ph + pad * 2);
    const sg = sq.getContext('2d');
    sg.fillStyle = averageColor(cobbles[0]);
    sg.fillRect(0, 0, sq.width, sq.height);
    splat(sg, cobbles.map((im) => makeStamp(im, 0.12, 150, 0.6)), rand, 0, 0, sq.width, sq.height, 150, 80, 30);
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
    g.save();
    g.globalAlpha = 0.3;
    g.fillStyle = '#4a3a17';
    g.beginPath();
    g.roundRect(px - 10, py - 10, pw + 20, ph + 20, 30);
    g.fill();
    g.restore();
    g.drawImage(sq, px - pad, py - pad);
  }

  // 3. creek: muddy bank, splatted water, rocks on both banks
  const waterImgs = [assets.get('terrain2.pond_water'), assets.get('terrain.water_pond_detailed')].filter(Boolean);
  const bank = creekPath(mulberry32(7), 0.22);
  g.fillStyle = '#5d4a2a';
  g.fill(bank);
  if (waterImgs.length) {
    const water = canvas(WORLD_W, (CREEK.y1 - CREEK.y0 + 1) * TILE);
    const wg = water.getContext('2d');
    wg.fillStyle = averageColor(waterImgs[0]);
    wg.fillRect(0, 0, water.width, water.height);
    splat(wg, waterImgs.map((im) => makeStamp(im, 0.24, 160, 0.45)), rand, 0, 0, water.width, water.height, 160, 95, 40);
    g.save();
    g.clip(creekPath(mulberry32(7), 0));
    g.drawImage(water, 0, (CREEK.y0 - 0.5) * TILE);
    // soft shade along the banks
    const sh = g.createLinearGradient(0, CREEK.y0 * TILE, 0, CREEK.y1 * TILE);
    sh.addColorStop(0, 'rgba(10,40,60,0.35)');
    sh.addColorStop(0.25, 'rgba(10,40,60,0)');
    sh.addColorStop(0.8, 'rgba(10,40,60,0)');
    sh.addColorStop(1, 'rgba(10,40,60,0.25)');
    g.fillStyle = sh;
    g.fillRect(0, CREEK.y0 * TILE - 20, WORLD_W, (CREEK.y1 - CREEK.y0) * TILE + 40);
    g.restore();
  }
  const rocks = ['foliage.rock_small', 'foliage.rock_cluster'].map((k) => assets.get(k)).filter(Boolean);
  if (rocks.length) {
    for (let x = 0.4; x < WORLD_W / TILE; x += 0.9 + rand() * 1.4) {
      if (x > 16.2 && x < 19.6) continue; // keep the bridge approach clear
      const top = rand() < 0.5;
      const y = top ? CREEK.y0 + 0.3 : CREEK.y1 + 0.35;
      drawSprite(g, rocks[Math.floor(rand() * rocks.length)], x, y, 0.7 + rand() * 0.5, rand() < 0.5);
    }
  }

  // 4. low decoration
  for (const [key, x, y, w] of GROUND_DECOR) {
    const img = assets.get(key);
    if (img) drawSprite(g, img, x, y, w, rand() < 0.5);
  }
  const tufts = ['foliage.grass_tall', 'foliage.fern'].map((k) => assets.get(k)).filter(Boolean);
  for (let i = 0; i < 26 && tufts.length; i++) {
    const x = 2 + rand() * 32, y = 3 + rand() * 20;
    if (Math.abs(x - 17.9) < 1.5 || Math.abs(y - 11.6) < 1.3 || (x > 3.5 && x < 10.5 && y > 12.5 && y < 20.5)) continue;
    drawSprite(g, tufts[Math.floor(rand() * tufts.length)], x, y, 0.55 + rand() * 0.3, rand() < 0.5);
  }

  // 5. flat world objects (bridge)
  for (const d of groundDrawables) {
    const img = assets.get(d.sprite);
    if (img) g.drawImage(img, d.x - d.w / 2, d.y - d.h, d.w, d.h);
  }
  return out;
}
