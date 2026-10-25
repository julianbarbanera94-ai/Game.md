// Touch regression test on an emulated landscape phone (real multi-touch via CDP).
//   npm run test:touch
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
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
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'test-results');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 8700 + Math.floor(Math.random() * 200);
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
let n = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) throw new Error(`Check failed: ${msg}`);
  n++;
}

async function main() {
  await new Promise((r) => setTimeout(r, 400));
  browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 762, height: 352 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const center = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  let nextId = 10;
  async function tap(sel, held = [], ms = 50) {
    const c = await center(sel);
    const id = nextId++;
    const pt = { x: c.x, y: c.y, id };
    await touch('touchStart', [...held, pt]);
    await page.waitForTimeout(ms);
    await touch('touchEnd', [pt]); // CDP releases the points listed in touchEnd
  }
  const modalOpen = () => page.evaluate(() => !!document.querySelector('.modal'));
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.farmstead.state)));

  await tap('#btn-new');
  await page.waitForSelector('.modal');
  await tap('.modal button.primary');
  await page.waitForTimeout(250);
  check(!(await modalOpen()), 'single-finger tap closes the intro');

  // Regression: a single-finger tap that opens a dialog must not be closed by the
  // browser's follow-up click landing on the dialog's backdrop.
  await tap('#btn-menu');
  await page.waitForTimeout(500);
  check(await modalOpen(), 'single-finger tap on Menu opens it and it stays open');
  await tap('.modal button.primary');
  await page.waitForTimeout(250);
  check(!(await modalOpen()), 'single-finger tap on Resume closes it');

  // Hold the stick with one thumb, then use every kind of button with the other.
  const st = await center('#stick');
  const held = [{ x: st.x, y: st.y, id: 1 }];
  await touch('touchStart', held);
  await page.waitForTimeout(100);
  await tap('#btn-menu', held);
  await page.waitForTimeout(250);
  check(await modalOpen(), 'menu button opens the pause menu while the stick is held');
  await tap('[data-action="save"]', held);
  await page.waitForTimeout(250);
  check(await page.evaluate(() => !!localStorage.getItem('farmstead.save')), 'Save game works while the stick is held');
  await tap('.modal .menu button:nth-child(3)', held);
  await page.waitForTimeout(250);
  check(await page.evaluate(() => window.farmstead.state.settings.muted === true), 'Sound toggle works while the stick is held');
  await tap('.modal .menu button:nth-child(3)', held);
  await page.waitForTimeout(250);
  await tap('.modal button.primary', held);
  await page.waitForTimeout(250);
  check(!(await modalOpen()), 'Resume closes the menu while the stick is held');
  await tap('.slot:nth-child(2)', held);
  await page.waitForTimeout(150);
  check(await page.evaluate(() => window.farmstead.activeTool === 'can'), 'hotbar slot selects while the stick is held');
  await touch('touchEnd', held);

  // A is a tap, not a hold: three taps ~180 ms apart till, plant and water one plot.
  await page.evaluate(() => {
    const g = window.farmstead;
    g.state.player.x = 5.5 * 64; g.state.player.y = 13.55 * 64; g.state.player.facing = 'down';
    g.camera.follow(g.state.player.x, g.state.player.y - 40, 0, true);
  });
  await page.waitForTimeout(250);
  for (let i = 0; i < 3; i++) {
    await tap('#btn-action', [], 40);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(900);
  const plot = (await state()).plots.starter_5_14;
  check(plot.tilled && plot.crop === 'carrot' && plot.moistUntil > 0, 'three quick taps on A: tilled, planted and watered');

  // A new game with an existing save asks in-game (window.confirm is blocked in Android WebViews).
  await page.evaluate(() => window.farmstead.quitToTitle());
  await page.waitForSelector('#title:not([hidden])');
  await tap('#btn-new');
  await page.waitForSelector('.modal');
  check((await page.textContent('.modal')).includes('overwritten'), 'New game over a save shows an in-game confirmation');
  await tap('.modal button:not(.primary)');
  await page.waitForTimeout(250);
  check(!(await modalOpen()) && (await page.evaluate(() => !document.querySelector('#title').hidden)), '"Keep my save" returns to the title');
  await tap('#btn-continue');
  await page.waitForTimeout(500);

  // Landscape layout: controls hug the bottom corners and don't collide with the quest tracker.
  const rects = await page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; };
    return { stick: r('#stick'), action: r('#btn-action'), quests: r('#quest-tracker'), hotbar: r('#hotbar'), h: innerHeight, w: innerWidth };
  });
  check(rects.h - rects.stick.y1 <= 24 && rects.h - rects.action.y1 <= 28, `controls sit near the bottom edge (stick ${Math.round(rects.h - rects.stick.y1)}px, A ${Math.round(rects.h - rects.action.y1)}px)`);
  check(rects.quests.y1 <= rects.stick.y0, `quest tracker clears the stick (${Math.round(rects.quests.y1)} <= ${Math.round(rects.stick.y0)})`);
  check(rects.hotbar.x0 >= rects.stick.x1 && rects.hotbar.x1 <= rects.action.x0, 'hotbar fits between the stick and A');
  await page.screenshot({ path: path.join(outDir, 'touch-landscape.png') });
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
}

main()
  .then(() => console.log(`\nTouch: ${n} checks passed.`))
  .catch((e) => { console.error(`\nTouch test FAILED: ${e.message}`); process.exitCode = 1; })
  .finally(async () => { await browser?.close().catch(() => {}); server.kill(); });
