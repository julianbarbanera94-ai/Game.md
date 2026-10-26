// Fishing: buy a rod at the market, cast from the creek bank, hook a fish, sell it.
//   node tests/e2e/fishing.mjs
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
const PORT = 9700 + Math.floor(Math.random() * 100);
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
  const shot = (name) => page.screenshot({ path: path.join(outDir, `fishing-${name}.png`) });
  const tp = (x, y, f = 'down') => page.evaluate(([px, py, ff]) => { const s = window.farmstead.state; s.player.x = px * 64; s.player.y = py * 64; s.player.facing = ff; }, [x, y, f]);
  const act = async () => { await page.keyboard.press('KeyE'); await page.waitForTimeout(350); };

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('.modal button.primary');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const s = window.farmstead.state; s.coins = 200; s.time = 6 * 60 + 90 * 1440 * 0 + 0; s.time = (3 - 1) * 1440 + 7 * 60; });

  // buy the rod at the market stall
  await tp(30.4, 11.3, 'up');
  await page.waitForTimeout(250);
  await act();
  await page.waitForSelector('.shop');
  await page.click('.tab:nth-child(2)');
  await page.waitForTimeout(150);
  check((await page.textContent('.shop')).includes('Fishing Rod'), 'the market sells a fishing rod');
  await page.click('[data-buy="fishing_rod"]');
  await page.waitForTimeout(300);
  let s = await state();
  check(s.inventory.fishing_rod === 1 && s.coins === 160, 'bought the rod for 40 coins');
  await page.keyboard.press('Escape');

  // select the rod on the hotbar; no line can be cast from the grass
  await page.evaluate(() => window.farmstead.selectSlot(window.farmstead.hud.hotbarSlots().findIndex((sl) => sl.id === 'rod')));
  await tp(10, 20.6, 'down');
  await page.waitForTimeout(250);
  check(!(await prompt()).includes('Cast'), 'no casting from open grass');

  // the north bank of the creek: cast with Action
  await tp(10, 22.5, 'down');
  await page.waitForTimeout(250);
  check((await prompt()).includes('Cast line'), `the north bank offers a cast ("${await prompt()}")`);
  await act();
  await page.waitForTimeout(200);
  check(await page.evaluate(() => !!window.farmstead.fishing && window.farmstead.fishing.phase === 'wait'), 'the line is out');
  await shot('cast');

  // wait for a bite (3 to 9 seconds), then hook it
  await page.waitForFunction(() => window.farmstead.fishing?.phase === 'bite', null, { timeout: 15000 });
  check((await page.textContent('#toasts')).includes('bite'), 'a bite is announced');
  check((await prompt()).includes('Hook it'), `the prompt asks for the hook ("${await prompt()}")`);
  await shot('bite');
  await act();
  await page.waitForTimeout(300);
  s = await state();
  const catchKey = Object.keys(s.inventory).find((k) => ['perch', 'carp', 'trout'].includes(k));
  check(!!catchKey && s.inventory[catchKey] === 1, `hooked a fish in spring (${catchKey})`);
  check(s.counters.fish === 1, 'the catch counts for achievements');
  check((await page.textContent('#toasts')).includes('Caught'), 'the catch is announced');

  // sell it at the market
  const coins0 = s.coins;
  await tp(30.4, 11.3, 'up');
  await page.waitForTimeout(250);
  await act();
  await page.waitForSelector('.shop');
  await page.click('.tab:nth-child(1)');
  await page.waitForTimeout(150);
  await page.click(`[data-sell-all="${catchKey}"]`);
  await page.waitForTimeout(300);
  s = await state();
  check(s.coins > coins0 && !s.inventory[catchKey], `sold the fish for ${s.coins - coins0} coins`);
  await page.keyboard.press('Escape');

  // saved and restored with the rod
  await page.evaluate(() => window.farmstead.manualSave());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-continue');
  await page.waitForTimeout(400);
  s = await state();
  check(s.inventory.fishing_rod === 1, 'the rod is still in the bag after reloading');

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log(`\nFishing: ${n} checks passed.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); server.kill(); });
