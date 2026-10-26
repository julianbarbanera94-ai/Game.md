// Phase 7: the road, the village, villagers, requests, shops, schedules, persistence.
//   node tests/e2e/village.mjs
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
const PORT = 9100 + Math.floor(Math.random() * 100);
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.farmstead.state)));
  const prompt = async () => (await page.textContent('#prompt')).trim();
  const shot = (name) => page.screenshot({ path: path.join(outDir, `village-${name}.png`) });
  const teleport = (x, y, facing = 'down') => page.evaluate(([px, py, f]) => {
    const s = window.farmstead.state;
    s.player.x = px * 64; s.player.y = py * 64; s.player.facing = f;
  }, [x, y, facing]);
  const setTime = (hour) => page.evaluate((h) => { const s = window.farmstead.state; s.time = Math.floor(s.time / 1440) * 1440 + h * 60; }, hour);
  const act = async () => { await page.keyboard.press('KeyE'); await page.waitForTimeout(500); };
  const npcPos = (id) => page.evaluate((i) => { const a = window.farmstead.npcs.get(i); return a ? { x: a.x / 64, y: a.y / 64 } : null; }, id);
  const stand = async (id) => {
    await page.waitForFunction((i) => !!window.farmstead.npcs.get(i), id, { timeout: 4000 });
    const p = await npcPos(id);
    await teleport(p.x, p.y + 0.55, 'up');
    await page.waitForTimeout(300);
  };

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('.modal button.primary');
  await page.waitForTimeout(200);

  // --- the road is shut until the fallen tree is cleared
  await page.evaluate(() => { const s = window.farmstead.state; s.coins = 900; s.time = 10 * 60; });
  await teleport(33.0, 11.8, 'right');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowRight');
  let s = await state();
  check(s.player.x / 64 < 34.2, `the fallen tree blocks the road (stopped at x=${(s.player.x / 64).toFixed(1)})`);
  check((await prompt()).includes('fallen tree'), 'the tree can be inspected');
  await act();
  check((await page.textContent('.modal')).includes('Market Day') === false && (await page.textContent('.modal')).toLowerCase().includes('farm going'), 'before "Market Day" a crew is not available yet');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const g = window.farmstead; g.state.quests.q_market_day.status = 'claimed'; g.state.quests.q_open_road.status = 'active'; });
  await act();
  check((await page.textContent('.modal')).includes('Open the road (150 coins)'), 'once available, the crew offers to clear it for 150 coins');
  await page.click('.modal button.primary');
  await page.waitForTimeout(400);
  s = await state();
  check(s.flags.roadOpen && s.coins === 750, 'road opened for 150 coins');
  check(s.quests.q_open_road.status === 'complete', '"The Road East" quest completes from the real event');

  // --- walk through the gap into the village
  await teleport(32.8, 11.6, 'right');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2400);
  await page.keyboard.up('ArrowRight');
  s = await state();
  check(s.player.x / 64 > 38.5, `walked east through the old roadblock (x=${(s.player.x / 64).toFixed(1)})`);
  check(s.flags.visitedVillage, 'arriving in the village is detected');
  await page.evaluate(() => window.farmstead.state.quests.q_open_road.status === 'complete' && window.farmstead.state.quests.q_visit_village);
  s = await state();
  check(s.quests.q_visit_village.status === 'active' || s.quests.q_visit_village.status === 'locked', 'visit quest follows the road quest');

  // --- villagers at midday
  await setTime(12);
  await page.waitForTimeout(500);
  const present = await page.evaluate(() => window.farmstead.npcs.list().map((a) => a.id).sort());
  check(present.join() === 'bram,mara,odette,tobias,wren', `all five villagers are out at noon (${present.join(', ')})`);
  await teleport(48.8, 12.6, 'up');
  await page.waitForTimeout(600);
  await shot('square');

  // --- talk to Mara: dialogue, friendship, quest
  await page.evaluate(() => { const q = window.farmstead.state.quests; q.q_open_road.status = 'claimed'; q.q_visit_village.status = 'claimed'; q.q_meet_mara.status = 'active'; });
  await stand('mara');
  check((await prompt()).includes('Talk to Mara'), `prompt names the villager ("${await prompt()}")`);
  await act();
  check(await page.isVisible('.talk'), 'dialogue panel opens');
  await shot('dialogue');
  s = await state();
  check(s.relations.mara.points === 3, 'friendship +3 for the first chat of the day');
  check(s.quests.q_meet_mara.status === 'complete', '"Meet the Shopkeeper" completes from talking');
  const choices = await page.$$eval('[data-choice]', (b) => b.map((x) => x.textContent));
  check(choices.length >= 4 && choices[0].startsWith('1.'), `numbered choices (${choices.join(' | ')})`);

  // keyboard: number key 1 opens the store
  await page.keyboard.press('1');
  await page.waitForTimeout(500);
  check((await page.textContent('.modal')).includes('General Store'), 'pressing 1 opens the General Store');
  const before = await state();
  await page.click('[data-store-buy="seed_carrot"]');
  await page.waitForTimeout(450);
  s = await state();
  check(s.inventory.seed_carrot === (before.inventory.seed_carrot || 0) + 1 && s.coins < before.coins, 'bought a seed packet with coins');
  check(s.shops.bought.seed_carrot === 1, "today's stock is tracked");
  await page.click('[data-store-buy="seed_carrot"]');
  await page.click('[data-store-buy="seed_carrot"]');
  await page.waitForTimeout(450);
  s = await state();
  check((s.inventory.seed_carrot - (before.inventory.seed_carrot || 0)) <= 2, 'rapid double taps cannot double-buy');
  await page.keyboard.press('Escape');

  // second chat the same day gives no more friendship
  await act();
  s = await state();
  check(s.relations.mara.points === 3, 'friendship is once per day');
  await page.keyboard.press('Escape');

  await page.evaluate(async () => { const Q = await import('/src/systems/quests.js'); const g = window.farmstead; Q.claim(g.state, 'q_meet_mara', g.bus); });
  s = await state();
  check(s.quests.q_meet_mara.status === 'claimed' && s.quests.q_first_delivery.status === 'active', 'claiming unlocks "Special Delivery"');

  // --- notice board: accept a request, deliver it to its giver
  await teleport(46.4, 11.2, 'up');
  await page.waitForTimeout(300);
  check((await prompt()).includes('notice board'), 'notice board prompt');
  await act();
  check(await page.isVisible('.board'), 'notice board opens');
  const offerId = await page.$eval('[data-accept]', (b) => b.dataset.accept);
  await shot('board');
  await page.click(`[data-accept="${offerId}"]`);
  await page.waitForTimeout(450);
  s = await state();
  const order = s.orders.list.find((o) => o.id === offerId);
  check(order.status === 'accepted', `accepted request ${order.qty} × ${order.item} for ${NAMES[order.giver]}`);
  await page.keyboard.press('Escape');

  // not enough goods: handing over is refused, nothing changes
  await setTime(12);
  await stand(order.giver);
  const coinsBefore = (await state()).coins;
  await act();
  check((await page.$$('[data-choice]')).length > 0, 'giver dialogue opens');
  check(!(await page.textContent('.talk')).includes('Hand over'), 'no "Hand over" choice without the goods');
  await page.keyboard.press('Escape');
  await page.evaluate((o) => { window.farmstead.state.inventory[o.item] = o.qty + 2; }, order);
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.farmstead.npcMarker?.('mara') !== undefined)), 'quest markers are computed');
  await act();
  const handover = await page.$('[data-choice]:has-text("Hand over")');
  check(!!handover, 'with the goods, a "Hand over" choice appears');
  await handover.click();
  await page.waitForTimeout(500);
  s = await state();
  check(s.coins === coinsBefore + order.coins && s.inventory[order.item] === 2, `delivery paid ${order.coins} coins and took ${order.qty}`);
  check(s.orders.list.find((o) => o.id === offerId).status === 'done', 'request marked done');
  check(s.relations[order.giver].points >= 3 + order.rep, 'friendship rewarded');
  check(s.quests.q_first_delivery.status === 'complete', '"Special Delivery" completes from a real delivery');
  await page.keyboard.press('Escape');

  // --- trader: premium prices, daily demand
  await page.evaluate(() => { window.farmstead.state.inventory.carrot = 12; });
  await stand('tobias');
  check((await prompt()).includes('Tobias'), 'trader prompt');
  await act();
  await page.click('[data-choice]:has-text("goods to sell")');
  await page.waitForTimeout(500);
  const coins0 = (await state()).coins;
  await page.click('[data-trade-all="carrot"]');
  await page.waitForTimeout(450);
  s = await state();
  check(!s.inventory.carrot && s.coins > coins0 + 12 * 1, `Tobias bought all the carrots (+${s.coins - coins0})`);
  check(s.shops.traded.carrot === 12, "today's demand is tracked");
  await page.keyboard.press('Escape');

  // --- night: villagers go home and doors show "closed"
  await setTime(23);
  await page.waitForTimeout(500);
  check((await page.evaluate(() => window.farmstead.npcs.list().length)) === 0, 'nobody is out at 11 PM');
  await teleport(43.4, 9.1, 'up');
  await page.waitForTimeout(300);
  check(/closed/i.test(await prompt()), `the General Store door says it is closed ("${await prompt()}")`);
  await shot('night');

  // --- saving keeps everything
  await setTime(12);
  await page.evaluate(() => window.farmstead.manualSave());
  await page.waitForTimeout(300);
  const saved = await state();
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-continue');
  await page.waitForTimeout(700);
  s = await state();
  check(s.flags.roadOpen && s.flags.visitedVillage, 'road and visit flags survive a reload');
  check(JSON.stringify(s.relations) === JSON.stringify(saved.relations), 'friendships survive a reload');
  check(JSON.stringify(s.orders) === JSON.stringify(saved.orders), 'requests survive a reload');
  check(s.player.x / 64 > 38, 'still standing in the village');
  const wall = await page.evaluate(() => window.farmstead.world.roadBlock.open);
  check(wall === true, 'the cleared road stays open after loading');
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log(`\nVillage: ${n} checks passed.`);
}

const NAMES = { mara: 'Mara', bram: 'Bram', odette: 'Odette', tobias: 'Tobias', wren: 'Wren' };

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.kill();
  });
