// Clearing trees/bushes/rocks to make room for buildings.
//   node tests/e2e/clearing.mjs
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
const PORT = 8900 + Math.floor(Math.random() * 100);
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
  const ctx = await browser.newContext({ viewport: { width: 762, height: 352 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.tap('#btn-new');
  await page.waitForTimeout(300);
  await page.tap('.modal button.primary');
  await page.waitForTimeout(200);

  // the oak at (24.6, 22.4): stand just below it
  await page.evaluate(() => {
    const g = window.farmstead;
    g.state.coins = 200;
    g.state.player.x = 24.6 * 64;
    g.state.player.y = 22.4 * 64 + 40;
    g.state.player.facing = 'up';
  });
  await page.waitForTimeout(300);
  const prompt = await page.textContent('#prompt');
  check(/Clear tree \(60 coins\)/.test(prompt), `prompt offers clearing the tree ("${prompt.trim()}")`);
  const rect = { x0: 24.25, y0: 21.95, x1: 24.95, y1: 22.4 };
  check(!(await page.evaluate((r) => window.farmstead.isBuildable(r), rect)), 'the tree blocks building there');
  const before = await page.evaluate(() => window.farmstead.world.drawables.length);

  await page.tap('#btn-action');
  await page.waitForTimeout(500);
  check((await page.textContent('.modal')).includes('Clear the tree?'), 'asks for confirmation first');
  check((await page.evaluate(() => window.farmstead.state.coins)) === 200, 'nothing is spent before confirming');
  await page.tap('.modal button.primary');
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({ coins: window.farmstead.state.coins, cleared: window.farmstead.state.cleared, n: window.farmstead.world.drawables.length }));
  check(s.coins === 140 && s.cleared.length === 1, `cleared for 60 coins (${s.coins} left)`);
  check(s.n === before - 1, 'the tree is gone from the world');
  check(await page.evaluate((r) => window.farmstead.isBuildable(r), rect), 'the spot is now buildable');
  await page.screenshot({ path: path.join(outDir, 'clearing.png') });

  // too poor: a boulder costs 40
  await page.evaluate(() => {
    const g = window.farmstead;
    g.state.coins = 10;
    g.state.player.x = 9.4 * 64;
    g.state.player.y = 22.0 * 64 + 40;
    g.state.player.facing = 'up';
  });
  await page.waitForTimeout(300);
  await page.tap('#btn-action');
  await page.waitForTimeout(500);
  await page.tap('.modal button.primary');
  await page.waitForTimeout(400);
  const poor = await page.evaluate(() => ({ coins: window.farmstead.state.coins, cleared: window.farmstead.state.cleared.length }));
  check(poor.coins === 10 && poor.cleared === 1, 'not enough coins: nothing is cleared or spent');

  // persists across reload
  await page.evaluate(() => window.farmstead.manualSave());
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.tap('#btn-continue');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ cleared: window.farmstead.state.cleared.length, n: window.farmstead.world.drawables.length }));
  check(after.cleared === 1 && after.n === before - 1, 'cleared scenery is still gone after reload');

  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log(`\nClearing: ${n} checks passed.`);
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
