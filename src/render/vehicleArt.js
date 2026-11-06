import { VEHICLES, IMPLEMENTS } from '../data/vehicles.js';
import { TILE } from '../config.js';

// Stand-in artwork for vehicles, painted in code (overhead view, facing east).
// Replace with supplied sprites when they exist: each part is cached as a
// canvas, so swapping in images only changes this file.

const RES = 2; // pixels per world pixel for the cached canvases
const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * RES);
  c.height = Math.ceil(h * RES);
  const g = c.getContext('2d');
  g.scale(RES, RES);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { c, g, w, h };
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

function fillStroke(g, fill, stroke = 'rgba(30,18,8,0.9)', width = 1.4) {
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = stroke;
  g.lineWidth = width;
  g.stroke();
}

function wheel(g, x, y, w, h) {
  rr(g, x - w / 2, y - h / 2, w, h, h * 0.3);
  const lg = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  lg.addColorStop(0, '#4a4540');
  lg.addColorStop(0.5, '#2c2824');
  lg.addColorStop(1, '#1b1815');
  fillStroke(g, lg);
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 1;
  for (let t = -w / 2 + 3; t < w / 2 - 1; t += 4) {
    g.beginPath();
    g.moveTo(x + t, y - h / 2 + 1.5);
    g.lineTo(x + t + 2, y + h / 2 - 1.5);
    g.stroke();
  }
  g.beginPath();
  g.ellipse(x, y, Math.min(w, h) * 0.22, Math.min(w, h) * 0.22, 0, 0, Math.PI * 2);
  g.fillStyle = '#d6b24a';
  g.fill();
}

function paintTractor(def) {
  const L = def.length;
  const W = def.width;
  const { c, g } = canvas(L + 16, W + 16);
  g.translate((L + 16) / 2, (W + 16) / 2); // origin at the tractor's centre
  const body = def.color;
  // rear and front wheels
  for (const s of [-1, 1]) wheel(g, -L * 0.2, s * (W / 2 - 7), L * 0.34, W * 0.27);
  for (const s of [-1, 1]) wheel(g, L * 0.3, s * (W / 2 - 5), L * 0.2, W * 0.19);
  // chassis
  rr(g, -L * 0.34, -W * 0.27, L * 0.82, W * 0.54, 6);
  const lg = g.createLinearGradient(0, -W * 0.27, 0, W * 0.27);
  lg.addColorStop(0, shade(body, 0.25));
  lg.addColorStop(0.5, body);
  lg.addColorStop(1, shade(body, -0.3));
  fillStroke(g, lg);
  // hood
  rr(g, L * 0.0, -W * 0.2, L * 0.46, W * 0.4, 5);
  const hg = g.createLinearGradient(0, -W * 0.2, 0, W * 0.2);
  hg.addColorStop(0, shade(body, 0.35));
  hg.addColorStop(0.45, shade(body, 0.1));
  hg.addColorStop(1, shade(body, -0.25));
  fillStroke(g, hg);
  g.strokeStyle = 'rgba(20,12,4,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(L * 0.41, -W * 0.14 + i * W * 0.09);
    g.lineTo(L * 0.455, -W * 0.14 + i * W * 0.09);
    g.stroke();
  }
  // exhaust and headlights
  g.beginPath();
  g.arc(L * 0.14, -W * 0.12, 3.2, 0, Math.PI * 2);
  fillStroke(g, '#3a3632');
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(L * 0.455, s * W * 0.14, 3, 0, Math.PI * 2);
    fillStroke(g, '#ffe9a0', 'rgba(60,40,10,0.8)', 1);
  }
  // cab
  rr(g, -L * 0.36, -W * 0.34, L * 0.32, W * 0.68, 7);
  const cg = g.createLinearGradient(0, -W * 0.34, 0, W * 0.34);
  cg.addColorStop(0, '#e9e4d6');
  cg.addColorStop(1, '#b9b2a1');
  fillStroke(g, cg);
  rr(g, -L * 0.31, -W * 0.27, L * 0.22, W * 0.54, 5);
  fillStroke(g, 'rgba(120,170,190,0.55)', 'rgba(40,60,70,0.7)', 1);
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-L * 0.28, -W * 0.2);
  g.lineTo(-L * 0.17, -W * 0.05);
  g.stroke();
  return c;
}

function bar(g, x, y, w, h, fill) {
  rr(g, x, y, w, h, Math.min(3, h / 2));
  fillStroke(g, fill);
}

// Implements are drawn with their mounting point at the origin, pointing east.
function paintImplement(id, workWidth) {
  const span = workWidth * TILE;
  const { c, g } = canvas(70, span + 20);
  g.translate(10, (span + 20) / 2);
  if (id === 'plough') {
    bar(g, 0, -span * 0.46, 8, span * 0.92, '#7b6a55');
    for (let i = 0; i < workWidth * 2; i++) {
      const y = -span * 0.4 + (i + 0.5) * (span * 0.8 / (workWidth * 2));
      g.beginPath();
      g.moveTo(6, y - 8);
      g.lineTo(46, y);
      g.lineTo(6, y + 8);
      g.closePath();
      const sg = g.createLinearGradient(6, y, 46, y);
      sg.addColorStop(0, '#b8bdc2');
      sg.addColorStop(1, '#6e757b');
      fillStroke(g, sg);
    }
  } else if (id === 'seeder') {
    bar(g, 0, -span * 0.46, 10, span * 0.92, '#6d5a42');
    rr(g, 8, -span * 0.32, 28, span * 0.64, 5);
    fillStroke(g, '#c8472f');
    for (let i = 0; i < workWidth * 3; i++) {
      const y = -span * 0.36 + (i + 0.5) * (span * 0.72 / (workWidth * 3));
      g.beginPath();
      g.moveTo(36, y);
      g.lineTo(54, y);
      g.strokeStyle = '#e8c15a';
      g.lineWidth = 3;
      g.stroke();
    }
  } else if (id === 'sprayer') {
    bar(g, 0, -span * 0.5, 7, span, '#5f6d73');
    rr(g, 7, -14, 28, 28, 6);
    fillStroke(g, '#4a8fc2');
    for (let i = 0; i < workWidth * 4; i++) {
      const y = -span * 0.46 + (i + 0.5) * (span * 0.92 / (workWidth * 4));
      g.beginPath();
      g.arc(14, y, 2.2, 0, Math.PI * 2);
      fillStroke(g, '#bfe3f7', 'rgba(20,50,70,0.8)', 1);
    }
  } else if (id === 'reaper') {
    rr(g, 2, -span * 0.5, 36, span, 6);
    fillStroke(g, '#e0b33a');
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? 'rgba(130,90,20,0.55)' : 'rgba(255,240,170,0.5)';
      g.fillRect(6 + i * 5, -span * 0.47, 4, span * 0.94);
    }
  }
  return c;
}

function paintTrailer() {
  const { c, g } = canvas(120, 70);
  g.translate(120, 35); // origin at the hitch, bed trailing west (negative x)
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(-24, 0);
  g.strokeStyle = '#4a4036';
  g.lineWidth = 4;
  g.stroke();
  for (const s of [-1, 1]) wheel(g, -78, s * 28, 26, 11);
  rr(g, -108, -26, 84, 52, 5);
  fillStroke(g, '#a77a43');
  g.strokeStyle = 'rgba(60,35,10,0.6)';
  g.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    g.beginPath();
    g.moveTo(-108 + i * 14, -26);
    g.lineTo(-108 + i * 14, 26);
    g.stroke();
  }
  rr(g, -104, -22, 76, 44, 3);
  fillStroke(g, 'rgba(70,40,12,0.35)', 'rgba(40,22,8,0.7)', 1);
  return c;
}

export function vehicleParts(type) {
  const key = `body:${type}`;
  if (!cache.has(key)) cache.set(key, paintTractor(VEHICLES[type]));
  return cache.get(key);
}
export function implementPart(id, workWidth) {
  const key = `imp:${id}:${workWidth}`;
  if (!cache.has(key)) cache.set(key, id === 'crop_trailer' ? paintTrailer() : paintImplement(id, workWidth));
  return cache.get(key);
}

export const VEHICLE_KEYS = ['vehicle.tractor_small', 'vehicle.tractor_large', 'vehicle.crop_trailer', 'vehicle.plough', 'vehicle.seeder'];

// Draw one vehicle (with its mounted implement and trailer) at its position.
// `art` maps asset keys to loaded images (the supplied vector pack); anything
// missing falls back to the parts painted in code above.
export function drawVehicle(g, v, driver, art = () => null) {
  const def = VEHICLES[v.type];
  const body = art(`vehicle.${v.type}`);
  const front = v.mount.front ? art(`vehicle.${v.mount.front}`) : null;
  const rear = v.mount.rear ? art(`vehicle.${v.mount.rear}`) : null;
  g.save();
  g.translate(v.x, v.y);
  // soft ground shadow (not rotated with the machine)
  g.fillStyle = 'rgba(25,35,10,0.28)';
  g.beginPath();
  g.ellipse(4, 6, def.length * 0.62, def.width * 0.5, v.heading, 0, Math.PI * 2);
  g.fill();
  g.rotate(v.heading);
  const L = def.length;
  const cap = v.mount.rear ? IMPLEMENTS[v.mount.rear].capacity : 0;
  const used = Object.values(v.cargo).reduce((n, q) => n + q, 0);
  // supplied sprites face north; the world heading 0 is east, so turn them a quarter
  const sprite = (img, w, h, cx, cy = 0, extra = 0) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.PI / 2 + extra);
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
  };
  if (v.mount.rear) {
    if (rear) {
      const s = (L / body.height) * 1.1;
      const w = rear.width * s;
      const h = rear.height * s;
      sprite(rear, w, h, -(L / 2 + h / 2 - 8));
      if (used > 0) {
        g.fillStyle = 'rgba(90,150,50,0.92)';
        g.beginPath();
        g.ellipse(-(L / 2 + h / 2 - 8), 0, h * 0.34 * Math.min(1, 0.35 + used / cap), w * 0.34 * Math.min(1, 0.35 + used / cap), 0, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      const t = implementPart('crop_trailer', def.workWidth);
      g.drawImage(t, -L * 0.36 - 120, -35, t.width / RES, t.height / RES);
      if (used > 0) {
        g.fillStyle = 'rgba(90,150,50,0.9)';
        g.beginPath();
        g.ellipse(-L * 0.36 - 66, 0, 30 * Math.min(1, 0.35 + used / cap), 17 * Math.min(1, 0.35 + used / cap), 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  if (body) {
    const s = L / body.height;
    sprite(body, body.width * s, body.height * s, 0);
  } else {
    const p = vehicleParts(v.type);
    g.drawImage(p, -(L + 16) / 2, -(def.width + 16) / 2, p.width / RES, p.height / RES);
  }
  if (v.mount.front) {
    if (front) {
      // the implements are drawn as towed tools (hitch at the top); a front mount turns them round
      const s = (L / body.height) * 1.25;
      const w = front.width * s;
      const h = front.height * s;
      sprite(front, w, h, L / 2 + h / 2 - 8, 0, Math.PI);
    } else {
      const p = implementPart(v.mount.front, def.workWidth);
      g.drawImage(p, L * 0.46, -(def.workWidth * TILE + 20) / 2, p.width / RES, p.height / RES);
    }
    if (v.engaged && Math.abs(v.speed) > 10) {
      g.fillStyle = 'rgba(255,230,150,0.22)';
      g.fillRect(L / 2 + 4, -def.workWidth * TILE / 2, 54, def.workWidth * TILE);
    }
  }
  g.restore();
  if (driver) drawVehicleDriver(g, v, driver);
}

// A small farmer sitting in the cab (upright, so it never rotates).
function drawVehicleDriver(g, v, { img, scale }) {
  const def = VEHICLES[v.type];
  const sx = v.x + Math.cos(v.heading) * -def.length * 0.2;
  const sy = v.y + Math.sin(v.heading) * -def.length * 0.2;
  const w = img.width * scale;
  const h = img.height * scale;
  g.drawImage(img, sx - w / 2, sy - h * 0.82 - 4, w, h);
}
