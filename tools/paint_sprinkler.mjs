// Paints the garden sprinkler sprite (no sprinkler art exists in the packs):
// a brass rotary sprinkler on a ring of stones, sitting in the game's own grass
// tufts, with warm top-left light and dark outlines like the other props.
//   node tools/paint_sprinkler.mjs     (needs: PORT=8123 node scripts/serve.mjs)
// Writes assets/derived/props/sprinkler.png and registers prop.sprinkler.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
await page.goto(process.env.GAME_URL || 'http://localhost:8123/');
await page.waitForSelector('#title:not([hidden])');
const data = await page.evaluate(() => {
  const A = (k) => window.farmstead.assets.get(k);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 288;
  const g = c.getContext('2d');
  const OUT = '#2b1a0c';
  // soft contact shadow
  g.fillStyle = 'rgba(20,30,10,0.35)';
  g.beginPath();
  g.ellipse(128, 246, 92, 26, 0, 0, Math.PI * 2);
  g.fill();
  // grass tufts behind (game sprite)
  const tuft = A('foliage.grass_tall') || A('foliage.fern');
  if (tuft) {
    const w = 120, h = (w * tuft.height) / tuft.width;
    g.drawImage(tuft, 20, 250 - h, w, h);
    g.save(); g.translate(236, 0); g.scale(-1, 1); g.drawImage(tuft, 0, 252 - h, w, h); g.restore();
  }
  // ring of stones
  const stone = (x, y, rx, ry, tone) => {
    const gr = g.createRadialGradient(x - rx * 0.4, y - ry * 0.5, 2, x, y, rx * 1.2);
    gr.addColorStop(0, `hsl(35, 8%, ${tone + 22}%)`);
    gr.addColorStop(0.6, `hsl(35, 7%, ${tone}%)`);
    gr.addColorStop(1, `hsl(30, 8%, ${tone - 18}%)`);
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = OUT;
    g.stroke();
  };
  const ring = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI; // back half first
    ring.push([128 + Math.cos(a) * 62, 222 + Math.sin(a) * 24, 20 + (i % 3) * 3, 14 + (i % 2) * 2, 52 + (i % 3) * 5]);
  }
  for (const s of ring) stone(...s);
  // wet dark earth inside the ring
  const earth = g.createRadialGradient(128, 222, 4, 128, 222, 60);
  earth.addColorStop(0, '#4b3320');
  earth.addColorStop(1, '#6a4a2c');
  g.fillStyle = earth;
  g.beginPath();
  g.ellipse(128, 224, 52, 18, 0, 0, Math.PI * 2);
  g.fill();
  // brass riser pipe
  const pipe = g.createLinearGradient(116, 0, 140, 0);
  pipe.addColorStop(0, '#7a4f16');
  pipe.addColorStop(0.35, '#f1c766');
  pipe.addColorStop(0.6, '#c99231');
  pipe.addColorStop(1, '#6b4310');
  g.fillStyle = pipe;
  g.beginPath();
  g.roundRect(117, 120, 22, 106, 6);
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = OUT;
  g.stroke();
  // collar rings
  for (const y of [204, 150]) {
    g.fillStyle = pipe;
    g.beginPath();
    g.roundRect(110, y, 36, 12, 5);
    g.fill();
    g.stroke();
  }
  // rotating head: a hub with two angled arms and nozzles
  const arm = (dir) => {
    g.save();
    g.translate(128, 112);
    g.scale(dir, 1);
    const ag = g.createLinearGradient(0, -8, 0, 8);
    ag.addColorStop(0, '#f6d27a');
    ag.addColorStop(1, '#9b6a1f');
    g.fillStyle = ag;
    g.beginPath();
    g.moveTo(6, -6);
    g.quadraticCurveTo(48, -16, 70, -6);
    g.lineTo(72, 6);
    g.quadraticCurveTo(46, 0, 6, 8);
    g.closePath();
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = OUT;
    g.stroke();
    // nozzle
    g.fillStyle = '#5d6b73';
    g.beginPath();
    g.roundRect(66, -11, 14, 20, 4);
    g.fill();
    g.stroke();
    g.fillStyle = '#9fb3bd';
    g.fillRect(69, -8, 4, 12);
    g.restore();
  };
  arm(1);
  arm(-1);
  const hub = g.createRadialGradient(122, 104, 2, 128, 112, 22);
  hub.addColorStop(0, '#fff0b8');
  hub.addColorStop(0.5, '#e0aa45');
  hub.addColorStop(1, '#7d5214');
  g.fillStyle = hub;
  g.beginPath();
  g.ellipse(128, 112, 20, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = OUT;
  g.stroke();
  g.fillStyle = '#7d5214';
  g.beginPath();
  g.arc(128, 98, 6, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // front stones (over the pipe base) and a few water beads
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    stone(128 + Math.cos(a) * 64, 224 + Math.sin(a) * 24, 21 + (i % 3) * 3, 15, 50 + (i % 3) * 6);
  }
  g.fillStyle = 'rgba(190,230,255,0.9)';
  for (const [x, y, r] of [[60, 96, 5], [196, 92, 5], [44, 120, 4], [212, 118, 4]]) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,90,130,0.6)'; g.lineWidth = 1.5; g.stroke();
  }
  return c.toDataURL('image/png');
});
await browser.close();
const out = path.join(root, 'assets', 'derived', 'props', 'sprinkler.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
const mpath = path.join(root, 'assets', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(mpath, 'utf8'));
manifest.assets['prop.sprinkler'] = {
  file: 'assets/derived/props/sprinkler.png', width: 256, height: 288, source: 'tools/paint_sprinkler.mjs',
  status: 'painted-in-code', notes: 'No sprinkler art was supplied; painted in code to match the props. Replace with a hand-painted sprite (see docs/ART_REQUESTS.md).',
};
fs.writeFileSync(mpath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${out}`);
