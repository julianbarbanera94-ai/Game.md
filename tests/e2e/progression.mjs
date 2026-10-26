// Phase 8: journal, side quests, achievements, levels, unlock announcements, north field, festivals, saving.
//   node tests/e2e/progression.mjs
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
const PORT = 9200 + Math.floor(Math.random() * 100);
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
  const shot = (name) => page.screenshot({ path: path.join(outDir, `progression-${name}.png`) });
  const toasts = () => page.$$eval('#toasts .toast', (t) => t.map((x) => x.textContent));
  const openJournal = async (tab) => {
    if (!(await page.isVisible('.journal'))) await page.click('#btn-journal');
    await page.waitForSelector('.journal');
    if (tab) await page.click(`[data-tab="${tab}"]`);
  };
  const closePanel = () => page.keyboard.press('Escape');

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-new');
  await page.waitForTimeout(300);
  await page.click('.modal button.primary');
  await page.waitForTimeout(300);

  // --- HUD shows the season
  check((await page.textContent('#clock-day')).includes('Spring'), `the clock names the season ("${await page.textContent('#clock-day')}")`);

  // --- journal tabs and filters
  await openJournal();
  check((await page.textContent('.jhead')).includes('Farm level 1'), 'journal header shows the farm level');
  check((await page.textContent('.jhead')).includes('Spring Festival in'), 'journal header announces the next festival');
  check(await page.isVisible('[data-quest-card="q_breaking_ground"]'), 'the first quest is listed as active');
  check((await page.textContent('[data-filter="available"]')).includes('(0)'), 'no optional quests offered yet');
  await page.click('[data-tab="achievements"]');
  check((await page.$$('[data-ach]')).length >= 10, 'achievements are listed');
  await page.click('[data-tab="progress"]');
  check(await page.isVisible('[data-unlock="crop_carrot"].open'), 'carrots show as unlocked');
  check(await page.isVisible('[data-unlock="land_north"].shut'), 'the north field shows as locked, with its requirement');
  check((await page.textContent('[data-unlock="land_north"]')).includes('North Field'), 'the lock explains what is needed');
  check((await page.textContent('[data-unlock="machinery"]')).toLowerCase().includes('later'), 'future content says so');
  await shot('journal-progress');
  await closePanel();

  // --- real farming drives quests, XP and achievements
  const result = await page.evaluate(async () => {
    const g = window.farmstead;
    const s = g.state;
    const F = await import('/src/systems/farming.js');
    const ids = ['starter_5_14', 'starter_6_14', 'starter_7_14'];
    s.inventory.seed_carrot = 30;
    s.can.water = s.can.capacity = 99;
    for (const id of ids) {
      F.interactPlot(s, id, g.bus); // till
      F.interactPlot(s, id, g.bus); // plant
      F.interactPlot(s, id, g.bus); // water
    }
    return ids.map((id) => s.plots[id].crop);
  });
  check(result.every((c) => c === 'carrot'), 'three plots tilled, planted and watered');
  let s = await state();
  check(s.quests.q_breaking_ground.status === 'complete', '"Breaking Ground" completed by real events');
  await page.waitForTimeout(900);
  check(s.counters.till === 3 && s.counters.plant === 3 && s.counters.water === 3, 'counters track every action');
  await page.click('[data-quest="q_breaking_ground"]');
  await page.waitForTimeout(400);
  s = await state();
  check(s.quests.q_breaking_ground.status === 'claimed' && s.xp === 30, 'claiming gives coins and 30 XP');
  check((await toasts()).some((t) => t.includes('XP')), 'the reward toast mentions XP');

  // grow and harvest
  await page.evaluate(async () => {
    const g = window.farmstead;
    const s = g.state;
    const F = await import('/src/systems/farming.js');
    for (const id of ['starter_5_14', 'starter_6_14', 'starter_7_14']) s.plots[id].growth = 9999;
    for (const id of ['starter_5_14', 'starter_6_14', 'starter_7_14']) F.interactPlot(s, id, g.bus); // harvest
  });
  await page.waitForTimeout(1200);
  s = await state();
  check(s.counters.harvest === 3, 'harvests are counted');
  check(s.achievements.first_harvest?.notified === true, '"First Fruits" is announced');
  check((await toasts()).some((t) => t.includes('Achievement')), 'achievement toast appears');
  await openJournal('achievements');
  await shot('journal-achievements');
  const coinsBefore = s.coins;
  await page.click('[data-claim-ach="first_harvest"]');
  await page.waitForTimeout(400);
  s = await state();
  const afterClaim = s.coins;
  check(s.achievements.first_harvest.claimed && afterClaim >= coinsBefore + 10, `achievement claimed for its reward (+${afterClaim - coinsBefore} incl. any level-up bonus)`);
  check((await page.$('[data-claim-ach="first_harvest"]')) === null, 'the claim button is gone after claiming');
  await page.evaluate(() => window.farmstead.claimAchievement('first_harvest'));
  s = await state();
  check(s.coins === afterClaim, 'a second claim pays nothing');
  await closePanel();

  // --- optional side quest through the journal
  await page.evaluate(async () => {
    const g = window.farmstead;
    const Q = await import('/src/systems/quests.js');
    Q.claim(g.state, 'q_first_harvest', g.bus);
  });
  await openJournal('quests');
  await page.click('[data-filter="available"]');
  check(await page.isVisible('[data-quest-card="sq_green_thumb"]'), 'an optional side quest is offered');
  await page.click('[data-accept-quest="sq_green_thumb"]');
  await page.waitForTimeout(300);
  s = await state();
  check(s.quests.sq_green_thumb.status === 'active', 'accepting starts it');
  await page.click('[data-filter="active"]');
  check(await page.isVisible('[data-abandon="sq_green_thumb"]'), 'it can be put down');
  await page.click('[data-abandon="sq_green_thumb"]');
  await page.waitForTimeout(300);
  s = await state();
  check(s.quests.sq_green_thumb.status === 'available', 'putting it down returns it to the available list');
  await page.click('[data-filter="available"]');
  await page.click('[data-accept-quest="sq_green_thumb"]');
  await closePanel();
  await page.evaluate(() => window.farmstead.bus.emit('harvest', { crop: 'carrot', qty: 15 }));
  await page.waitForTimeout(300);
  s = await state();
  check(s.quests.sq_green_thumb.status === 'complete', 'harvesting completes the side quest');
  await openJournal('quests');
  const xpBefore = s.xp;
  await page.click('[data-claim="sq_green_thumb"]');
  await page.waitForTimeout(300);
  s = await state();
  check(s.quests.sq_green_thumb.status === 'claimed' && s.xp === xpBefore + 20, 'claimed for coins and XP');
  await page.click('[data-filter="done"]');
  check(await page.isVisible('[data-quest-card="sq_green_thumb"]'), 'it moves to the Done list');
  await closePanel();

  // --- levels
  s = await state();
  check(s.xp >= 40, `experience adds up (${s.xp} XP)`);
  await page.evaluate(async () => { const P = await import('/src/systems/progress.js'); const g = window.farmstead; P.addXp(g.state, 120, g.bus); });
  await page.waitForTimeout(300);
  s = await state();
  check((await toasts()).some((t) => /Farm level \d/.test(t)), 'a level-up toast appears');
  await openJournal();
  check(/Farm level [2-9]/.test(await page.textContent('.jhead')), 'the journal shows the new level');
  await closePanel();

  // --- unlock announcement: carrot->potato appears when Market Day is claimed
  await page.evaluate(async () => {
    const g = window.farmstead;
    const Q = await import('/src/systems/quests.js');
    g.state.quests.q_market_day.status = 'complete';
    Q.claim(g.state, 'q_market_day', g.bus);
  });
  await page.waitForTimeout(1500);
  check((await toasts()).some((t) => t.includes('Unlocked: Potatoes and tomatoes')), 'new unlocks are announced');
  s = await state();
  check(s.seenUnlocks.includes('crop_potato'), 'and remembered, so they are announced once');

  // --- land: the north field
  await page.evaluate(() => { const st = window.farmstead.state; st.coins = 2000; st.player.x = 6.5 * 64; st.player.y = 9.4 * 64; st.player.facing = 'up'; });
  await page.waitForTimeout(400);
  let prompt = (await page.textContent('#prompt')).trim();
  check(prompt.includes('North Field') && prompt.includes('600'), `locked plots say what they need ("${prompt}")`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  check((await page.textContent('.modal')).includes('Expand your garden'), 'the panel explains the requirement (south bed first)');
  await closePanel();
  await page.evaluate(() => { window.farmstead.state.unlocks.gardenExpansion = true; });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  await page.click('[data-upgrade="northField"]');
  await page.waitForTimeout(400);
  s = await state();
  check(s.unlocks.northField && s.coins === 1400, 'bought for 600 coins');
  await closePanel();
  await page.waitForTimeout(500);
  prompt = (await page.textContent('#prompt')).trim();
  check(prompt.includes('Till soil'), `the new plots can be farmed ("${prompt}")`);
  await shot('north-field');

  // --- seasons and festivals (sleeping through the morning starts them)
  await page.evaluate(async () => {
    const g = window.farmstead;
    const { advanceTime } = await import('/src/systems/simulation.js');
    g.state.time = (11 - 1) * 1440 + 20 * 60; // evening of spring day 11
    advanceTime(g.state, 12 * 60, g.bus);
  });
  await page.waitForTimeout(1500);
  s = await state();
  check(s.quests.qe_spring_festival.status === 'active', 'the Spring Festival quest starts on the first festival morning');
  check((await toasts()).some((t) => t.includes('Spring Festival')), 'and the festival is announced');
  await openJournal('quests');
  check(await page.isVisible('[data-quest-card="qe_spring_festival"]'), 'the seasonal quest is in the journal');
  check((await page.textContent('.jhead')).includes('Spring Festival is on'), 'the journal says the festival is on');
  await shot('journal-festival');
  await closePanel();
  await page.evaluate(async () => {
    const g = window.farmstead;
    const { advanceTime } = await import('/src/systems/simulation.js');
    g.state.time = (14 - 1) * 1440 + 20 * 60;
    advanceTime(g.state, 12 * 60, g.bus);
  });
  s = await state();
  check(s.quests.qe_spring_festival.status === 'locked', 'an unfinished festival quest lapses when the festival ends');

  // --- everything persists
  await page.evaluate(() => window.farmstead.manualSave());
  await page.waitForTimeout(300);
  const saved = await state();
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');
  await page.click('#btn-continue');
  await page.waitForTimeout(800);
  s = await state();
  check(s.version === 6 && s.xp === saved.xp, 'experience survives a reload');
  check(JSON.stringify(s.counters) === JSON.stringify(saved.counters), 'counters survive');
  check(s.achievements.first_harvest.claimed === true, 'claimed achievements stay claimed');
  check(s.unlocks.northField === true, 'the north field stays unlocked');
  check(JSON.stringify(s.seenUnlocks.slice().sort()) === JSON.stringify(saved.seenUnlocks.slice().sort()), 'announced unlocks are not announced again');
  check(s.quests.sq_green_thumb.status === 'claimed', 'claimed quests stay claimed');
  await page.waitForTimeout(1500);
  check(!(await toasts()).some((t) => t.startsWith('Unlocked')), 'loading announces nothing old');
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log(`\nProgression: ${n} checks passed.`);
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
