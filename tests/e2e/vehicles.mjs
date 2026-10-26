// Phase 6: garage, tractor, driving, implements, trailer, and moving structures.
//   node tests/e2e/vehicles.mjs
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
const PORT = 9300 + Math.floor(Math.random() * 100);
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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.farmstead.state)));
  const prompt = async () => (await page.textContent('#prompt')).trim();
  const shot = (name) => page.screenshot({ path: path.join(outDir, `vehicles-${name}.png`) });
  const tp = (x, y, f = 'down') => page.evaluate(([px, py, ff]) => { const s = window.farmstead.state; s.player.x = px * 64; s.player.y = py * 64; s.player.facing = ff; }, [x, y, f]);
  const act = async () => { await page.keyboard.press('KeyE'); await page.waitForTimeout(450); };
  const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys.slice().reverse()) await page.keyboard.up(k); };

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('.modal button.primary');
  await page.waitForTimeout(300);

  // --- build a garage through the real placement flow (needs farm level 3)
  await page.evaluate(() => { const s = window.farmstead.state; s.coins = 12000; s.xp = 0; });
  await page.evaluate(() => window.farmstead.startPlacement('garage'));
  await page.waitForTimeout(200);
  check((await page.evaluate(() => window.farmstead.placement)) === null, 'the garage is locked below farm level 3');
  await page.evaluate(() => { window.farmstead.state.xp = 300; });
  await tp(21.5, 12.6, 'down');
  await page.evaluate(() => window.farmstead.startPlacement('garage'));
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.farmstead.placement.valid), `the garage can be placed ("${await prompt()}")`);
  await act();
  let s = await state();
  const garage = s.placed.find((p) => p.type === 'garage');
  check(!!garage && garage.job && s.coins === 11500, 'garage construction started for 500 coins');
  await page.evaluate(async () => {
    const g = window.farmstead;
    const { advanceTime } = await import('/src/systems/simulation.js');
    advanceTime(g.state, 7 * 60, g.bus);
  });
  s = await state();
  check(s.placed.find((p) => p.type === 'garage').level === 1, 'the builders finished the garage');

  // --- buy at the garage
  await tp(garage.x, garage.y + 0.55, 'up');
  await page.waitForTimeout(300);
  check((await prompt()).includes('garage'), `garage prompt ("${await prompt()}")`);
  await act();
  check(await page.isVisible('.garage'), 'garage panel opens');
  check((await page.textContent('[data-for-sale="tractor_large"]')).includes('level 5'), 'the large tractor is locked until level 5');
  await page.click('[data-buy-vehicle="tractor_small"]');
  await page.waitForTimeout(400);
  for (const id of ['plough', 'seeder', 'sprayer', 'reaper', 'crop_trailer']) {
    await page.click(`[data-buy-implement="${id}"]`);
    await page.waitForTimeout(380);
  }
  s = await state();
  check(s.vehicles.length === 1 && s.owned.implements.length === 5, 'bought a tractor, four implements and a trailer');
  check(s.vehicles[0].fuel === 20, 'the tractor arrives half full');
  await page.click('[data-refuel]');
  await page.waitForTimeout(400);
  s = await state();
  check(s.vehicles[0].fuel === 40 && s.coins < 12000 - 500 - 1500 - 3050, 'refuelled for coins at the garage price');
  await shot('garage');
  await page.keyboard.press('Escape');

  // --- the parked tractor: attach implements from its panel
  const v0 = s.vehicles[0];
  await tp(v0.x / 64 + 0.75, v0.y / 64, 'left');
  await page.waitForTimeout(300);
  check((await prompt()).includes('Small Tractor'), `tractor prompt ("${await prompt()}")`);
  await act();
  await page.click('[data-attach="plough"]');
  await page.waitForTimeout(350);
  await page.click('[data-attach="crop_trailer"]');
  await page.waitForTimeout(350);
  s = await state();
  check(s.vehicles[0].mount.front === 'plough' && s.vehicles[0].mount.rear === 'crop_trailer', 'plough and trailer attached');
  check((await page.$('[data-attach="plough"]')) === null, 'the plough button turns into Detach');
  await page.keyboard.press('Escape');

  // --- drive: forward, steering, collision with the creek
  await page.evaluate(() => { const g = window.farmstead; g.enterVehicle(g.state.vehicles[0].uid); });
  await page.waitForTimeout(200);
  s = await state();
  check(s.driving === v0.uid, 'entered the tractor');
  check(await page.isVisible('#vehicle-hud') && await page.isVisible('#btn-exit-vehicle'), 'the fuel gauge and Get off button appear');
  await page.evaluate(() => { const v = window.farmstead.state.vehicles[0]; v.x = 21.5 * 64; v.y = 18 * 64; v.heading = Math.PI / 2; v.speed = 0; });
  const fuel0 = (await state()).vehicles[0].fuel;
  await hold(['KeyW'], 4000);
  s = await state();
  const v1 = s.vehicles[0];
  check(v1.y / 64 > 20 && v1.y / 64 < 23.1, `it drove south and the creek stopped it (y=${(v1.y / 64).toFixed(2)})`);
  check(v1.fuel < fuel0, `fuel was used (${fuel0} -> ${v1.fuel.toFixed(2)})`);
  check(s.player.x === v1.x && s.player.y === v1.y, 'the camera target (player) follows the tractor');
  check(s.counters.driven >= 2, `driving counts distance (${s.counters.driven} tiles)`);
  await shot('driving');
  await hold(['KeyS', 'KeyD'], 800);
  s = await state();
  check(Math.abs(s.vehicles[0].heading - Math.PI / 2) > 0.2, 'reversing while steering turns the tractor');

  // --- work the north field with the plough (the garden itself is fenced)
  await page.evaluate(() => {
    const v = window.farmstead.state.vehicles[0];
    v.x = 3.6 * 64; v.y = 8.0 * 64; v.heading = 0; v.speed = 0; v.fuel = 30;
    window.farmstead.state.unlocks.gardenExpansion = true; window.farmstead.state.unlocks.northField = true;
    window.farmstead.state.quests.q_first_drive.status = 'claimed';
    window.farmstead.state.quests.q_plough_field.status = 'active';
  });
  check((await prompt()).includes('Start the plough'), `prompt offers the plough ("${await prompt()}")`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  await hold(['KeyW'], 1600);
  s = await state();
  const tilled = Object.values(s.plots).filter((p) => p.tilled).length;
  check(tilled >= 4, `the plough tilled ${tilled} plots by driving over them`);
  check(s.quests.q_plough_field.progress[0] >= 4, '"Ploughing Day" counts machine work');
  check(s.counters.till === tilled && s.counters.machineWork === tilled, 'tilling counts for achievements too');
  await shot('ploughing');

  // swap to the seeder, then the sprayer, then harvest with the reaper
  const swap = async (id) => page.evaluate((imp) => {
    const g = window.farmstead; const v = g.state.vehicles[0];
    v.engaged = false; v.mount.front = imp; v.x = 3.6 * 64; v.y = 8.0 * 64; v.heading = 0; v.speed = 0; v.fuel = 30;
  }, id);
  await swap('seeder');
  await page.evaluate(() => { window.farmstead.state.inventory.seed_carrot = 20; });
  await page.keyboard.press('KeyE');
  await hold(['KeyW'], 1600);
  s = await state();
  const planted = Object.values(s.plots).filter((p) => p.crop).length;
  check(planted >= 4 && s.inventory.seed_carrot === 20 - planted, `the seeder planted ${planted} plots with real seeds`);
  await swap('sprayer');
  await page.keyboard.press('KeyE');
  await hold(['KeyW'], 1600);
  s = await state();
  check(Object.values(s.plots).filter((p) => p.crop && p.moistUntil > s.time).length >= 4, 'the sprayer watered them without the can');
  await page.evaluate(() => { for (const p of Object.values(window.farmstead.state.plots)) if (p.crop) p.growth = 9999; });
  await swap('reaper');
  await page.keyboard.press('KeyE');
  await hold(['KeyW'], 1600);
  s = await state();
  const cargo = Object.values(s.vehicles[0].cargo).reduce((a, b) => a + b, 0);
  check(cargo >= 4, `the reaper loaded ${cargo} crops into the trailer`);
  check(s.counters.harvest >= 4, 'machine harvests count as harvests');

  // --- get off (only when slow), unload into the bag
  await page.evaluate(() => { const v = window.farmstead.state.vehicles[0]; v.engaged = false; v.speed = 0; v.x = 25 * 64; v.y = 19 * 64; v.heading = 0; });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  s = await state();
  check(s.driving === null, 'F gets you out');
  const tv = s.vehicles[0];
  check(Math.hypot(s.player.x - tv.x, s.player.y - tv.y) > 30 && Math.hypot(s.player.x - tv.x, s.player.y - tv.y) < 120, 'you step out beside the tractor');
  await page.evaluate(() => { const g = window.farmstead; g.enterVehicle(g.state.vehicles[0].uid); g.state.vehicles[0].speed = 200; });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(200);
  check((await state()).driving !== null, 'you cannot jump out at speed');
  await page.evaluate(() => { window.farmstead.state.vehicles[0].speed = 0; });
  await page.click('#btn-exit-vehicle');
  await page.waitForTimeout(300);
  check((await state()).driving === null, 'the Get off button works too');
  s = await state();
  await tp(s.vehicles[0].x / 64 + 0.75, s.vehicles[0].y / 64, 'left');
  await page.waitForTimeout(300);
  await act();
  await page.click('[data-unload]');
  await page.waitForTimeout(350);
  s = await state();
  check((s.inventory.carrot || 0) >= 4 && Object.keys(s.vehicles[0].cargo).length === 0, 'the trailer unloads into the bag');
  await page.keyboard.press('Escape');

  // --- run out of fuel; towing
  await page.evaluate(() => { const g = window.farmstead; g.state.vehicles[0].fuel = 0; g.enterVehicle(g.state.vehicles[0].uid); });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  check(Math.abs((await state()).vehicles[0].speed) < 1, 'an empty tank means no movement');
  check((await page.$$eval('#toasts .toast', (t) => t.map((x) => x.textContent))).some((t) => t.includes('Out of fuel')), 'with a clear warning');
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(250);
  s = await state();
  await tp(s.vehicles[0].x / 64 + 0.75, s.vehicles[0].y / 64, 'left');
  await page.waitForTimeout(300);
  await act();
  await page.click('[data-tow]');
  await page.waitForTimeout(350);
  s = await state();
  check(Math.abs(s.vehicles[0].y - (garage.y + 1.9) * 64) < 2, 'towing brings it back to the garage');
  await page.keyboard.press('Escape');

  // --- save and reload
  await page.evaluate(() => window.farmstead.manualSave());
  const saved = await state();
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-continue');
  await page.waitForTimeout(800);
  s = await state();
  check(s.version === 7 && s.vehicles.length === 1 && s.vehicles[0].mount.front === 'reaper' && s.vehicles[0].mount.rear === 'crop_trailer', 'the tractor and its attachments survive a reload');
  check(JSON.stringify(s.owned) === JSON.stringify(saved.owned) && s.driving === null, 'ownership survives, and you load standing outside');

  // --- moving structures
  await tp(garage.x, garage.y + 0.55, 'up');
  await page.waitForTimeout(300);
  await act();
  await page.click('[data-move]');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !!window.farmstead.placement?.moveUid), 'Move this building starts a move');
  check((await prompt()).startsWith('Move Garage here') || (await prompt()).includes('Garage'), `the prompt says what will happen ("${await prompt()}")`);
  await tp(24.5, 20.5, 'down');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.farmstead.placement.valid), 'the new spot is valid');
  await act();
  s = await state();
  const moved = s.placed.find((p) => p.type === 'garage');
  check(moved.uid === garage.uid && Math.abs(moved.x - garage.x) + Math.abs(moved.y - garage.y) > 1 && s.coins === saved.coins, 'the garage moved for free, same building');
  check(await page.evaluate(() => window.farmstead.placement === null), 'placement mode ended');

  // a decoration: move it, then pick it up for half the price
  await page.evaluate(() => { const g = window.farmstead; g.state.coins = 1000; g.state.placed.push({ uid: 'pd1', kind: 'decor', type: 'scarecrow', x: 12, y: 21, level: 1, job: null }); g.refreshColliders(); });
  await tp(12, 21.5, 'up');
  await page.waitForTimeout(300);
  check((await prompt()).includes('Scarecrow'), `scarecrows offer to move or pick up ("${await prompt()}")`);
  await act();
  await page.click('.modal button:has-text("Pick up")');
  await page.waitForTimeout(300);
  s = await state();
  check(!s.placed.some((p) => p.uid === 'pd1') && s.coins === 1020, 'picked up for half the price (+20)');

  // --- placement may reach the real edge of the map
  const edge = await page.evaluate(() => {
    const g = window.farmstead;
    const b = g.world.bounds;
    const tile = 64;
    const top = b.y0 / tile;
    const mk = (y0) => ({ x0: 30, y0, x1: 31, y1: y0 + 0.8 });
    return { top, atEdge: g.buildCheck(mk(top)).text, beyond: g.buildCheck(mk(top - 0.2)).text };
  });
  check(!/edge of the map/.test(edge.atEdge), `a footprint right at the map edge is not rejected for being at the edge ("${edge.atEdge || 'ok'}")`);
  check(/edge of the map/.test(edge.beyond), 'but one hanging over the edge is');
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log(`\nVehicles: ${n} checks passed.`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.kill();
  });
