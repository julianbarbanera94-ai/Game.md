// Launch art made from the game's own hand-painted sprites, rendered in the
// real game renderer (no upscaled reference crops):
//   node tools/make_branding.mjs        (needs a dev server: PORT=8123 node scripts/serve.mjs)
// Writes launch/*.png|jpg; tools/make_icons.py then cuts the app and Android sizes.
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
const out = path.join(root, 'launch'); // store/launch art (not bundled); tools/make_icons.py cuts the shipped sizes
fs.mkdirSync(out, { recursive: true });
const url = process.env.GAME_URL || 'http://localhost:8123/';

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForSelector('#title:not([hidden])');

const files = await page.evaluate(async () => {
  const g = window.farmstead;
  const A = (k) => g.assets.get(k);
  const T = 64;
  // a spring morning on a lived-in farm: a few crops in the garden
  const s = g.state;
  s.time = 9 * 60;
  for (const [id, crop, growth] of [['starter_5_14', 'carrot', 400], ['starter_6_14', 'tomato', 700], ['starter_7_14', 'lettuce', 200], ['starter_5_15', 'carrot', 120], ['starter_6_15', 'potato', 600], ['starter_8_15', 'tomato', 300]]) {
    Object.assign(s.plots[id], { tilled: true, crop, growth, moistUntil: s.time + 600 });
  }
  const png = (c, type = 'image/png', q) => c.toDataURL(type, q);
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------------------------------------------------------------- logo
  const logo = canvas(1200, 560);
  {
    const x = logo.getContext('2d');
    x.imageSmoothingQuality = 'high';
    const W = 1200, H = 560;
    // the board: rounded, slightly uneven plank sign
    const board = new Path2D();
    const bx = 110, by = 150, bw = 980, bh = 300, r = 46;
    board.moveTo(bx + r, by + 6);
    board.bezierCurveTo(bx + bw * 0.35, by - 8, bx + bw * 0.65, by + 10, bx + bw - r, by);
    board.quadraticCurveTo(bx + bw, by, bx + bw + 6, by + r);
    board.bezierCurveTo(bx + bw + 14, by + bh * 0.4, bx + bw - 4, by + bh * 0.7, bx + bw, by + bh - r);
    board.quadraticCurveTo(bx + bw, by + bh + 4, bx + bw - r, by + bh + 6);
    board.bezierCurveTo(bx + bw * 0.6, by + bh + 14, bx + bw * 0.3, by + bh - 6, bx + r, by + bh);
    board.quadraticCurveTo(bx - 4, by + bh, bx - 6, by + bh - r);
    board.bezierCurveTo(bx - 14, by + bh * 0.6, bx + 6, by + bh * 0.35, bx, by + r);
    board.quadraticCurveTo(bx, by + 4, bx + r, by + 6);
    x.save();
    x.shadowColor = 'rgba(30,15,5,0.55)';
    x.shadowBlur = 26;
    x.shadowOffsetY = 14;
    x.fillStyle = '#5a3417';
    x.fill(board);
    x.restore();
    x.save();
    x.clip(board);
    // painted planks from the deck of the game's wooden bridge, staggered row by row
    const plank = A('building.wooden_bridge');
    const sx = 138, sy = 50, sw = 150, sh = 140; // the clean deck, inside the posts
    const k = plank.width / 418; // the sprite may be a hi-res export
    for (let row = 0, yy = by - 30; yy < by + bh + 30; row++, yy += 150) {
      for (let xx = bx - 80 - (row % 2) * 110; xx < bx + bw + 80; xx += 220) x.drawImage(plank, sx * k, sy * k, sw * k, sh * k, xx, yy, 222, 152);
    }
    const shade = x.createLinearGradient(0, by, 0, by + bh);
    shade.addColorStop(0, 'rgba(255,220,160,0.28)');
    shade.addColorStop(0.5, 'rgba(120,70,30,0.05)');
    shade.addColorStop(1, 'rgba(50,25,8,0.5)');
    x.fillStyle = shade;
    x.fillRect(bx - 20, by - 20, bw + 40, bh + 40);
    x.restore();
    x.lineWidth = 12;
    x.strokeStyle = '#3b2010';
    x.stroke(board);
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(255,214,150,0.45)';
    x.save();
    x.translate(0, 6);
    x.stroke(board);
    x.restore();
    // foliage tucked around the corners (game sprites)
    const put = (k, cx, cy, w, flip = false) => {
      const im = A(k);
      if (!im) return;
      const h = (w * im.height) / im.width;
      x.save();
      x.translate(cx, cy);
      if (flip) x.scale(-1, 1);
      x.drawImage(im, -w / 2, -h, w, h);
      x.restore();
    };
    put('foliage.bush_green', 150, 225, 250);
    put('foliage.fern', 245, 205, 170, true);
    put('foliage.bush_flowering', 1060, 230, 240, true);
    put('foliage.flower_yellow', 980, 205, 150);
    put('foliage.bush_berries', 160, 510, 230);
    put('foliage.flower_patch', 270, 500, 170);
    put('foliage.bush_white_flowers', 1050, 510, 240, true);
    put('foliage.fern', 950, 500, 160);
    // lettering
    x.save();
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '800 178px Caladea, "DejaVu Serif", Georgia, serif';
    const tx = W / 2, ty = by + bh / 2 + 10;
    x.lineJoin = 'round';
    x.shadowColor = 'rgba(20,10,3,0.6)';
    x.shadowBlur = 10;
    x.shadowOffsetY = 8;
    x.lineWidth = 30;
    x.strokeStyle = '#2f1808';
    x.strokeText('Farmstead', tx, ty);
    x.shadowColor = 'transparent';
    x.lineWidth = 14;
    x.strokeStyle = '#8a5526';
    x.strokeText('Farmstead', tx, ty);
    const fill = x.createLinearGradient(0, ty - 80, 0, ty + 70);
    fill.addColorStop(0, '#fff6d6');
    fill.addColorStop(0.45, '#ffd76a');
    fill.addColorStop(1, '#e09a2a');
    x.fillStyle = fill;
    x.fillText('Farmstead', tx, ty);
    x.restore();
  }

  // ---------------------------------------------------------------- scenes from the game renderer
  const scene = (x0, y0, x1, y1, w) => g.renderer.renderMap(g, w, { x0: x0 * T, y0: y0 * T, x1: x1 * T, y1: y1 * T });
  // icon: the cottage, its blossom tree and the path
  const icon = canvas(1024, 1024);
  {
    const x = icon.getContext('2d');
    x.drawImage(scene(14.5, 3.4, 21.0, 9.9, 1024), 0, 0, 1024, 1024);
    const vig = x.createRadialGradient(512, 470, 300, 512, 512, 760);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(20,30,10,0.45)');
    x.fillStyle = vig;
    x.fillRect(0, 0, 1024, 1024);
  }
  // title backdrop: the farm from the garden to the market, warm morning light
  const wide = (w, h) => {
    const c = canvas(w, h);
    const x = c.getContext('2d');
    const aspect = w / h;
    const x0 = 4.2, x1 = 33.5;
    const hh = (x1 - x0) / aspect;
    x.drawImage(scene(x0, 4.6, x1, 4.6 + hh, w), 0, 0, w, h);
    const warm = x.createLinearGradient(0, 0, w, h);
    warm.addColorStop(0, 'rgba(255,214,140,0.22)');
    warm.addColorStop(1, 'rgba(255,170,90,0.08)');
    x.fillStyle = warm;
    x.fillRect(0, 0, w, h);
    return c;
  };
  const title = wide(1920, 1080);
  {
    const x = title.getContext('2d');
    const vig = x.createRadialGradient(960, 540, 400, 960, 540, 1150);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(15,20,8,0.55)');
    x.fillStyle = vig;
    x.fillRect(0, 0, 1920, 1080);
  }
  const titleLogo = canvas(1920, 1080);
  {
    const x = titleLogo.getContext('2d');
    x.drawImage(title, 0, 0);
    x.drawImage(logo, 960 - 600, 70, 1200, 560);
  }
  const loading = canvas(1920, 1080);
  {
    const x = loading.getContext('2d');
    x.filter = 'blur(6px) brightness(0.7)';
    x.drawImage(title, -20, -20, 1960, 1120);
    x.filter = 'none';
    x.drawImage(logo, 960 - 480, 250, 960, 448);
  }
  return {
    'logo.png': png(logo),
    'icon_1024.png': png(icon),
    'title_bg.jpg': png(title, 'image/jpeg', 0.86),
    'title_1920x1080.jpg': png(titleLogo, 'image/jpeg', 0.88),
    'loading_1920x1080.jpg': png(loading, 'image/jpeg', 0.86),
  };
});

for (const [name, data] of Object.entries(files)) {
  const buf = Buffer.from(data.split(',')[1], 'base64');
  fs.writeFileSync(path.join(out, name), buf);
  console.log(`${name}  ${Math.round(buf.length / 1024)} KB`);
}
await browser.close();
