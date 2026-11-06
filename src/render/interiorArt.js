import { TILE } from '../config.js';

// Painted interior layers. Every surface is painted at the resolution it will
// be shown at (res = device pixels per world pixel), so the room stays crisp
// at any zoom instead of stretching one small concept image. Output:
//   base   — floor, rug, window light and wall tops (under everything)
//   front  — the front wall strip (drawn over the player near the door)
//   pieces — furniture canvases, drawn y-sorted with the player
// The look follows the approved starting-area palette: warm honey wood,
// soft dark outlines, gentle top-left light.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h, res) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * res));
  c.height = Math.max(1, Math.ceil(h * res));
  const g = c.getContext('2d');
  g.scale(res, res);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { c, g };
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Wavy wood grain across a horizontal (dir 'h') or vertical board.
function grain(g, rand, x, y, w, h, dir = 'h', dark = 'rgba(70,35,12,', count = 0) {
  const n = count || Math.max(3, Math.round((dir === 'h' ? h : w) / 3.2));
  const len = dir === 'h' ? w : h;
  for (let i = 0; i < n; i++) {
    const off = ((i + 0.3 + rand() * 0.5) / n) * (dir === 'h' ? h : w);
    const amp = 0.4 + rand() * 1.1;
    const freq = 0.02 + rand() * 0.05;
    const ph = rand() * 6.28;
    g.beginPath();
    for (let t = 0; t <= len; t += 3) {
      const d = off + Math.sin(t * freq + ph) * amp + Math.sin(t * freq * 3.1 + ph) * amp * 0.3;
      if (dir === 'h') (t ? g.lineTo : g.moveTo).call(g, x + t, y + d);
      else (t ? g.lineTo : g.moveTo).call(g, x + d, y + t);
    }
    g.strokeStyle = `${dark}${(0.08 + rand() * 0.12).toFixed(3)})`;
    g.lineWidth = 0.5 + rand() * 0.6;
    g.stroke();
  }
}

function knot(g, rand, x, y, s) {
  for (let r = 3; r >= 1; r--) {
    g.beginPath();
    g.ellipse(x, y, s * r * 0.9, s * r * 0.45, 0, 0, Math.PI * 2);
    g.strokeStyle = `rgba(80,38,12,${0.12 + (3 - r) * 0.08})`;
    g.lineWidth = 0.7;
    g.stroke();
  }
  g.beginPath();
  g.ellipse(x, y, s * 0.7, s * 0.35, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(90,42,14,0.55)';
  g.fill();
}

// A painted board: base fill, light top edge, dark bottom edge, grain, knots.
function board(g, rand, x, y, w, h, base, dir = 'h', opts = {}) {
  const grad = dir === 'h' ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, shade(base, 0.12));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, shade(base, -0.14));
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // soft colour streaks
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,220,160' : '120,60,20'},${(0.04 + rand() * 0.05).toFixed(3)})`;
    if (dir === 'h') g.fillRect(x + rand() * w * 0.7, y + rand() * h * 0.6, w * (0.2 + rand() * 0.4), h * 0.25);
    else g.fillRect(x + rand() * w * 0.6, y + rand() * h * 0.7, w * 0.25, h * (0.2 + rand() * 0.4));
  }
  grain(g, rand, x, y, w, h, dir);
  if (opts.knots !== false && rand() < 0.45) knot(g, rand, x + w * (0.15 + rand() * 0.7), y + h * (0.3 + rand() * 0.4), Math.min(w, h) * 0.08 + 1);
  g.fillStyle = 'rgba(255,230,180,0.22)';
  if (dir === 'h') g.fillRect(x, y, w, 0.9);
  else g.fillRect(x, y, 0.9, h);
  g.fillStyle = 'rgba(50,22,6,0.55)';
  if (dir === 'h') g.fillRect(x, y + h - 0.9, w, 0.9);
  else g.fillRect(x + w - 0.9, y, 0.9, h);
}

function nail(g, x, y) {
  g.beginPath();
  g.arc(x, y, 0.95, 0, Math.PI * 2);
  g.fillStyle = '#3b2a1e';
  g.fill();
  g.beginPath();
  g.arc(x - 0.3, y - 0.3, 0.4, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,240,210,0.6)';
  g.fill();
}

function softShadow(g, x, y, w, h, a = 0.3) {
  const grad = g.createRadialGradient(x + w / 2, y + h / 2, 1, x + w / 2, y + h / 2, Math.max(w, h) / 2);
  grad.addColorStop(0, `rgba(30,14,4,${a})`);
  grad.addColorStop(0.7, `rgba(30,14,4,${a * 0.45})`);
  grad.addColorStop(1, 'rgba(30,14,4,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.fill();
}

// ------------------------------------------------------------------ room shell

const PLANK_COLOURS = ['#c98f52', '#bf8448', '#d39a5c', '#c28a4f', '#b97d43', '#cf955a'];

function paintFloor(g, rand, x0, y0, x1, y1) {
  const ph = 0.4 * TILE;
  for (let y = y0, row = 0; y < y1; y += ph, row++) {
    let x = x0 - ((row * 37) % 5) * 0.31 * TILE;
    while (x < x1) {
      const len = (2.2 + rand() * 2.6) * TILE;
      const base = PLANK_COLOURS[Math.floor(rand() * PLANK_COLOURS.length)];
      const bx = Math.max(x, x0);
      const bw = Math.min(x + len, x1) - bx;
      if (bw > 2) {
        board(g, rand, bx, y, bw, Math.min(ph, y1 - y), base);
        g.fillStyle = 'rgba(45,20,6,0.7)';
        g.fillRect(bx + bw - 0.8, y, 0.8, ph); // butt joint
        nail(g, bx + bw - 3, y + ph * 0.3);
        nail(g, bx + bw - 3, y + ph * 0.72);
      }
      x += len;
    }
  }
  // worn patch in the walkway and scuffs
  const wear = g.createRadialGradient((x0 + x1) / 2, y1 - 1.6 * TILE, 4, (x0 + x1) / 2, y1 - 1.6 * TILE, 2.6 * TILE);
  wear.addColorStop(0, 'rgba(255,225,170,0.10)');
  wear.addColorStop(1, 'rgba(255,225,170,0)');
  g.fillStyle = wear;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

function paintRug(g, rand, [x0, y0, x1, y1]) {
  const x = x0 * TILE;
  const y = y0 * TILE;
  const w = (x1 - x0) * TILE;
  const h = (y1 - y0) * TILE;
  softShadow(g, x + 2, y + 4, w, h, 0.25);
  // fringe
  g.strokeStyle = '#e8d6a8';
  g.lineWidth = 0.9;
  for (let t = x + 4; t < x + w - 3; t += 2.6) {
    for (const [yy, d] of [[y, -1], [y + h, 1]]) {
      g.beginPath();
      g.moveTo(t, yy);
      g.lineTo(t + (rand() - 0.5) * 1.2, yy + d * (4 + rand() * 1.5));
      g.stroke();
    }
  }
  roundRect(g, x, y, w, h, 5);
  g.fillStyle = '#8c3b2a';
  g.fill();
  // woven texture
  g.save();
  roundRect(g, x, y, w, h, 5);
  g.clip();
  for (let yy = y; yy < y + h; yy += 1.6) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,200,150' : '40,10,5'},${(0.04 + rand() * 0.06).toFixed(3)})`;
    g.fillRect(x, yy, w, 0.8);
  }
  // bands
  const band = (inset, colour, width) => {
    roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, 4);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.stroke();
  };
  band(5, '#e3c27c', 3);
  band(10, '#3f5b3a', 2.2);
  band(14, '#e3c27c', 1.2);
  // diamond medallion and corner motifs
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dia = (px, py, rx, ry, fill, stroke) => {
    g.beginPath();
    g.moveTo(px, py - ry);
    g.lineTo(px + rx, py);
    g.lineTo(px, py + ry);
    g.lineTo(px - rx, py);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = 1.4;
    g.stroke();
  };
  dia(cx, cy, w * 0.28, h * 0.3, '#b65a3c', '#e3c27c');
  dia(cx, cy, w * 0.17, h * 0.18, '#3f5b3a', '#e8d6a8');
  dia(cx, cy, w * 0.06, h * 0.07, '#e3c27c', '#7a2d20');
  for (const [px, py] of [[x + 24, y + 24], [x + w - 24, y + 24], [x + 24, y + h - 24], [x + w - 24, y + h - 24]]) dia(px, py, 6, 6, '#e3c27c', '#3f5b3a');
  // fabric fuzz
  for (let i = 0; i < w * h * 0.05; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,235,200' : '30,8,4'},0.08)`;
    g.fillRect(x + rand() * w, y + rand() * h, 1.1, 1.1);
  }
  g.restore();
  roundRect(g, x, y, w, h, 5);
  g.strokeStyle = 'rgba(50,15,8,0.7)';
  g.lineWidth = 1.2;
  g.stroke();
}

// Timber wall-top beam (what the overhead camera sees of a thick wall).
function beam(g, rand, x, y, w, h, dir) {
  board(g, rand, x, y, w, h, '#6b4228', dir, { knots: true });
  const step = (dir === 'h' ? w : h) / Math.max(1, Math.round((dir === 'h' ? w : h) / (2.2 * TILE)));
  for (let t = step; t < (dir === 'h' ? w : h) - 2; t += step) {
    g.fillStyle = 'rgba(30,14,4,0.8)';
    if (dir === 'h') g.fillRect(x + t, y, 1, h);
    else g.fillRect(x, y + t, w, 1);
  }
  g.strokeStyle = 'rgba(25,10,3,0.9)';
  g.lineWidth = 1.2;
  g.strokeRect(x + 0.6, y + 0.6, w - 1.2, h - 1.2);
}

function paintBackWall(g, rand, def, W) {
  const s = def.wall.side * TILE;
  const top = 0.42 * TILE; // beam along the top
  const face = def.wall.back * TILE;
  // plaster face between timber posts
  const pl = g.createLinearGradient(0, top, 0, face);
  pl.addColorStop(0, '#d9c49a');
  pl.addColorStop(1, '#c6ad80');
  g.fillStyle = pl;
  g.fillRect(s, top, W - 2 * s, face - top);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,248,225' : '110,80,40'},${(0.05 + rand() * 0.06).toFixed(3)})`;
    g.fillRect(s + rand() * (W - 2 * s), top + rand() * (face - top), 1.5 + rand() * 3, 1 + rand() * 1.5);
  }
  // posts and a mid rail
  board(g, rand, s, top + (face - top) * 0.52, W - 2 * s, 5, '#7a4d2c', 'h', { knots: false });
  const posts = [s, W * 0.36, W * 0.64, W - s - 9];
  for (const px of posts) board(g, rand, px, top, 9, face - top, '#734829', 'v', { knots: false });
  // windows
  for (const [a, b] of def.windows) {
    const wx = a * TILE;
    const ww = (b - a) * TILE;
    const wy = top + 6;
    const wh = face - top - 16;
    board(g, rand, wx - 4, wy - 4, ww + 8, wh + 8, '#6e4427', 'h', { knots: false });
    const sky = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
    sky.addColorStop(0, '#cfe9f0');
    sky.addColorStop(0.55, '#9fcfdc');
    sky.addColorStop(1, '#7fb37a');
    g.fillStyle = sky;
    g.fillRect(wx, wy, ww, wh);
    // distant foliage and reflection streaks
    g.fillStyle = 'rgba(70,120,60,0.55)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(wx + rand() * ww, wy + wh * (0.75 + rand() * 0.3), 4 + rand() * 5, 0, Math.PI * 2);
      g.fill();
    }
    g.save();
    g.beginPath();
    g.rect(wx, wy, ww, wh);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(wx + ww * 0.15, wy + wh);
    g.lineTo(wx + ww * 0.45, wy);
    g.stroke();
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(wx + ww * 0.32, wy + wh);
    g.lineTo(wx + ww * 0.6, wy);
    g.stroke();
    g.restore();
    // muntins
    g.fillStyle = '#5b3820';
    g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
    g.fillRect(wx, wy + wh / 2 - 1.2, ww, 2.4);
    // sill with a small pot of flowers
    board(g, rand, wx - 7, wy + wh + 2, ww + 14, 5, '#8a5a33', 'h', { knots: false });
    // curtains
    for (const side of [0, 1]) {
      const cx = side ? wx + ww - 7 : wx - 3;
      const cg = g.createLinearGradient(cx, 0, cx + 10, 0);
      cg.addColorStop(0, '#a8483a');
      cg.addColorStop(0.5, '#c8644f');
      cg.addColorStop(1, '#93392d');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(cx, wy - 4);
      g.lineTo(cx + 10, wy - 4);
      g.quadraticCurveTo(cx + 8, wy + wh * 0.5, cx + (side ? 2 : 8), wy + wh);
      g.lineTo(cx + (side ? -1 : 11), wy + wh);
      g.quadraticCurveTo(cx + 2, wy + wh * 0.5, cx, wy - 4);
      g.fill();
      g.strokeStyle = 'rgba(60,15,10,0.5)';
      g.lineWidth = 0.8;
      g.stroke();
    }
  }
  // hanging shelf with jars between the windows
  const shx = W * 0.41;
  const shw = W * 0.18;
  const shy = top + (face - top) * 0.36;
  for (let i = 0; i < 4; i++) {
    const jx = shx + 6 + i * (shw - 10) / 4;
    const colours = ['#d9a441', '#a33f2f', '#6f8f3a', '#e0d3b0'];
    const jg = g.createLinearGradient(jx, 0, jx + 9, 0);
    jg.addColorStop(0, shade(colours[i], 0.25));
    jg.addColorStop(1, shade(colours[i], -0.25));
    g.fillStyle = jg;
    roundRect(g, jx, shy - 12, 9, 12, 2);
    g.fill();
    g.fillStyle = '#e8dcc0';
    g.fillRect(jx + 1, shy - 14, 7, 3);
    g.strokeStyle = 'rgba(40,20,8,0.6)';
    g.lineWidth = 0.7;
    roundRect(g, jx, shy - 12, 9, 12, 2);
    g.stroke();
  }
  board(g, rand, shx, shy, shw, 4, '#7b4b2a', 'h', { knots: false });
  // contact shadow where the wall meets the floor
  const ao = g.createLinearGradient(0, face, 0, face + 18);
  ao.addColorStop(0, 'rgba(40,18,5,0.45)');
  ao.addColorStop(1, 'rgba(40,18,5,0)');
  g.fillStyle = ao;
  g.fillRect(s, face, W - 2 * s, 18);
  beam(g, rand, 0, 0, W, top, 'h');
}

function paintSideWalls(g, rand, def, W, H) {
  const s = def.wall.side * TILE;
  const front = def.wall.front * TILE;
  for (const x of [0, W - s]) {
    beam(g, rand, x, 0.42 * TILE, s, H - 0.42 * TILE - front, 'v');
    const ao = x ? g.createLinearGradient(x, 0, x - 16, 0) : g.createLinearGradient(s, 0, s + 16, 0);
    ao.addColorStop(0, 'rgba(40,18,5,0.4)');
    ao.addColorStop(1, 'rgba(40,18,5,0)');
    g.fillStyle = ao;
    g.fillRect(x ? x - 16 : s, def.wall.back * TILE, 16, H - def.wall.back * TILE - front);
  }
}

function paintFrontWall(g, rand, def, W, H) {
  const front = def.wall.front * TILE;
  const y = H - front;
  const [d0, d1] = def.door.map((t) => t * TILE);
  beam(g, rand, 0, y, d0, front, 'h');
  beam(g, rand, d1, y, W - d1, front, 'h');
  // threshold and doormat in the gap
  board(g, rand, d0, y + front * 0.35, d1 - d0, front * 0.65, '#8d5f37', 'h', { knots: false });
  const mx = d0 + 6;
  const mw = d1 - d0 - 12;
  roundRect(g, mx, y - 14, mw, 16, 3);
  g.fillStyle = '#9c7a3f';
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(70,45,15,0.45)';
  g.lineWidth = 1;
  for (let t = mx; t < mx + mw; t += 2.4) {
    g.beginPath();
    g.moveTo(t, y - 14);
    g.lineTo(t + 2, y + 2);
    g.stroke();
  }
  g.restore();
  roundRect(g, mx, y - 14, mw, 16, 3);
  g.strokeStyle = 'rgba(50,30,10,0.7)';
  g.stroke();
}

function windowLight(g, def) {
  for (const [a, b] of def.windows) {
    const x = a * TILE;
    const w = (b - a) * TILE;
    const y = def.wall.back * TILE;
    const h = 2.2 * TILE;
    const lg = g.createLinearGradient(0, y, 0, y + h);
    lg.addColorStop(0, 'rgba(255,236,170,0.30)');
    lg.addColorStop(1, 'rgba(255,236,170,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w + 0.7 * TILE, y + h);
    g.lineTo(x + 0.5 * TILE, y + h);
    g.closePath();
    g.fill();
    // window-frame cross in the light
    g.fillStyle = 'rgba(120,70,20,0.08)';
    g.fillRect(x + w / 2 + 0.2 * TILE, y + 0.2 * TILE, 3, h * 0.6);
  }
}

// ------------------------------------------------------------------ furniture

function paintBed(g, rand, w, h) {
  softShadow(g, 4, 10, w, h - 6, 0.35);
  // frame
  board(g, rand, 2, 6, w - 4, h - 10, '#7a4a2a', 'v', { knots: false });
  g.strokeStyle = 'rgba(30,12,3,0.9)';
  g.lineWidth = 1.4;
  g.strokeRect(2, 6, w - 4, h - 10);
  // headboard with posts
  board(g, rand, 0, 0, w, 15, '#6a3f23', 'h');
  for (const px of [0, w - 12]) {
    roundRect(g, px, -1, 12, 18, 4);
    const pg = g.createLinearGradient(px, 0, px + 12, 0);
    pg.addColorStop(0, '#8b5a34');
    pg.addColorStop(1, '#4e2d17');
    g.fillStyle = pg;
    g.fill();
    g.strokeStyle = 'rgba(25,10,3,0.9)';
    g.lineWidth = 1.2;
    g.stroke();
    g.beginPath();
    g.arc(px + 6, 6, 3, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,220,160,0.35)';
    g.fill();
  }
  // sheet and pillow
  const mx = 8;
  const mw = w - 16;
  roundRect(g, mx, 16, mw, h - 30, 5);
  g.fillStyle = '#efe6d2';
  g.fill();
  for (const [px, pw] of [[mx + 4, mw / 2 - 6], [mx + mw / 2 + 2, mw / 2 - 6]]) {
    roundRect(g, px, 20, pw, 26, 9);
    const pg = g.createRadialGradient(px + pw * 0.4, 28, 2, px + pw / 2, 33, pw * 0.7);
    pg.addColorStop(0, '#fffaf0');
    pg.addColorStop(1, '#d9cdb3');
    g.fillStyle = pg;
    g.fill();
    g.strokeStyle = 'rgba(110,90,60,0.6)';
    g.lineWidth = 1;
    g.stroke();
    g.strokeStyle = 'rgba(150,130,100,0.45)';
    g.beginPath();
    g.moveTo(px + pw * 0.3, 26);
    g.quadraticCurveTo(px + pw * 0.5, 31, px + pw * 0.45, 40);
    g.stroke();
  }
  // patchwork quilt
  const qy = 52;
  const qh = h - qy - 16;
  g.save();
  roundRect(g, mx - 2, qy, mw + 4, qh, 6);
  g.clip();
  const patches = ['#b5543f', '#d8b36a', '#6f8b55', '#e6d6b4', '#a8452f', '#c98f52', '#5b7a8c'];
  const cols = 4;
  const pw = (mw + 4) / cols;
  const rows = Math.ceil(qh / pw);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = patches[(r * 3 + c * 5 + Math.floor(rand() * 2)) % patches.length];
      const px = mx - 2 + c * pw;
      const py = qy + r * pw;
      const pgr = g.createLinearGradient(px, py, px + pw, py + pw);
      pgr.addColorStop(0, shade(col, 0.12));
      pgr.addColorStop(1, shade(col, -0.12));
      g.fillStyle = pgr;
      g.fillRect(px, py, pw, pw);
      // tiny print
      g.fillStyle = 'rgba(255,245,220,0.25)';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(px + 3 + rand() * (pw - 6), py + 3 + rand() * (pw - 6), 0.9, 0, Math.PI * 2);
        g.fill();
      }
      g.setLineDash([2, 1.6]);
      g.strokeStyle = 'rgba(255,240,210,0.55)';
      g.lineWidth = 0.6;
      g.strokeRect(px + 1.6, py + 1.6, pw - 3.2, pw - 3.2);
      g.setLineDash([]);
    }
  }
  // quilt folds (soft light/dark ridges)
  for (let i = 1; i < 3; i++) {
    const fy = qy + (qh * i) / 3;
    const fg = g.createLinearGradient(0, fy - 6, 0, fy + 6);
    fg.addColorStop(0, 'rgba(255,240,210,0)');
    fg.addColorStop(0.45, 'rgba(255,240,210,0.16)');
    fg.addColorStop(0.55, 'rgba(40,15,5,0.18)');
    fg.addColorStop(1, 'rgba(40,15,5,0)');
    g.fillStyle = fg;
    g.fillRect(mx - 2, fy - 6, mw + 4, 12);
  }
  // shading to the right and bottom
  const sg = g.createLinearGradient(mx, 0, mx + mw, 0);
  sg.addColorStop(0, 'rgba(255,240,210,0.10)');
  sg.addColorStop(1, 'rgba(30,10,3,0.22)');
  g.fillStyle = sg;
  g.fillRect(mx - 2, qy, mw + 4, qh);
  g.restore();
  // folded-back sheet edge
  roundRect(g, mx - 2, qy - 4, mw + 4, 8, 3);
  g.fillStyle = '#f6efde';
  g.fill();
  g.strokeStyle = 'rgba(120,100,70,0.5)';
  g.lineWidth = 0.8;
  g.stroke();
  roundRect(g, mx - 2, qy, mw + 4, qh, 6);
  g.strokeStyle = 'rgba(40,12,4,0.65)';
  g.lineWidth = 1.2;
  g.stroke();
  // footboard
  board(g, rand, 0, h - 12, w, 10, '#6a3f23', 'h', { knots: false });
  g.strokeStyle = 'rgba(25,10,3,0.9)';
  g.strokeRect(0.6, h - 12, w - 1.2, 10);
}

// Top surface + a slim front face (the overhead camera tilts just enough to
// read furniture fronts, matching the outdoor buildings).
function topAndFront(g, rand, w, h, faceH, base) {
  softShadow(g, 3, h * 0.35, w + 4, h * 0.75, 0.32);
  board(g, rand, 0, faceH * 0.2, w, h - faceH - faceH * 0.2, shade(base, 0.08), 'h');
  const fy = h - faceH;
  const fg = g.createLinearGradient(0, fy, 0, h);
  fg.addColorStop(0, shade(base, -0.18));
  fg.addColorStop(1, shade(base, -0.38));
  g.fillStyle = fg;
  g.fillRect(0, fy, w, faceH);
  grain(g, rand, 0, fy, w, faceH, 'h', 'rgba(30,12,3,');
  g.fillStyle = 'rgba(255,225,170,0.35)';
  g.fillRect(0, fy, w, 1);
  g.strokeStyle = 'rgba(25,10,3,0.9)';
  g.lineWidth = 1.3;
  g.strokeRect(0.6, faceH * 0.2, w - 1.2, h - faceH * 0.2 - 0.6);
  return fy;
}

function paintDresser(g, rand, w, h) {
  const fy = topAndFront(g, rand, w, h, h * 0.42, '#8a5631');
  // drawers
  const dw = (w - 12) / 3;
  for (let i = 0; i < 3; i++) {
    const dx = 6 + i * (dw + 0) + 1;
    g.strokeStyle = 'rgba(25,10,3,0.7)';
    g.lineWidth = 1;
    g.strokeRect(dx, fy + 4, dw - 2, h - fy - 8);
    g.beginPath();
    g.arc(dx + dw / 2 - 1, fy + (h - fy) / 2, 2.2, 0, Math.PI * 2);
    g.fillStyle = '#c9a25a';
    g.fill();
    g.strokeStyle = 'rgba(40,20,5,0.8)';
    g.stroke();
  }
  // items on top: books, a vase with flowers, a candle
  const books = ['#7b2f26', '#3f5b3a', '#2f4a6b', '#a0782f'];
  let bx = 8;
  for (const c of books) {
    const bw = 5 + rand() * 2;
    const bgd = g.createLinearGradient(bx, 0, bx + bw, 0);
    bgd.addColorStop(0, shade(c, 0.2));
    bgd.addColorStop(1, shade(c, -0.25));
    g.fillStyle = bgd;
    g.fillRect(bx, 6, bw, fy - 12);
    g.fillStyle = 'rgba(230,200,120,0.7)';
    g.fillRect(bx + 1, 10, bw - 2, 1);
    g.strokeStyle = 'rgba(20,8,3,0.7)';
    g.lineWidth = 0.7;
    g.strokeRect(bx, 6, bw, fy - 12);
    bx += bw + 0.6;
  }
  const vx = w * 0.62;
  const vy = fy * 0.5 + 2;
  g.beginPath();
  g.ellipse(vx, vy, 7, 6, 0, 0, Math.PI * 2);
  const vg = g.createRadialGradient(vx - 2, vy - 2, 1, vx, vy, 8);
  vg.addColorStop(0, '#9ec3c9');
  vg.addColorStop(1, '#3f6a75');
  g.fillStyle = vg;
  g.fill();
  g.strokeStyle = 'rgba(20,30,35,0.8)';
  g.lineWidth = 0.9;
  g.stroke();
  const flowers = ['#f0d35a', '#e9785f', '#f5f0e0', '#c55a8a', '#f0d35a'];
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3 + rand() * 6;
    const fx = vx + Math.cos(a) * r;
    const fy2 = vy + Math.sin(a) * r * 0.8 - 2;
    g.fillStyle = i < 4 ? '#4f7a35' : flowers[i % flowers.length];
    g.beginPath();
    if (i < 4) g.ellipse(fx, fy2, 3.2, 1.6, a, 0, Math.PI * 2);
    else g.arc(fx, fy2, 2.1, 0, Math.PI * 2);
    g.fill();
    if (i >= 4) {
      g.fillStyle = '#8a4b1d';
      g.beginPath();
      g.arc(fx, fy2, 0.7, 0, Math.PI * 2);
      g.fill();
    }
  }
  candle(g, w - 12, fy * 0.55);
}

function candle(g, x, y) {
  g.beginPath();
  g.ellipse(x, y + 2, 6, 3.5, 0, 0, Math.PI * 2);
  g.fillStyle = '#b08a3e';
  g.fill();
  g.strokeStyle = 'rgba(40,20,5,0.8)';
  g.lineWidth = 0.8;
  g.stroke();
  g.fillStyle = '#f3ead2';
  g.fillRect(x - 2, y - 7, 4, 9);
  g.strokeRect(x - 2, y - 7, 4, 9);
  const fl = g.createRadialGradient(x, y - 10, 0.5, x, y - 10, 9);
  fl.addColorStop(0, 'rgba(255,240,170,0.95)');
  fl.addColorStop(0.25, 'rgba(255,190,90,0.55)');
  fl.addColorStop(1, 'rgba(255,170,70,0)');
  g.fillStyle = fl;
  g.beginPath();
  g.arc(x, y - 10, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff4c0';
  g.beginPath();
  g.ellipse(x, y - 10, 1.4, 2.6, 0, 0, Math.PI * 2);
  g.fill();
}

function paintNightstand(g, rand, w, h) {
  const fy = topAndFront(g, rand, w, h, h * 0.38, '#80502e');
  g.strokeStyle = 'rgba(25,10,3,0.7)';
  g.lineWidth = 1;
  g.strokeRect(5, fy + 3, w - 10, h - fy - 7);
  g.beginPath();
  g.arc(w / 2, fy + (h - fy) / 2, 2, 0, Math.PI * 2);
  g.fillStyle = '#c9a25a';
  g.fill();
  candle(g, w * 0.4, fy * 0.6);
  // a small book
  g.fillStyle = '#6b2f2a';
  g.fillRect(w * 0.58, fy * 0.3, 11, 8);
  g.strokeStyle = 'rgba(20,8,3,0.8)';
  g.strokeRect(w * 0.58, fy * 0.3, 11, 8);
}

function paintTable(g, rand, w, h) {
  // legs peek out under the top
  const fy = topAndFront(g, rand, w, h, 11, '#94603a');
  g.fillStyle = '#4e2d17';
  for (const lx of [4, w - 10]) g.fillRect(lx, h - 4, 6, 4);
  // planks on the top
  const ph = (fy - 3) / 3;
  for (let i = 0; i < 3; i++) board(g, rand, 2, 2 + i * ph, w - 4, ph, ['#a06a40', '#9a643b', '#a87146'][i], 'h');
  g.strokeStyle = 'rgba(25,10,3,0.9)';
  g.lineWidth = 1.3;
  roundRect(g, 1, 1, w - 2, fy - 1, 3);
  g.stroke();
  // table runner
  g.fillStyle = 'rgba(232,214,168,0.92)';
  g.fillRect(w * 0.38, 1, w * 0.24, fy - 1);
  g.strokeStyle = 'rgba(160,60,40,0.8)';
  g.lineWidth = 1;
  g.strokeRect(w * 0.38 + 2, 2, w * 0.24 - 4, fy - 3);
  // bowl of produce
  const bx = w * 0.5;
  const by = fy * 0.48;
  softShadow(g, bx - 16, by - 6, 34, 18, 0.35);
  g.beginPath();
  g.ellipse(bx, by, 15, 10, 0, 0, Math.PI * 2);
  const bg = g.createRadialGradient(bx - 4, by - 3, 2, bx, by, 16);
  bg.addColorStop(0, '#e9d7b5');
  bg.addColorStop(1, '#a98c5f');
  g.fillStyle = bg;
  g.fill();
  g.strokeStyle = 'rgba(60,40,15,0.9)';
  g.lineWidth = 1;
  g.stroke();
  const fruit = [['#d9432f', -5, -2, 4.6], ['#e8a33a', 4, -3, 4.2], ['#7fa83a', 0, 3, 4.4], ['#c8372a', 7, 3, 3.6], ['#f0c94a', -7, 4, 3.4]];
  for (const [c, dx, dy, r] of fruit) {
    const fg = g.createRadialGradient(bx + dx - r * 0.4, by + dy - r * 0.4, 0.5, bx + dx, by + dy, r);
    fg.addColorStop(0, shade(c, 0.45));
    fg.addColorStop(1, shade(c, -0.25));
    g.fillStyle = fg;
    g.beginPath();
    g.arc(bx + dx, by + dy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,15,5,0.6)';
    g.lineWidth = 0.6;
    g.stroke();
  }
  // plates and a jug
  for (const px of [w * 0.18, w * 0.82]) {
    g.beginPath();
    g.ellipse(px, by + 2, 9, 7, 0, 0, Math.PI * 2);
    g.fillStyle = '#efe7d6';
    g.fill();
    g.strokeStyle = 'rgba(70,60,40,0.7)';
    g.stroke();
    g.beginPath();
    g.ellipse(px, by + 2, 5.5, 4.2, 0, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(70,90,120,0.6)';
    g.stroke();
  }
  candle(g, w * 0.5, fy * 0.95 - 2);
}

function paintChair(g, rand, w, h, side) {
  softShadow(g, 2, h * 0.35, w, h * 0.7, 0.3);
  const seatY = h * 0.18;
  board(g, rand, 3, seatY, w - 6, h * 0.62, '#8f5a34', 'v');
  g.strokeStyle = 'rgba(25,10,3,0.9)';
  g.lineWidth = 1.2;
  roundRect(g, 3, seatY, w - 6, h * 0.62, 3);
  g.stroke();
  // cushion
  roundRect(g, 7, seatY + 4, w - 14, h * 0.62 - 8, 5);
  const cg = g.createRadialGradient(w * 0.45, seatY + h * 0.25, 1, w / 2, seatY + h * 0.3, w * 0.5);
  cg.addColorStop(0, '#d4785e');
  cg.addColorStop(1, '#94402f');
  g.fillStyle = cg;
  g.fill();
  g.strokeStyle = 'rgba(60,15,8,0.6)';
  g.lineWidth = 0.8;
  g.stroke();
  // backrest along the outer side
  const bx = side === 'left' ? 0 : w - 7;
  board(g, rand, bx, 0, 7, h * 0.8, '#6e4226', 'v', { knots: false });
  g.strokeStyle = 'rgba(25,10,3,0.9)';
  g.strokeRect(bx + 0.5, 0.5, 6, h * 0.8 - 1);
  // front legs
  g.fillStyle = '#4e2d17';
  g.fillRect(4, h * 0.8, 4, h * 0.18);
  g.fillRect(w - 8, h * 0.8, 4, h * 0.18);
}

function paintPot(g, w, h) {
  const px = w * 0.2;
  const pw = w * 0.6;
  const py = h - h * 0.34;
  softShadow(g, px - 2, h - 10, pw + 6, 12, 0.35);
  g.beginPath();
  g.moveTo(px, py);
  g.lineTo(px + pw, py);
  g.lineTo(px + pw * 0.86, h - 2);
  g.lineTo(px + pw * 0.14, h - 2);
  g.closePath();
  const pg = g.createLinearGradient(px, 0, px + pw, 0);
  pg.addColorStop(0, '#d0784a');
  pg.addColorStop(0.45, '#b35d34');
  pg.addColorStop(1, '#7e3b1f');
  g.fillStyle = pg;
  g.fill();
  g.strokeStyle = 'rgba(50,18,6,0.9)';
  g.lineWidth = 1.1;
  g.stroke();
  roundRect(g, px - 3, py - 4, pw + 6, 7, 2);
  g.fillStyle = '#c56c40';
  g.fill();
  g.stroke();
}

const PAINTERS = { bed: paintBed, dresser: paintDresser, nightstand: paintNightstand, table: paintTable, chair: paintChair };

// ------------------------------------------------------------------ build

export function interiorSpriteKeys(def) {
  return [...new Set(def.pieces.filter((p) => p.sprite).map((p) => p.sprite))];
}

export function buildInteriorArt(def, assets, res) {
  const W = def.widthTiles * TILE;
  const H = def.heightTiles * TILE;
  const rand = rng(0x5eed + def.id.length * 977);
  const base = canvas(W, H, res);
  const g = base.g;
  const s = def.wall.side * TILE;
  paintFloor(g, rand, s, def.wall.back * TILE - 4, W - s, H - def.wall.front * TILE);
  windowLight(g, def);
  paintRug(g, rand, def.rug);
  paintBackWall(g, rand, def, W);
  paintSideWalls(g, rand, def, W, H);
  const front = canvas(W, def.wall.front * TILE + 16, res);
  front.g.translate(0, -(H - def.wall.front * TILE - 16));
  paintFrontWall(front.g, rand, def, W, H);

  const pieces = def.pieces.map((p) => {
    const x = p.x * TILE;
    const y = p.y * TILE;
    const w = p.w * TILE;
    if (p.kind === 'sprite' || p.kind === 'plant') {
      const e = assets.entry(p.sprite);
      const ratio = e ? e.height / e.width : 1;
      let h = w * ratio;
      if (p.kind === 'plant') {
        // foliage sprite set into a painted terracotta pot
        const pot = canvas(w, w * 0.9, res);
        paintPot(pot.g, w, w * 0.9);
        h = w * ratio * 0.8 + w * 0.9 * 0.25;
        return { img: assets.get(p.sprite), pot: pot.c, x, y, w, h, leafH: w * ratio * 0.8, sortY: p.foot[3] * TILE };
      }
      return { img: assets.get(p.sprite), x, y, w, h, shadow: true, sortY: p.foot[3] * TILE };
    }
    const h = p.h * TILE;
    const pc = canvas(w + 8, h + 8, res);
    pc.g.translate(2, 2);
    PAINTERS[p.kind](pc.g, rand, w, h, p.side);
    return { img: pc.c, x: x - 2, y: y - 2, w: w + 8, h: h + 8, sortY: p.foot[3] * TILE };
  });
  return {
    res,
    base: base.c,
    front: front.c,
    frontY: H - def.wall.front * TILE - 16,
    frontH: def.wall.front * TILE + 16,
    pieces,
  };
}
