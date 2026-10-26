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
  // From outside the cottage door: go in, sleep in the bed, come back out.
  async function sleepInCottage(beforeLeaving) {
    await face('up');
    check((await prompt()).includes('cottage'), 'cottage door prompt');
    await act();
    await page.waitForTimeout(700);
    check((await state()).player.scene === 'house', 'entered the cottage interior');
    await route([[4.5, 6.2], [2.95, 6.2]]);
    await face('left');
    check((await prompt()).includes('Sleep'), 'bed prompt inside the cottage');
    await act();
    await page.click('.modal button.primary');
    await page.waitForTimeout(1300);
    if (beforeLeaving) await beforeLeaving();
    await route([[4.5, 6.2], [4.5, 8.3]]);
    await face('down');
    check((await prompt()).includes('Leave'), 'exit prompt');
    await act();
    await page.waitForTimeout(700);
    check((await state()).player.scene === 'farm', 'back outside');
  }
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
  await sleepInCottage(async () => {
    s = await state();
    check(Math.floor(s.time / 1440) + 1 === 2 && s.time % 1440 >= 360 && s.time % 1440 < 375, 'slept until 6:00 AM on day 2');
    check(Object.values(s.plots).filter((p) => p.crop === 'carrot' && p.growth >= 240).length === 4, 'carrots grew overnight');
  });

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

  // ---------------- Phase 4: buildings
  // Test setup: grant coins so the upgrade flow can be exercised without
  // farming for several in-game days.
  await page.evaluate(() => { window.farmstead.state.coins += 2000; });
  await route([[11.45, 17.65], [12.1, 17.65], [12.1, 11.6], [22.4, 11.6], [22.4, 10.3]]);
  await face('up');
  check((await prompt()).includes('Building planner'), 'workbench opens the building planner');
  await act();
  await page.waitForSelector('.planner');
  await shot('planner');
  await page.click('[data-upgrade-building="tool_shed"]');
  await until('window.farmstead.state.buildings.tool_shed.job !== null');
  s = await state();
  check(s.buildings.tool_shed.job && s.buildings.tool_shed.job.toLevel === 2, 'workshop upgrade started');
  await page.click('.tab:nth-child(2)');
  await page.waitForTimeout(400);
  await page.click('[data-place="storage_shed"]');
  await page.waitForTimeout(100);
  check(await page.isVisible('#btn-cancel'), 'placement mode active');
  await route([[22.0, 11.6], [15.4, 11.6], [15.4, 15.6]]);
  await face('down');
  await page.waitForTimeout(100);
  check((await prompt()).includes('Place Storage Shed'), 'valid spot for the storage shed');
  await shot('placing-shed');
  await act();
  s = await state();
  check(s.placed.length === 1 && s.placed[0].type === 'storage_shed' && s.placed[0].level === 0, 'storage shed under construction');
  // the new shed blocks movement
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowDown');
  check((await pos()).y < s.placed[0].y - 1.2, 'construction site blocks the player');
  // decoration
  await route([[15.4, 11.6], [22.4, 11.6], [22.4, 10.3]]);
  await face('up');
  await act();
  await page.click('.tab:nth-child(2)');
  await page.waitForTimeout(400);
  await page.click('[data-place="scarecrow"]');
  await route([[22.4, 11.6], [17.6, 11.6], [17.6, 18.6], [16.0, 18.6]]);
  await face('down');
  await page.waitForTimeout(100);
  await act();
  s = await state();
  check(s.placed.some((p) => p.type === 'scarecrow' && p.level === 1), 'scarecrow placed instantly');
  await shot('construction');

  // sleep inside the cottage: builders finish overnight
  await route([[17.6, 18.6], [17.6, 8.75]]);
  await sleepInCottage(async () => {
    await shot('interior');
    s = await state();
    check(s.buildings.tool_shed.level === 2 && s.can.capacity === 25, 'workshop finished overnight: can holds 25');
    check(s.placed.find((p) => p.type === 'storage_shed').level === 1, 'storage shed finished overnight');
    check(s.quests.q_storage.status === 'complete', 'Storage Solutions complete');
    await page.keyboard.press('Enter');
    await until('window.farmstead.state.quests.q_storage.status === "claimed"');
  });

  // use the storage shed
  await route([[17.9, 11.6], [17.9, 17.9], [15.4, 17.9]]);
  await face('up');
  check((await prompt()).includes('storage shed'), 'storage shed prompt');
  await act();
  await page.waitForSelector('.storage');
  await page.click('[data-store-all="seed_lettuce"]');
  await page.waitForTimeout(400);
  s = await state();
  const shedRec = s.placed.find((p) => p.type === 'storage_shed');
  check(shedRec.storage.seed_lettuce === 3 && !s.inventory.seed_lettuce, 'stored 3 lettuce seeds in the shed');
  await shot('storage');
  await page.keyboard.press('Escape');

  // ---------------- Phase 5: livestock
  // Expand the garden (the real flow) to finish "Room to Grow", which unlocks the coop.
  await route([[11.45, 17.65]]);
  await face('left');
  check((await prompt()).includes('Expand'), 'garden sign offers the expansion');
  await act();
  await page.waitForSelector('.upgrade');
  await page.click('[data-upgrade="gardenExpansion"]');
  await until('window.farmstead.state.unlocks.gardenExpansion === true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await until('window.farmstead.state.quests.q_room_to_grow.status === "claimed"');
  check((await state()).quests.q_coop.status === 'active', 'room to grow done: "A Home for Hens" unlocked');

  // Build a chicken coop in the east meadow with the planner.
  await route([[12.1, 17.65], [12.1, 11.6], [22.4, 11.6], [22.4, 10.3]]);
  await face('up');
  await act();
  await page.waitForSelector('.planner');
  await page.click('.tab:nth-child(2)');
  await page.waitForTimeout(400);
  check(await page.isEnabled('[data-place="chicken_coop"]'), 'coop can be built once the garden is expanded');
  check(!(await page.isEnabled('[data-place="barn"]')), 'barn is still locked (needs Egg Money)');
  await page.click('[data-place="chicken_coop"]');
  await route([[22.4, 11.6], [24.0, 11.6], [24.0, 12.9]]);
  await face('down');
  await page.waitForTimeout(150);
  check((await prompt()).includes('Place Chicken Coop'), 'valid spot for the coop and its pasture');
  await shot('placing-coop');
  await act();
  s = await state();
  const coopUid = s.placed.find((p) => p.type === 'chicken_coop').uid;
  check(s.placed.find((p) => p.uid === coopUid).level === 0, 'coop under construction');
  await route([[24.0, 11.6], [17.6, 11.6], [17.6, 8.75]]);
  await sleepInCottage(async () => {
    s = await state();
    check(s.placed.find((p) => p.uid === coopUid).level === 1, 'coop finished overnight');
    check(s.quests.q_coop.status === 'complete', '"A Home for Hens" complete');
    await page.keyboard.press('Enter');
    await until('window.farmstead.state.quests.q_coop.status === "claimed"');
  });

  // Chicken feed is for sale now that a coop exists.
  await route([[17.9, 11.6], [30.4, 11.6], [30.4, 11.3]]);
  await face('up');
  await act();
  await page.waitForSelector('.shop');
  await page.click('.tab:nth-child(2)');
  await page.waitForTimeout(200);
  check(await page.isEnabled('[data-buy5="chicken_feed"]'), 'market now sells chicken feed');
  check(await page.isDisabled('[data-buy="hay"]'), 'hay is still locked (no barn yet)');
  await page.click('[data-buy5="chicken_feed"]');
  await until('window.farmstead.state.inventory.chicken_feed === 5');
  await page.keyboard.press('Escape');

  // Walk through the pasture gate, open the coop and buy two hens.
  const toCoop = [[20.5, 11.6], [20.5, 21.0], [24.0, 21.0], [24.0, 17.9]];
  await route(toCoop);
  await face('up');
  check((await prompt()).includes('Open chicken coop'), 'coop prompt inside the pasture');
  await act();
  await page.waitForSelector('.livestock');
  await shot('coop-panel-empty');
  await page.click('[data-buy-animal="chicken"]');
  await page.waitForTimeout(450);
  await page.click('[data-buy-animal="chicken"]');
  await until('window.farmstead.state.animals.length === 2');
  s = await state();
  check(s.animals.length === 2 && s.coins < 1500, 'two hens bought');
  check(s.quests.q_first_hens.progress[0] === 2, '"First Hens": buying counted');
  await page.keyboard.press('Escape');

  // Hunger: after a few hours the hens are hungry; feed them in the world.
  await page.evaluate(() => { const st = window.farmstead.state; st.animals.forEach((a) => { a.fedUntil = st.time - 1; }); });
  // Hens wander, so stand next to the first one again if it moved before the prompt updates.
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => {
      const g = window.farmstead; const ac = g.actors.list()[0];
      g.state.player.x = ac.x; g.state.player.y = ac.y - 24; g.state.player.facing = 'down';
    });
    await page.waitForTimeout(250);
    if ((await prompt()).includes('Feed')) break;
  }
  const feedPrompt = await prompt();
  check(feedPrompt.includes('Feed'), `a hungry hen offers feeding (prompt: "${feedPrompt.trim()}")`);
  await shot('hungry-hens');
  await act();
  s = await state();
  check(s.animals.every((a) => a.fedUntil > s.time), 'both hens fed with one tap');
  check(s.inventory.chicken_feed === 3, 'two feed used');
  check(s.quests.q_first_hens.status === 'complete', '"First Hens" complete');
  await page.keyboard.press('Enter');
  await until('window.farmstead.state.quests.q_first_hens.status === "claimed"');
  check((await state()).inventory.chicken_feed === 9, 'quest reward: 6 chicken feed');

  // A night's sleep: fed hens lay eggs.
  await route([[24.0, 18.8], [24.0, 21.0], [20.5, 21.0], [20.5, 11.6], [17.6, 11.6], [17.6, 8.75]]);
  await sleepInCottage(async () => {
    s = await state();
    check(s.animals.every((a) => a.stock >= 1), 'each hen laid at least one egg overnight');
  });

  // Collect from a hen in the world, then the rest from the coop menu.
  await route([[17.9, 11.6], ...toCoop.slice(0, 3), [24.0, 18.8]]);
  // Hens wander, so stand next to the first one again if it moved before the prompt updates.
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => {
      const g = window.farmstead; const ac = g.actors.list()[0];
      g.state.player.x = ac.x; g.state.player.y = ac.y - 24; g.state.player.facing = 'down';
    });
    await page.waitForTimeout(250);
    if ((await prompt()).includes('Feed')) break;
  }
  const promptText = await prompt();
  check(/Collect \d+ eggs? from/.test(promptText), `a hen with eggs offers collecting ("${promptText.trim().slice(0, 40)}…")`);
  await shot('eggs-ready');
  const eggsBefore = (await state()).inventory.egg || 0;
  await act();
  const afterOne = (await state()).inventory.egg || 0;
  check(afterOne > eggsBefore, 'eggs collected from one hen');
  await page.evaluate(() => { const g = window.farmstead; g.state.player.x = 24.0 * 64; g.state.player.y = 17.9 * 64; g.state.player.facing = 'up'; });
  await page.waitForTimeout(250);
  await act();
  await page.waitForSelector('.livestock');
  await page.click('[data-collect-all]');
  await page.waitForTimeout(300);
  s = await state();
  check(s.animals.every((a) => a.stock === 0), 'collect-all emptied both hens');
  const eggs = s.inventory.egg;
  check(eggs >= 4, `collected ${eggs} eggs in total`);
  await page.keyboard.press('Escape');

  // Sell the eggs at the market.
  await route([[24.0, 18.8], [24.0, 21.0], [20.5, 21.0], [20.5, 11.6], [30.4, 11.6], [30.4, 11.3]]);
  await face('up');
  await act();
  await page.waitForSelector('.shop');
  const coinsBefore = (await state()).coins;
  await page.click('[data-sell-all="egg"]');
  await until(`window.farmstead.state.coins === ${coinsBefore + eggs * 12}`);
  check((await state()).coins === coinsBefore + eggs * 12, `sold ${eggs} eggs for ${eggs * 12} coins`);
  await page.keyboard.press('Escape');
  s = await state();
  check(s.quests.q_egg_money.status === 'complete', '"Egg Money" complete');
  await page.keyboard.press('Enter');
  await until('window.farmstead.state.quests.q_egg_money.status === "claimed"');

  // Barn next to the coop, then a cow.
  await route([[30.4, 11.6], [22.4, 11.6], [22.4, 10.3]]);
  await face('up');
  await act();
  await page.waitForSelector('.planner');
  await page.click('.tab:nth-child(2)');
  await page.waitForTimeout(400);
  check(await page.isEnabled('[data-place="barn"]'), 'barn unlocked by Egg Money');
  await page.click('[data-place="barn"]');
  await route([[22.4, 11.6], [30.0, 11.6], [30.0, 12.9]]);
  await face('down');
  await page.waitForTimeout(150);
  check((await prompt()).includes('Place Barn'), 'valid spot for the barn beside the coop');
  await act();
  await route([[30.0, 11.6], [17.6, 11.6], [17.6, 8.75]]);
  await sleepInCottage(async () => {
    s = await state();
    check(s.placed.find((p) => p.type === 'barn').level === 1, 'barn finished overnight');
    await page.keyboard.press('Enter');
    await until('window.farmstead.state.quests.q_barn.status === "claimed"');
  });
  await route([[17.9, 11.6], [20.5, 11.6], [20.5, 21.0], [30.0, 21.0], [30.0, 17.8]]);
  await face('up');
  check((await prompt()).includes('Open barn'), 'barn prompt inside its pasture');
  await act();
  await page.waitForSelector('.livestock');
  check(await page.isDisabled('[data-buy-animal="chicken"]').catch(() => true), 'barn does not sell chickens');
  await page.click('[data-buy-animal="cow"]');
  await until('window.farmstead.state.animals.some((a) => a.species === "cow")');
  await shot('barn-panel');
  await page.keyboard.press('Escape');
  s = await state();
  check(s.animals.filter((a) => a.species === 'cow').length === 1 && s.quests.q_fresh_milk.progress[0] === 1, 'cow bought; "Fresh Milk" counts it');
  await shot('livestock-farm');

  // manual save, reload, continue
  await page.keyboard.press('Escape');
  await page.click('[data-action="save"]');
  await page.waitForTimeout(200);
  const before = await state();
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  const savedDay = Math.floor(before.time / 1440) + 1;
  check((await page.textContent('#save-info')).includes(`Day ${savedDay}`), `title shows the saved game (Day ${savedDay})`);
  await page.click('#btn-continue');
  await page.waitForTimeout(300);
  const after = await state();
  check(after.coins === before.coins, 'coins restored');
  check(JSON.stringify(after.inventory) === JSON.stringify(before.inventory), 'inventory restored');
  check(JSON.stringify(after.plots) === JSON.stringify(before.plots), 'plots restored');
  check(JSON.stringify(after.quests) === JSON.stringify(before.quests), 'quests restored');
  check(Math.abs(after.player.x - before.player.x) < 1, 'player position restored');
  check(JSON.stringify(after.buildings) === JSON.stringify(before.buildings), 'building levels restored');
  check(JSON.stringify(after.placed) === JSON.stringify(before.placed), 'placed buildings and shed contents restored');
  // identity and stored values exactly; happiness/progress keep ticking after Continue, so allow drift
  const fixed = (list) => JSON.stringify(list.map(({ uid, species, home, name, fedUntil, stock, petAt }) => ({ uid, species, home, name, fedUntil, stock, petAt })));
  const drift = after.animals.every((a, i) => Math.abs(a.happiness - before.animals[i].happiness) < 2 && Math.abs(a.progress - before.animals[i].progress) < 30);
  check(after.animals.length === 3 && fixed(after.animals) === fixed(before.animals) && drift, 'livestock restored (names, homes, feeding, products)');
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
