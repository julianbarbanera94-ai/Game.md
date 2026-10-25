// End-to-end playthrough of the first farming loop in a real browser.
// Drives the game with keyboard input only (plus clicking UI buttons), then
// saves, reloads and verifies the restored state.
//
//   npm run test:e2e            (screenshots -> test-results/)
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
const PORT = 8200 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(PORT)], { stdio: 'ignore' });
const TILE = 64;
const errors = [];
let step = 0;
let browser;
const results = [];

function check(cond, msg) {
  const line = `${cond ? 'PASS' : 'FAIL'}  ${msg}`;
  results.push(line);
  console.log(line);
  if (!cond) throw new Error(`Check failed: ${msg}`);
}

async function main() {
  await new Promise((r) => setTimeout(r, 400));
  browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const shot = async (name) => page.screenshot({ path: path.join(outDir, `${String(++step).padStart(2, '0')}-${name}.png`) });
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.farmstead.state)));
  const pos = () => page.evaluate(() => ({ x: window.farmstead.state.player.x / 64, y: window.farmstead.state.player.y / 64 }));

  // Walk toward (tx, ty) in tiles by holding arrow keys; gives up after a timeout.
  async function walkTo(tx, ty, tol = 0.12) {
    const t0 = Date.now();
    const held = new Set();
    const hold = async (want) => {
      for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    };
    while (Date.now() - t0 < 15000) {
      const p = await pos();
      const dx = tx - p.x, dy = ty - p.y;
      if (Math.abs(dx) < tol && Math.abs(dy) < tol) break;
      const want = new Set();
      if (Math.abs(dx) >= tol) want.add(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
      if (Math.abs(dy) >= tol) want.add(dy > 0 ? 'ArrowDown' : 'ArrowUp');
      await hold(want);
      await page.waitForTimeout(16);
    }
    await hold(new Set());
    const p = await pos();
    check(Math.abs(p.x - tx) < 0.3 && Math.abs(p.y - ty) < 0.3, `walked to (${tx}, ${ty}) — at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  }
  async function route(points) {
    for (const [x, y] of points) await walkTo(x, y);
  }
  async function face(dir) {
    const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir];
    await page.keyboard.down(key);
    await page.waitForTimeout(30);
    await page.keyboard.up(key);
  }
  async function act() {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(450);
  }
  const prompt = () => page.textContent('#prompt');
  // Wait (up to 2 s) for a predicate on game state, so checks don't race the frame loop.
  const until = (fnSrc) => page.waitForFunction(fnSrc, null, { timeout: 2000 }).catch(() => {});

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await shot('title');
  await page.click('#btn-new');
  await page.waitForSelector('.modal');
  await shot('intro');
  await page.click('.modal button.primary');
  check((await state()).quests.q_breaking_ground.status === 'active', 'first quest active');

  // collision: walking up into the cottage is blocked
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowUp');
  check((await pos()).y > 8.2, 'cottage wall blocks the player');

  // walk to the garden through the gate
  const toGarden = [[17.9, 11.6], [7.0, 11.6], [7.0, 13.55]];
  await route(toGarden);
  await shot('garden-arrival');
  for (const col of [5, 6, 7, 8]) {
    await walkTo(col + 0.5, 13.55);
    await face('down');
    check((await prompt()).includes('Till soil'), `prompt offers tilling plot ${col}`);
    await act();
    check((await prompt()).includes('Plant Carrot'), 'prompt offers planting');
    await act();
    check((await prompt()).includes('Water'), 'prompt offers watering');
    await act();
  }
  let s = await state();
  check(s.inventory.seed_carrot === 2, 'four seeds consumed');
  check(s.can.water === 6, 'watering can used four times');
  check(s.quests.q_breaking_ground.status === 'complete', 'Breaking Ground complete');
  await shot('planted-and-watered');
  await page.keyboard.press('Enter');
  await until('window.farmstead.state.quests.q_breaking_ground.status === "claimed"');
  s = await state();
  check(s.coins === 75 && s.quests.q_first_harvest.status === 'active', 'reward claimed (+15) and next quest started');

  // sleep through the night at the cottage
  await route([[7.0, 11.6], [17.6, 11.6], [17.6, 8.75]]);
  await face('up');
  check((await prompt()).includes('cottage'), 'cottage door prompt');
  await act();
  await page.click('.modal button.primary'); // Sleep until morning
  await page.waitForTimeout(1200);
  s = await state();
  check(Math.floor(s.time / 1440) + 1 === 2 && s.time % 1440 >= 360 && s.time % 1440 < 375, 'slept until 6:00 AM on day 2');
  check(Object.values(s.plots).filter((p) => p.crop === 'carrot' && p.growth >= 240).length === 4, 'carrots grew overnight');

  await route([[17.6, 11.6], [7.0, 11.6], [7.0, 13.55]]);
  await walkTo(5.5, 13.55);
  await face('down');
  await shot('ready-to-harvest');
  for (const col of [5, 6, 7, 8]) {
    await walkTo(col + 0.5, 13.55);
    await face('down');
    check((await prompt()).includes('Harvest Carrot'), `prompt offers harvest on plot ${col}`);
    await act();
  }
  s = await state();
  check(s.inventory.carrot === 4, 'four carrots in the bag');
  check(Object.values(s.plots).every((p) => p.crop === null), 'plots emptied after harvest');
  await act(); // pressing again on the emptied plot replants it — it must not yield produce again
  s = await state();
  check(s.inventory.carrot === 4 && s.inventory.seed_carrot === 1, 'no duplicate harvest (second press replants instead)');
  await page.keyboard.press('Enter'); // claim First Harvest
  await until('window.farmstead.state.quests.q_first_harvest.status === "claimed"');
  check((await state()).inventory.seed_lettuce === 3, 'First Harvest reward: 3 lettuce seeds');

  // refill at the water barrel
  await route([[7.0, 13.55], [7.0, 11.6], [11.2, 11.6], [11.2, 13.55]]);
  await face('down');
  check((await prompt()).includes('Refill'), 'water barrel prompt');
  await act();
  check((await state()).can.water === 10, 'watering can refilled at the barrel');

  // sell at the market stall
  await route([[11.2, 11.6], [30.4, 11.6], [30.4, 11.3]]);
  await face('up');
  check((await prompt()).includes('market'), 'market prompt');
  await act();
  await page.waitForSelector('.shop');
  await shot('market-sell');
  await page.click('[data-sell-all="carrot"]');
  await page.waitForTimeout(250);
  // rapid double click on a sell button must not oversell
  s = await state();
  check(s.coins === 75 + 88 && !s.inventory.carrot, 'sold 4 carrots for 88 coins');
  check(s.quests.q_market_day.status === 'complete', 'Market Day complete');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await until('window.farmstead.state.quests.q_market_day.status === "claimed"');
  s = await state();
  check(s.coins === 188, 'Market Day reward (+25)');
  await act();
  await page.click('.tab:nth-child(2)');
  await page.waitForTimeout(100);
  check(await page.isEnabled('[data-buy="seed_tomato"]'), 'tomato seeds unlocked after Market Day');
  await page.dblclick('[data-buy5="seed_carrot"]');
  await page.waitForTimeout(300);
  s = await state();
  check(s.coins === 138 && s.inventory.seed_carrot === 6, `double-click bought exactly 5 seeds once (coins ${s.coins}, seeds ${s.inventory.seed_carrot})`);
  await shot('market-buy');
  await page.keyboard.press('Escape');
  check(s.quests.q_restock.status === 'complete', 'Restock complete');
  await page.keyboard.press('Enter');
  await until('window.farmstead.state.quests.q_restock.status === "claimed"');
  s = await state();
  check(s.coins === 148, `Restock reward (+10) (coins ${s.coins}, restock ${s.quests.q_restock.status})`);

  // locked land shows its requirement; can't afford yet
  await route([[30.4, 11.6], [12.1, 11.6], [12.1, 17.65], [11.45, 17.65]]);
  await face('left');
  await act();
  const upText = await page.textContent('.upgrade');
  check(upText.includes('250') && upText.includes('need'), 'garden expansion shows cost / insufficient coins');
  await page.keyboard.press('Escape');

  // manual save, reload, continue
  await page.keyboard.press('Escape');
  await page.click('[data-action="save"]');
  await page.waitForTimeout(200);
  const before = await state();
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  check((await page.textContent('#save-info')).includes('Day 2'), 'title shows saved game');
  await page.click('#btn-continue');
  await page.waitForTimeout(300);
  const after = await state();
  check(after.coins === before.coins, 'coins restored');
  check(JSON.stringify(after.inventory) === JSON.stringify(before.inventory), 'inventory restored');
  check(JSON.stringify(after.plots) === JSON.stringify(before.plots), 'plots restored');
  check(JSON.stringify(after.quests) === JSON.stringify(before.quests), 'quests restored');
  check(Math.abs(after.player.x - before.player.x) < 1, 'player position restored');
  await shot('after-reload');

  // night lighting check
  await page.evaluate(() => { window.farmstead.state.time += 14 * 60; });
  await page.waitForTimeout(200);
  await shot('evening');

  // mobile layout smoke test
  const saved = await page.evaluate(() => localStorage.getItem('farmstead.save'));
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  m.on('pageerror', (e) => errors.push(`mobile: ${e.message}`));
  await m.addInitScript((v) => { if (!localStorage.getItem('farmstead.save')) localStorage.setItem('farmstead.save', v); }, saved);
  await m.goto(`http://localhost:${PORT}/`);
  await m.waitForSelector('#title:not([hidden])');
  await m.click('#btn-continue');
  await m.waitForTimeout(400);
  check(await m.isVisible('#btn-action'), 'mobile action button visible');
  await m.screenshot({ path: path.join(outDir, `${String(++step).padStart(2, '0')}-mobile.png`) });

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await browser.close();
}

main()
  .then(() => {
    console.log(`\nE2E: ${results.length} checks passed. Screenshots in test-results/`);
  })
  .catch((err) => {
    console.error(`\nE2E FAILED: ${err.message}`);
    if (errors.length) console.error('Page errors:', errors);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close().catch(() => {});
    server.kill();
  });
