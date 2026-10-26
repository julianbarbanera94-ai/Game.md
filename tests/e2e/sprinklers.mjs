// Sprinklers: unlock, place on the garden path, water both beds, persist.
//   node tests/e2e/sprinklers.mjs
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
const PORT = 9600 + Math.floor(Math.random() * 100);
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
  const shot = (name) => page.screenshot({ path: path.join(outDir, `sprinklers-${name}.png`) });
  const tp = (x, y, f = 'down') => page.evaluate(([px, py, ff]) => { const s = window.farmstead.state; s.player.x = px * 64; s.player.y = py * 64; s.player.facing = ff; }, [x, y, f]);
  const advance = (minutes) => page.evaluate(async (m) => {
    const g = window.farmstead;
    const { advanceTime } = await import('/src/systems/simulation.js');
    advanceTime(g.state, m, g.bus);
  }, minutes);

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('.modal button.primary');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const s = window.farmstead.state; s.coins = 2000; s.time = 10 * 60; });

  // locked at farm level 1
  await page.evaluate(() => window.farmstead.panels.planner('build'));
  await page.waitForTimeout(300);
  check(await page.isDisabled('[data-place="sprinkler"]'), 'the sprinkler is locked at farm level 1');
  check((await page.textContent('.planner')).includes('Reach farm level 2'), 'the planner says how to unlock it');
  await page.keyboard.press('Escape');

  // farm level 2 unlocks it (announced like other unlocks)
  await page.evaluate(() => { window.farmstead.state.xp = 100; });
  await page.waitForTimeout(1200);
  check((await page.textContent('#toasts')).includes('Sprinklers'), 'reaching level 2 announces sprinklers');

  // plant the starter bed by hand-free means and open the south bed
  await page.evaluate(() => {
    const s = window.farmstead.state;
    s.unlocks.gardenExpansion = true;
    for (const id of Object.keys(s.plots)) if (!id.startsWith('north')) Object.assign(s.plots[id], { tilled: true, crop: 'carrot', growth: 0, moistUntil: 0 });
  });

  // place it on the path between the beds through the planner
  await tp(6.0, 16.6, 'right');
  await page.evaluate(() => window.farmstead.panels.planner('build'));
  await page.waitForTimeout(300);
  await page.click('[data-place="sprinkler"]');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.farmstead.placement?.valid), `the garden path is a valid spot ("${await prompt()}")`);
  await shot('placing');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  let s = await state();
  const sp = s.placed.find((p) => p.type === 'sprinkler');
  check(!!sp && s.coins === 1850, `placed for 150 coins at (${sp?.x}, ${sp?.y})`);
  check(sp.x > 5 && sp.x < 9 && sp.y > 16 && sp.y < 17.2, 'it stands inside the garden fence, on the path');

  // it can't go on a plot: checking a spot right on the starter bed
  await tp(6.5, 13.4, 'down');
  await page.evaluate(() => window.farmstead.startPlacement('sprinkler'));
  await page.waitForTimeout(200);
  const onPlot = await page.evaluate(async () => {
    const { areaRect } = await import('/src/systems/buildings.js');
    return window.farmstead.buildCheck(areaRect('sprinkler', 6.5, 14.8));
  });
  check(!onPlot.ok && onPlot.text.includes('Not on a plot'), `a plot is refused ("${onPlot.text}")`);
  await page.keyboard.press('Escape');

  // it waters both beds as the clock runs
  await advance(5);
  s = await state();
  const garden = Object.entries(s.plots).filter(([id]) => !id.startsWith('north'));
  const wet = garden.filter(([, p]) => p.moistUntil > s.time).length;
  check(wet === 16, `all 16 garden plots are watered (${wet})`);
  await advance(4 * 60);
  s = await state();
  check(s.plots.starter_5_14.growth >= 240 && s.can.water === s.can.capacity, 'carrots grew without touching the watering can');
  check(Object.values(s.plots).filter((p, i) => Object.keys(s.plots)[i].startsWith('north')).every((p) => !p.moistUntil), 'nothing outside its reach is watered');

  // the jets run in the morning
  await page.evaluate(() => { const st = window.farmstead.state; st.time = Math.floor(st.time / 1440) * 1440 + 1440 + 6 * 60 + 5; });
  await tp(7.0, 19.4, 'up');
  await page.waitForTimeout(500);
  await shot('spraying');

  // saved with the game
  await page.evaluate(() => window.farmstead.manualSave());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-continue');
  await page.waitForTimeout(400);
  s = await state();
  check(s.placed.some((p) => p.type === 'sprinkler' && p.x === sp.x && p.y === sp.y), 'the sprinkler is still there after reloading');
  await page.evaluate(() => { const st = window.farmstead.state; for (const p of Object.values(st.plots)) if (p.crop) { p.growth = 0; p.moistUntil = 0; } });
  await advance(2);
  s = await state();
  check(s.plots.south_8_18.moistUntil > s.time, 'and it keeps watering after loading');

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log(`\nSprinklers: ${n} checks passed.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); server.kill(); });
