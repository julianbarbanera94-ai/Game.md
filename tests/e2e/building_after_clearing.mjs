// Clearing makes room: every placeable building can be built in spots that were blocked by scenery.
//   node tests/e2e/building_after_clearing.mjs
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
const PORT = 9000 + Math.floor(Math.random() * 100);
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
  const page = await (await browser.newContext({ viewport: { width: 762, height: 352 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
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

  // Unlock everything and make rich, then for each building find a spot that is only blocked by
  // clearable scenery, clear exactly that, and build there through the real placement flow.
  const result = await page.evaluate(async () => {
    const g = window.farmstead;
    const s = g.state;
    const Buildings = await import('/src/systems/buildings.js');
    const Clearing = await import('/src/systems/clearing.js');
    const { BUILDINGS, DECORATIONS } = await import('/src/data/buildings.js');
    const { QUESTS } = await import('/src/data/quests.js');
    s.coins = 100000;
    for (const q of QUESTS) s.quests[q.id] = { ...(s.quests[q.id] || {}), status: 'claimed' };
    const out = {};
    for (const type of ['scarecrow', 'storage_shed', 'chicken_coop', 'barn']) {
      s.player.x = -500; s.player.y = -500; // keep the player out of the check
      let found = null;
      for (let x = 3; x < 34 && !found; x += 0.5) {
        for (let y = 4; y < 26.5 && !found; y += 0.5) {
          const area = Buildings.areaRect(type, x, y);
          const c = g.buildCheck(area);
          if (c.ok || !/in the way — cancel and clear/.test(c.text)) continue;
          // clear all clearable scenery overlapping this area, then it must be buildable
          const px = { x0: area.x0 * 64 - 8, y0: area.y0 * 64 - 8, x1: area.x1 * 64 + 8, y1: area.y1 * 64 + 8 };
          const blockers = Clearing.clearables(s).filter((b) => b.x * 64 > px.x0 && b.x * 64 < px.x1 && b.y * 64 > px.y0 && b.y * 64 < px.y1);
          if (!blockers.length) continue;
          const saved = [...s.cleared];
          for (const b of blockers) s.cleared.push(b.index);
          g.applyCleared();
          if (g.buildCheck(area).ok) found = { x, y, blockers: blockers.map((b) => b.index), saved };
          else { s.cleared = saved; g.applyCleared(); }
        }
      }
      if (!found) { out[type] = { found: false }; continue; }
      // really clear them with coins, then walk-free placement via the game API
      s.cleared = found.saved; g.applyCleared();
      const before = s.coins;
      for (const i of found.blockers) Clearing.clear(s, i);
      g.applyCleared();
      const spent = before - s.coins;
      s.player.x = (found.x) * 64; s.player.y = (found.y + 8) * 64; // far from the spot
      const r = Buildings.place(s, type, found.x, found.y, (rect) => g.isBuildable(rect));
      g.refreshColliders();
      out[type] = { found: true, blockers: found.blockers.length, spent, placed: r.ok, reason: r.reason || '' };
    }
    return out;
  });
  for (const [type, r] of Object.entries(result)) {
    check(r.found, `${type}: a spot that only needed clearing exists`);
    check(r.placed, `${type}: built after clearing ${r.blockers} thing(s) for ${r.spent} coins${r.reason ? ' — ' + r.reason : ''}`);
  }

  // Snap: standing a little off a good spot still lets you place it.
  const snap = await page.evaluate(async () => {
    const g = window.farmstead;
    const s = g.state;
    s.placed = []; g.refreshColliders();
    s.cleared = []; g.applyCleared();
    s.coins = 5000;
    s.player.x = 27 * 64; s.player.y = 16.5 * 64; s.player.facing = 'down';
    g.startPlacement('storage_shed');
    g.updatePlacement();
    return { valid: g.placement.valid, text: g.placement.check.text };
  });
  check(snap.valid, `placement finds a valid spot in the east meadow (${snap.text || 'ok'})`);

  // The blocked message names the problem.
  const msg = await page.evaluate(() => {
    const g = window.farmstead;
    g.state.player.x = 17.9 * 64; g.state.player.y = 9.8 * 64; g.state.player.facing = 'up';
    g.placement = { type: 'barn', x: 0, y: 0, valid: false };
    g.updatePlacement();
    return g.placementTarget().label;
  });
  check(/edge of the map|path|garden|creek|in the way|door|standing/.test(msg), `blocked placement explains why ("${msg}")`);
  await page.screenshot({ path: path.join(outDir, 'placement-blocked.png') });
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log(`\nBuilding after clearing: ${n} checks passed.`);
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
