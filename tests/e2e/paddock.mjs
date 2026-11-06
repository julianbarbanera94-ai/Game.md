// East Paddock: buy the land, drive a tractor from the garage into it with the
// keyboard, attach a plough and work the paddock.
//   node tests/e2e/paddock.mjs
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
const PORT = 9750 + Math.floor(Math.random() * 100);
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
  const shot = (name) => page.screenshot({ path: path.join(outDir, `paddock-${name}.png`) });
  const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('.modal button.primary');
  await page.waitForTimeout(300);
  // farm level 3 and money; the garage stands where a player would have built it
  await page.evaluate(() => {
    const g = window.farmstead; const s = g.state;
    s.coins = 6000; s.xp = 300;
    s.placed.push({ uid: 'gar', kind: 'building', type: 'garage', x: 21.5, y: 12.6, level: 1, job: null, storage: {} });
    g.applyWorldFlags(); g.refreshColliders();
  });

  // buy the North Field by walking up to its sign and pressing E (the real purchase path)
  const buyLand = async (plotX, plotY, id) => {
    await page.evaluate(([x, y]) => { const p = window.farmstead.state.player; p.x = x * 64; p.y = y * 64; p.facing = 'up'; }, [plotX, plotY]);
    await page.waitForTimeout(350);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(350);
    await page.click(`[data-upgrade="${id}"]`).catch(() => {});
    await page.waitForTimeout(350);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  };
  // the North Field needs the South Garden Bed, which needs the market quest (set as already done)
  await page.evaluate(() => { window.farmstead.state.quests.q_market_day.status = 'claimed'; });
  await buyLand(5.5, 19.5, 'gardenExpansion');
  await buyLand(5.5, 9.5, 'northField');
  await buyLand(23.5, 15.6, 'eastPaddock');
  let s = await state();
  check(s.unlocks.northField && s.unlocks.eastPaddock, 'bought the North Field and then the East Paddock');
  check(s.coins === 6000 - 250 - 600 - 1200, `the purse paid 250 + 600 + 1200 (${s.coins} left)`);
  await page.keyboard.press('Escape');

  // a tractor from the garage, parked on its spot
  await page.evaluate(() => window.farmstead.buyVehicle('tractor_small'));
  await page.evaluate(() => window.farmstead.buyImplement('plough'));
  s = await state();
  const v = s.vehicles[0];
  check(!!v && s.owned.implements.includes('plough'), `bought the tractor and plough (tractor at ${(v.x / 64).toFixed(1)}, ${(v.y / 64).toFixed(1)})`);
  // walk up to the parked tractor (checking the prompt names it), attach the plough from its panel, then get in
  await page.evaluate(() => window.farmstead.panels.close(true));
  for (let tries = 0; tries < 4; tries++) {
    await page.evaluate(() => { const t = window.farmstead.state.vehicles[0]; const p = window.farmstead.state.player; p.x = t.x - 0.75 * 64; p.y = t.y; p.facing = 'right'; });
    await page.waitForTimeout(350);
    if ((await page.textContent('#prompt')).includes('Tractor')) break;
  }
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  await page.click('[data-attach="plough"]');
  await page.waitForTimeout(300);
  await page.click(`[data-drive="${v.uid}"]`);
  await page.waitForTimeout(300);
  check((await state()).driving === v.uid, 'got into the tractor');

  // drive into the paddock with the keys, steering toward its centre by the tractor's own heading
  const target = { x: 27.0 * 64, y: 16.5 * 64 };
  const inside = () => page.evaluate(() => { const t = window.farmstead.state.vehicles[0]; return t.x > 23.6 * 64 && t.x < 30.6 * 64 && t.y > 14.6 * 64 && t.y < 18.4 * 64; });
  const driveTo = async (tx, ty, timeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const st = await page.evaluate(([x, y]) => {
        const t = window.farmstead.state.vehicles[0];
        const want = Math.atan2(y - t.y, x - t.x);
        let d = want - t.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        return { d, dist: Math.hypot(x - t.x, y - t.y), speed: t.speed, fuel: t.fuel };
      }, [tx, ty]);
      if (st.dist < 40) break;
      const keys = ['KeyW'];
      if (st.d > 0.12) keys.push('KeyD'); else if (st.d < -0.12) keys.push('KeyA');
      await hold(keys, 180);
    }
  };
  await driveTo(target.x, target.y, 15000);
  s = await state();
  const t1 = s.vehicles[0];
  check(await inside(), `drove from the garage into the paddock (at ${(t1.x / 64).toFixed(1)}, ${(t1.y / 64).toFixed(1)})`);
  check(t1.fuel < 20, `the drive used fuel (${t1.fuel.toFixed(1)} left)`);
  await shot('arrived');

  // lower the plough and work the paddock in passes
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  check((await state()).vehicles[0].engaged === true, 'the plough is lowered');
  await driveTo(30.4 * 64, 15.6 * 64, 15000);
  await driveTo(24.0 * 64, 17.6 * 64, 15000);
  s = await state();
  const tilled = PADDOCK_IDS(s).filter((id) => s.plots[id].tilled).length;
  check(tilled >= 16, `the plough tilled the paddock (${tilled} of 40 plots)`);
  await shot('ploughed');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);

  // get off, the land stays worked
  await hold(['KeyS'], 500);
  await page.waitForTimeout(2000); // let it roll to a stop: the game asks you to slow down first
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  check((await state()).driving === null, 'got off the tractor');

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log(`\nPaddock: ${n} checks passed.`);
}

function PADDOCK_IDS() {
  const ids = [];
  for (let row = 14; row <= 18; row++) for (let col = 23; col <= 30; col++) ids.push(`paddock_${col}_${row}`);
  return ids;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); server.kill(); });
