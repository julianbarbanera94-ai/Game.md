// Performance probe (headless Chromium): load time, bytes downloaded, decoded
// image memory, JS heap and per-frame cost of update + render while walking
// around the farm. Runs a desktop profile and a throttled phone profile.
//   node tools/perf.mjs            (needs: PORT=8123 node scripts/serve.mjs)
// These are emulated numbers, not measurements on a real phone.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const url = process.env.GAME_URL || 'http://localhost:8123/';
// fresh browser cache for every profile, so the download size is the full first-run download
const PROFILES = [
  { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 }, dpr: 1, cpu: 1 },
  { name: 'phone 844x390 @2.75x, CPU slowed 4x', viewport: { width: 844, height: 390 }, dpr: 2.75, cpu: 4, mobile: true },
];

const browser = await playwright.chromium.launch();
const results = [];
for (const p of PROFILES) {
  const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.dpr, isMobile: !!p.mobile, hasTouch: !!p.mobile });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForSelector('#title:not([hidden])', { timeout: 120000 });
  const loadMs = Date.now() - t0;
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((n, e) => n + (e.encodedBodySize || 0), 0)
    + (performance.getEntriesByType('navigation')[0]?.encodedBodySize || 0));
  await page.evaluate(() => localStorage.clear());
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('.modal button.primary');
  // time the game's own update and render calls
  await page.evaluate(() => {
    const g = window.farmstead;
    const r = g.renderer;
    window.__frames = [];
    const upd = g.update.bind(g);
    const ren = r.render.bind(r);
    g.update = (dt) => { const a = performance.now(); upd(dt); window.__u = performance.now() - a; };
    r.render = (game) => { const a = performance.now(); ren(game); window.__frames.push((window.__u || 0) + performance.now() - a); };
  });
  // walk a loop past the cottage, garden and market
  for (const [key, ms] of [['ArrowRight', 1800], ['ArrowDown', 1200], ['ArrowLeft', 2200], ['ArrowUp', 1200]]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  }
  const stats = await page.evaluate(() => {
    const f = window.__frames.slice(10).sort((a, b) => a - b);
    const pct = (q) => f[Math.min(f.length - 1, Math.floor(q * f.length))];
    let decoded = 0;
    for (const img of window.farmstead.assets.images?.values?.() || []) decoded += (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0) * 4;
    const ground = window.farmstead.renderer.ground;
    return {
      frames: f.length, avgMs: f.reduce((a, b) => a + b, 0) / f.length, p95Ms: pct(0.95), maxMs: f[f.length - 1],
      imagesMB: decoded / 1048576, groundMB: ground ? (ground.width * ground.height * 4) / 1048576 : 0,
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    };
  });
  const rafFps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const start = performance.now();
    const tick = () => { n++; if (performance.now() - start < 2000) requestAnimationFrame(tick); else res((n * 1000) / (performance.now() - start)); };
    requestAnimationFrame(tick);
  }));
  results.push({ profile: p.name, loadMs, downloadMB: bytes / 1048576, ...stats, rafFps });
  await ctx.close();
}
await browser.close();
const r1 = (v) => (v == null ? 'n/a' : Math.round(v * 10) / 10);
for (const r of results) {
  console.log(`${r.profile}: load ${r.loadMs} ms, downloaded ${r1(r.downloadMB)} MB, decoded images ${r1(r.imagesMB)} MB + ground ${r1(r.groundMB)} MB, JS heap ${r1(r.heapMB)} MB, ` +
    `update+render avg ${r1(r.avgMs)} ms / p95 ${r1(r.p95Ms)} ms / max ${r1(r.maxMs)} ms over ${r.frames} frames, rAF ${r1(r.rafFps)} fps (headless)`);
}
