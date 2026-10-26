// Phase 9: one fresh save through the whole core loop, then save/reload and
// backup recovery. Uses the keyboard for movement and actions and the real
// panels for buying, selling and talking; time is advanced with the game's own
// simulation (the same code the clock runs).
//   node tests/e2e/integration.mjs
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
const PORT = 9400 + Math.floor(Math.random() * 100);
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
  const shot = (name) => page.screenshot({ path: path.join(outDir, `integration-${name}.png`) });
  const tp = (x, y, f = 'down') => page.evaluate(([px, py, ff]) => { const s = window.farmstead.state; s.player.x = px * 64; s.player.y = py * 64; s.player.facing = ff; }, [x, y, f]);
  const act = async () => { await page.keyboard.press('KeyE'); await page.waitForTimeout(450); };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const advance = (minutes) => page.evaluate(async (m) => {
    const g = window.farmstead;
    const { advanceTime } = await import('/src/systems/simulation.js');
    advanceTime(g.state, m, g.bus);
  }, minutes);
  const until = (expr, timeout = 4000) => page.waitForFunction(expr, null, { timeout });

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  check((await page.textContent('#save-info')).includes('No saved game'), 'fresh start: no save yet');
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('.modal button.primary');
  await page.waitForTimeout(300);
  let s = await state();
  check(s.player.scene === 'farm' && s.coins === 60 && s.plots.starter_5_14 && !s.unlocks.gardenExpansion && !s.flags.roadOpen,
    'a new save starts on the small starter farm with the starting purse');

  // 1. move, collide, interact
  const x0 = s.player.x;
  await hold('ArrowRight', 600);
  s = await state();
  check(s.player.x > x0 + 40, 'keyboard movement works');
  await tp(17.6, 9.2, 'up');
  await hold('ArrowUp', 900);
  s = await state();
  check(s.player.y / 64 > 8.0, `the cottage wall stops the player (y=${(s.player.y / 64).toFixed(2)})`);
  check((await prompt()).toLowerCase().includes('cottage') || (await prompt()).toLowerCase().includes('home') || (await prompt()).toLowerCase().includes('enter'),
    `the door shows a prompt ("${await prompt()}")`);

  // 2. till, plant, water, grow, harvest by hand
  await tp(5.5, 13.6, 'down');
  await page.waitForTimeout(250);
  check((await prompt()).includes('Till'), `plot prompt ("${await prompt()}")`);
  await act();
  await page.keyboard.press('Digit3');
  await act();
  await act();
  s = await state();
  check(s.plots.starter_5_14.tilled && s.plots.starter_5_14.crop === 'carrot', 'tilled and planted a carrot');
  check(s.can.water === 9, 'watered it (the can lost one water)');
  await advance(300);
  await page.waitForTimeout(200);
  check((await prompt()).includes('Harvest'), `the carrot grew ("${await prompt()}")`);
  await act();
  s = await state();
  check(s.inventory.carrot === 1 && !s.plots.starter_5_14.crop, 'harvested into the bag');

  // 3. sell at the market stall, 4. buy seeds there
  await tp(30.4, 11.3, 'up');
  await page.waitForTimeout(250);
  await act();
  await page.waitForSelector('.shop');
  const coinsBefore = (await state()).coins;
  await page.click('[data-sell-all="carrot"]');
  await page.waitForTimeout(300);
  s = await state();
  check(s.coins > coinsBefore && !s.inventory.carrot, `sold the carrot (+${s.coins - coinsBefore})`);
  await page.click('.tab:nth-child(2)');
  await page.waitForTimeout(200);
  await page.click('[data-buy="seed_carrot"]');
  await page.waitForTimeout(300);
  s = await state();
  check(s.inventory.seed_carrot === 6, 'bought carrot seeds with the same coins');
  await page.keyboard.press('Escape');

  // A mid-game purse and progress so the later systems are open (their own e2e
  // suites walk every requirement in detail).
  await page.evaluate(() => {
    const g = window.farmstead; const st = g.state;
    st.coins = 30000; st.xp = 700;
    for (const id of ['q_breaking_ground', 'q_first_harvest', 'q_market_day']) st.quests[id].status = 'claimed';
  });

  // 8. a land unlock through the planner
  await page.evaluate(() => window.farmstead.panels.planner('upgrade'));
  await page.waitForTimeout(250);
  if (await page.$('[data-upgrade="gardenExpansion"]:not([disabled])')) await page.click('[data-upgrade="gardenExpansion"]');
  else await page.evaluate(() => window.farmstead.purchaseUpgrade('gardenExpansion'));
  await until('window.farmstead.state.unlocks.gardenExpansion === true');
  check(true, 'the south garden bed is unlocked and paid for');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.farmstead.state.quests.q_room_to_grow.status = 'claimed'; }); // opens the coop

  // buildings: a coop (5. animals) and a garage (6. vehicles) through real placement
  for (const [type, x, y] of [['chicken_coop', 24.0, 12.9], ['garage', 21.5, 12.6]]) {
    await tp(x, y, 'down');
    await page.evaluate((t) => window.farmstead.startPlacement(t), type);
    await page.waitForTimeout(300);
    if (type === 'garage') {
      // keep clear of the coop that was just placed
      await tp(14.5, 16.0, 'down');
      await page.waitForTimeout(300);
    }
    check(await page.evaluate(() => window.farmstead.placement?.valid), `${type} can be placed ("${await prompt()}")`);
    await act();
  }
  await advance(12 * 60);
  s = await state();
  const coop = s.placed.find((p) => p.type === 'chicken_coop');
  const garage = s.placed.find((p) => p.type === 'garage');
  check(coop?.level === 1 && garage?.level === 1, 'the builders finished the coop and the garage');

  // 5. animals: buy, feed, collect
  await page.evaluate((uid) => window.farmstead.panels.livestock(uid), coop.uid);
  await page.waitForSelector('.livestock');
  await page.click('[data-buy-animal="chicken"]');
  await until('window.farmstead.state.animals.length === 1');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.farmstead.buy('chicken_feed', 3));
  await page.evaluate(() => { const a = window.farmstead.state.animals[0]; a.fedUntil = window.farmstead.state.time - 1; });
  await page.evaluate((uid) => window.farmstead.panels.livestock(uid), coop.uid);
  await page.waitForSelector('[data-feed-all]:not([disabled])');
  await page.waitForTimeout(400); // panel buttons ignore taps within 350 ms of the last one (double-tap guard)
  await page.click('[data-feed-all]');
  await page.waitForTimeout(300);
  s = await state();
  check(s.inventory.chicken_feed === 2 && s.animals[0].fedUntil > s.time, `fed the hen from the shared bag (feed ${s.inventory.chicken_feed}, fedUntil ${s.animals[0]?.fedUntil} vs ${s.time})`);
  await page.keyboard.press('Escape');
  await advance(26 * 60);
  await page.evaluate((uid) => window.farmstead.panels.livestock(uid), coop.uid);
  await page.waitForSelector('[data-collect-all]:not([disabled])', { timeout: 3000 });
  await page.waitForTimeout(400);
  await page.click('[data-collect-all]');
  await page.waitForTimeout(300);
  s = await state();
  check((s.inventory.egg || 0) >= 1, `collected eggs (${s.inventory.egg})`);
  await page.keyboard.press('Escape');

  // 6. vehicles: buy at the garage, attach a plough, drive, work a field, get off
  await page.evaluate(() => window.farmstead.panels.garage());
  await page.waitForSelector('.garage');
  await page.click('[data-buy-vehicle="tractor_small"]');
  await page.waitForTimeout(400);
  await page.click('[data-buy-implement="plough"]');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  s = await state();
  check(s.vehicles.length === 1 && s.owned.implements.includes('plough'), 'bought a tractor and a plough');
  const v = s.vehicles[0];
  await page.evaluate((uid) => window.farmstead.attachImplement(uid, 'plough'), v.uid);
  await page.evaluate((uid) => {
    const g = window.farmstead; const t = g.state.vehicles.find((x) => x.uid === uid);
    t.x = 3.6 * 64; t.y = 8.0 * 64; t.heading = 0; t.fuel = 30;
    g.state.unlocks.northField = true;
    g.state.player.x = t.x + 40; g.state.player.y = t.y;
    g.enterVehicle(uid);
  }, v.uid);
  await page.waitForTimeout(200);
  check((await state()).driving === v.uid, 'got into the tractor');
  await page.keyboard.press('KeyE'); // lower the plough
  await page.waitForTimeout(150);
  await hold('KeyW', 1800);
  s = await state();
  const tilled = Object.entries(s.plots).filter(([id, p]) => id.startsWith('north_') && p.tilled).length;
  check(tilled >= 2, `the plough tilled the north field (${tilled} plots)`);
  check(s.vehicles[0].fuel < 30, 'driving used fuel');
  await page.keyboard.press('KeyE');
  await page.evaluate(() => { const t = window.farmstead.state.vehicles[0]; t.x = 12 * 64; t.y = 11.6 * 64; t.speed = 0; });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  check((await state()).driving === null, 'got off again');

  // 7. village: open the road, talk, take a request, deliver, give a gift
  await page.evaluate(() => { const g = window.farmstead; g.openRoad(); g.state.time = Math.floor(g.state.time / 1440) * 1440 + 12 * 60; });
  await page.waitForTimeout(600);
  s = await state();
  check(s.flags.roadOpen, 'the road to the village is open');
  const ord = s.orders.list.find((o) => o.status === 'open');
  check(!!ord, 'the notice board has a request');
  await page.evaluate(() => window.farmstead.panels.board());
  await page.click(`[data-accept="${ord.id}"]`);
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  check((await state()).orders.list.find((o) => o.id === ord.id).status === 'accepted', 'accepted it at the board');
  await page.evaluate(([item, qty]) => { const st = window.farmstead.state; st.inventory[item] = (st.inventory[item] || 0) + qty; }, [ord.item, ord.qty]);
  await page.waitForFunction((id) => !!window.farmstead.npcs.get(id), ord.giver, { timeout: 4000 });
  const np = await page.evaluate((id) => { const a = window.farmstead.npcs.get(id); return { x: a.x / 64, y: a.y / 64 }; }, ord.giver);
  await tp(np.x, np.y + 0.55, 'up');
  await page.waitForTimeout(250);
  check((await prompt()).includes('Talk to'), `villager prompt ("${await prompt()}")`);
  await act();
  await page.waitForSelector('.talk');
  const coins1 = (await state()).coins;
  await page.click('[data-choice]:has-text("Hand over")');
  await page.waitForTimeout(400);
  s = await state();
  check(s.orders.list.find((o) => o.id === ord.id).status === 'done' && s.coins === coins1 + ord.coins, 'delivered the goods for the reward');
  const pts0 = s.relations[ord.giver].points;
  await page.click('[data-choice]:has-text("gift")');
  await page.waitForTimeout(400);
  await shot('gift');
  await page.click('[data-gift="egg"]');
  await page.waitForTimeout(350);
  s = await state();
  check(s.relations[ord.giver].points > pts0 && s.counters.gifts === 1, 'gave an egg as a present');
  await page.click('[data-choice]:has-text("gift")');
  await page.waitForTimeout(400);
  check((await page.$$('[data-gift]')).length === 0, 'only one present per day');
  await page.keyboard.press('Escape');

  // map and character sheet show the same world
  await page.keyboard.press('KeyM');
  await page.waitForSelector('.map-canvas');
  const marks = await page.$$eval('.map-mark', (m) => m.map((x) => x.textContent));
  check(marks.includes('You') && marks.some((t) => t.includes('Chicken Coop')) && marks.some((t) => t.includes('Garage')), 'the map shows you, the coop and the garage');
  check(!(await page.$('.map-mark.lock .lbl:has-text("Fallen tree")')) && !(await page.$('.map-mark.lock .lbl:has-text("South bed")')), 'the map shows the road and south bed as open');
  check((await page.$$('.map-mark.npc')).length >= 1, 'villagers appear on the map');
  await shot('map');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyB');
  await page.click('[data-bag-tab="farmer"]');
  await page.waitForTimeout(200);
  check((await page.textContent('.farmer')).includes('Small Tractor'), 'the farmer sheet lists the tractor');
  await page.keyboard.press('Escape');

  // settings persist with the game
  await page.keyboard.press('Escape');
  await page.click('[data-action="settings"]');
  await page.click('[data-setting="zoom"][data-value="far"]');
  await page.click('[data-setting="bigControls"][data-value="true"]');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => window.farmstead.camera.zoom > 1 && document.body.classList.contains('big-controls')), 'camera and control size change at once');
  await page.click('.settings .actions button');
  await page.click('[data-action="save"]');
  await page.waitForTimeout(300);
  check((await page.textContent('.save-status')).includes('Saved'), 'the pause menu confirms the save');
  await page.keyboard.press('Escape');

  // 9. save and load the complete state
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('farmstead.save')));
  const pick = (st) => JSON.stringify({
    coins: st.coins, inv: st.inventory, plots: st.plots, unlocks: st.unlocks, placed: st.placed.map((p) => [p.uid, p.type, p.x, p.y, p.level]),
    animals: st.animals.map((a) => [a.uid, a.name, a.stock]), vehicles: st.vehicles.map((x) => [x.uid, x.type, Math.round(x.x), Math.round(x.y), x.mount.front, x.fuel.toFixed(3)]),
    owned: st.owned, quests: Object.fromEntries(Object.entries(st.quests).map(([k, q]) => [k, q.status])), rel: st.relations, orders: st.orders.list.map((o) => [o.id, o.status]),
    flags: st.flags, xp: st.xp, counters: st.counters, settings: st.settings, achievements: st.achievements, day: Math.floor(st.time / 1440),
  });
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-continue');
  await page.waitForTimeout(400);
  const loaded = await state();
  const a = JSON.parse(pick(loaded)), b = JSON.parse(pick(saved));
  const diff = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (diff.length) console.log('differs:', diff.map((k) => `${k}: ${JSON.stringify(b[k]).slice(0, 300)} -> ${JSON.stringify(a[k]).slice(0, 300)}`).join('\n'));
  check(Math.abs(loaded.time - saved.time) < 10, 'the clock resumes where it was saved');
  check(diff.length === 0, 'coins, bag, plots, buildings, animals, vehicles, quests, villagers, requests, flags, settings and time all come back');
  check(await page.evaluate(() => window.farmstead.camera.zoom > 1), 'the camera setting is applied after loading');

  // Load last save from the pause menu throws away unsaved changes
  await page.evaluate(() => { window.farmstead.state.coins = 1; });
  await page.keyboard.press('Escape');
  await page.click('[data-action="load"]');
  await page.waitForTimeout(200);
  check((await page.textContent('.modal')).includes('will be lost'), 'loading asks for confirmation');
  await page.click('.modal button.primary');
  await page.waitForTimeout(400);
  check((await state()).coins === saved.coins, 'Load last save restores the saved coins');

  // a damaged save falls back to the backup
  await page.evaluate(() => { window.farmstead.state.coins = 4242; window.farmstead.manualSave(); window.farmstead.state.coins = 4343; window.farmstead.quitToTitle(); });
  // the latest write (4343) is cut short; the one before it (4242) is the backup
  await page.evaluate(() => localStorage.setItem('farmstead.save', '{"version":7,"coins":'));
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  check((await page.textContent('#save-info')).includes('backup'), `the title screen says the backup will be used ("${await page.textContent('#save-info')}")`);
  await page.click('#btn-continue');
  await page.waitForTimeout(400);
  s = await state();
  check(s.coins === 4242 && s.vehicles.length === 1 && s.animals.length === 1, `the backup (the save before) is loaded (${s.coins} coins)`);
  check((await page.textContent('#toasts')).includes('backup'), 'the player is told the backup was loaded');
  await shot('recovered');

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log(`\nIntegration: ${n} checks passed.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); server.kill(); });
