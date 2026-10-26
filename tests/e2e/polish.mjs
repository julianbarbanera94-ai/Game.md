// Phase 10: audio channels and cues, weather, running, gamepad, vibration,
// effects, the carry pose and the launch art, in the running game.
//   node tests/e2e/polish.mjs
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
const PORT = 9500 + Math.floor(Math.random() * 100);
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
  browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // a fake standard-mapping gamepad the test can press
  await ctx.addInitScript(() => {
    const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    window.__padOn = false;
    navigator.getGamepads = () => (window.__padOn ? [pad] : []);
    window.__buzz = [];
    window.AndroidHaptics = { vibrate: (ms) => window.__buzz.push(ms) };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.farmstead.state)));
  const shot = (name) => page.screenshot({ path: path.join(outDir, `polish-${name}.png`) });
  const tp = (x, y, f = 'down') => page.evaluate(([px, py, ff]) => { const s = window.farmstead.state; s.player.x = px * 64; s.player.y = py * 64; s.player.facing = ff; }, [x, y, f]);
  const pad = async (button, ms = 120) => {
    await page.evaluate((b) => { window.__padOn = true; window.__pad.buttons[b].pressed = true; }, button);
    await page.waitForTimeout(ms);
    await page.evaluate((b) => { window.__pad.buttons[b].pressed = false; }, button);
    await page.waitForTimeout(120);
  };
  const advance = (minutes) => page.evaluate(async (m) => {
    const g = window.farmstead;
    const { advanceTime } = await import('/src/systems/simulation.js');
    advanceTime(g.state, m, g.bus);
  }, minutes);

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#title:not([hidden])');

  // --- launch art
  check(await page.evaluate(() => { const i = document.querySelector('.title-card .logo'); return i.complete && i.naturalWidth >= 700; }), 'the title shows the painted logo');
  check(await page.evaluate(() => !!document.querySelector('link[rel="icon"]') && getComputedStyle(document.getElementById('loading')).backgroundImage.includes('loading_bg')), 'favicon and loading backdrop are set');

  // --- gamepad on the title screen: A focuses, A again presses New game
  await page.evaluate(() => { window.__padOn = true; });
  await pad(13); // d-pad down
  await pad(0);
  await page.waitForTimeout(150);
  const onTitle = await page.evaluate(() => document.activeElement?.id);
  if (onTitle !== 'btn-new') { await pad(13); }
  await pad(0);
  await page.waitForTimeout(400);
  check(await page.evaluate(() => window.farmstead.running), 'gamepad: d-pad + A start a new game from the title');
  await pad(0); // close the intro (A on its only button)
  await page.waitForTimeout(300);
  if (await page.$('.modal')) await pad(1);
  check(!(await page.$('.modal')), 'gamepad: the intro closes');
  // a spare A press may have opened the cottage door: step back outside
  await page.evaluate(() => { const g = window.farmstead; if (g.interior) g.leaveInterior(); });
  await page.waitForTimeout(800);

  // --- audio channels follow where you are
  await page.evaluate(() => window.farmstead.sfx.unlock());
  await page.waitForFunction(() => window.farmstead.sfx.buffers.size >= 20, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  let audio = await page.evaluate(() => { const s = window.farmstead.sfx; return { music: s.tracks.music?.name, amb: s.tracks.ambience?.name, want: s.want, n: s.buffers.size, scene: window.farmstead.state.player.scene, t: window.farmstead.state.time }; });
  check(audio.n >= 20 && audio.music === 'music_farm' && audio.amb === 'ambience_farm', `farm music and birdsong play (${JSON.stringify(audio)})`);
  await page.evaluate(() => { const g = window.farmstead; g.state.flags.roadOpen = true; g.applyWorldFlags(); });
  await tp(48, 12.6);
  await page.waitForTimeout(400);
  check((await page.evaluate(() => window.farmstead.sfx.tracks.music?.name)) === 'music_village', 'the village has its own tune');
  await tp(17.6, 9.4);
  await page.waitForTimeout(300);

  // volume channels and mute reach the mixer
  await page.keyboard.press('Escape');
  await page.click('[data-action="settings"]');
  await page.$eval('[data-setting="music"]', (el) => { el.value = '20'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await page.$eval('[data-setting="ambience"]', (el) => { el.value = '0'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(400);
  const mix = await page.evaluate(() => { const b = window.farmstead.sfx.bus; return { music: b.music.gain.value, amb: b.ambience.gain.value, sfx: b.sfx.gain.value }; });
  check(Math.abs(mix.music - 0.2) < 0.03 && mix.amb < 0.03 && mix.sfx > 0.4, `music, ambience and effects have separate volumes (${JSON.stringify(mix)})`);
  await page.click('[data-setting="muted"][data-value="true"]');
  await page.waitForTimeout(400);
  check((await page.evaluate(() => window.farmstead.sfx.bus.master.gain.value)) < 0.02, 'Sound off mutes everything');
  await page.click('[data-setting="muted"][data-value="false"]');
  await page.click('[data-setting="vibration"][data-value="false"]');
  await page.keyboard.press('Escape');
  check((await state()).settings.music === 0.2 && (await state()).settings.vibration === false, 'audio and vibration settings are in the save');

  // --- vibration only when switched on
  await page.evaluate(() => window.farmstead.bus.emit('levelUp', { level: 2, coins: 0 }));
  check((await page.evaluate(() => window.__buzz.length)) === 0, 'no vibration while it is switched off');
  await page.evaluate(() => window.farmstead.changeSetting('vibration', true));
  await page.evaluate(() => window.farmstead.bus.emit('levelUp', { level: 2, coins: 0 }));
  check((await page.evaluate(() => window.__buzz.length)) === 1, 'level-up buzzes the phone (native bridge)');
  check(await page.evaluate(() => (window.farmstead.effects.rings || []).length > 0 && window.farmstead.sfx.played.includes('levelup')), 'level-up: ring, stars and fanfare');
  await shot('levelup');

  // --- running
  await tp(17.6, 11.6, 'right');
  let x0 = (await state()).player.x;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  const walk = (await state()).player.x - x0;
  await tp(17.6, 11.6, 'right');
  x0 = (await state()).player.x;
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ShiftLeft');
  const run = (await state()).player.x - x0;
  check(run > walk * 1.3, `Shift runs (${Math.round(walk)} px walking vs ${Math.round(run)} px running)`);

  // --- gamepad in the world: stick moves, Start opens the menu, B closes, RB cycles the hotbar
  await tp(17.6, 11.6, 'right');
  x0 = (await state()).player.x;
  await page.evaluate(() => { window.__pad.axes[0] = 1; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__pad.axes[0] = 0; });
  check((await state()).player.x > x0 + 50, 'gamepad stick moves the farmer');
  const tool0 = await page.evaluate(() => window.farmstead.activeTool);
  await pad(5);
  check((await page.evaluate(() => window.farmstead.activeTool)) !== tool0, 'RB picks the next hotbar slot');
  await pad(9);
  check(!!(await page.$('.modal')), 'Start opens the pause menu');
  await pad(13);
  await pad(13);
  check(await page.evaluate(() => document.activeElement?.tagName === 'BUTTON' && document.body.classList.contains('pad-nav')), 'the d-pad moves a visible focus through the menu');
  await shot('pad-menu');
  await pad(1);
  check(!(await page.$('.modal')), 'B closes the menu');

  // --- rain: a rainy day waters planted crops by itself
  const rainyDay = await page.evaluate(async () => {
    const { weatherOn } = await import('/src/systems/weather.js');
    for (let d = 3; d < 60; d++) if (weatherOn((d - 1) * 1440 + 600) === 'rain') return d;
    return null;
  });
  check(rainyDay != null, `rainy days happen (first on day ${rainyDay})`);
  await page.evaluate((d) => {
    const s = window.farmstead.state;
    s.time = (d - 2) * 1440 + 20 * 60; // the evening before
    Object.assign(s.plots.starter_5_14, { tilled: true, crop: 'carrot', growth: 0, moistUntil: 0 });
  }, rainyDay);
  await advance(11 * 60); // through the night into the rainy morning
  let s = await state();
  check(s.plots.starter_5_14.moistUntil > s.time, 'the rain watered the carrot');
  await tp(6.5, 13.8);
  await page.waitForTimeout(600);
  check((await page.evaluate(() => window.farmstead.sfx.tracks.ambience?.name)) === 'ambience_rain', 'rain sounds replace birdsong');
  check((await page.textContent('#hud')).includes('Rain'), 'the clock says it is raining');
  await shot('rain');

  // --- construction finishing: hammering, dust and sparkle
  await page.evaluate(() => {
    const s = window.farmstead.state;
    s.coins = 20000; s.xp = 700; s.quests.q_room_to_grow.status = 'claimed';
    s.time = Math.floor(s.time / 1440) * 1440 + 10 * 60;
  });
  await tp(24.0, 12.9);
  await page.evaluate(() => window.farmstead.startPlacement('chicken_coop'));
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.farmstead.sfx.played.includes('build')), `starting construction hammers (${await page.evaluate(() => JSON.stringify({ pl: window.farmstead.placement, placed: window.farmstead.state.placed.length, played: window.farmstead.sfx.played.slice(-6), prompt: document.querySelector('#prompt').textContent }))})`);
  await advance(9 * 60);
  await page.waitForTimeout(100);
  check(await page.evaluate(() => window.farmstead.effects.particles.length > 20), 'a finished building raises dust and sparkles');

  // --- animals: voices, carry pose, hearts
  s = await state();
  const coop = s.placed.find((p) => p.type === 'chicken_coop');
  await page.evaluate((uid) => window.farmstead.buyAnimal('chicken', uid), coop.uid);
  await page.evaluate(() => { window.farmstead.state.animals[0].stock = 1; });
  await page.evaluate(() => { const g = window.farmstead; g.collectFrom(g.state.animals[0].uid); });
  check(await page.evaluate(() => window.farmstead.action?.kind === 'carry' && window.farmstead.sfx.played.includes('cluck')), 'collecting eggs: carry pose and a cluck');

  // --- the tractor engine follows the throttle and stops when you get off
  await page.evaluate(() => {
    const g = window.farmstead; const st = g.state;
    st.placed.push({ uid: 'gx', kind: 'building', type: 'garage', x: 21.5, y: 15.2, level: 1, job: null, storage: {} });
    g.buyVehicle('tractor_small');
    const v = st.vehicles[0]; v.x = 11 * 64; v.y = 20.5 * 64; v.heading = 0; // open meadow, heading east
    g.enterVehicle(v.uid);
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  const eng = await page.evaluate(() => ({ on: !!window.farmstead.sfx.engine, rate: window.farmstead.sfx.engine?.src.playbackRate.value, smoke: window.farmstead.effects.particles.length, speed: window.farmstead.state.vehicles[0].speed, y: window.farmstead.state.vehicles[0].y / 64, ui: window.farmstead.uiOpen, driving: window.farmstead.state.driving }));
  await page.keyboard.up('KeyW');
  check(eng.on && eng.rate > 0.85 && eng.smoke > 0, `engine sound revs and exhaust puffs while driving (${JSON.stringify(eng)})`);
  await page.waitForTimeout(1200);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  check(!(await page.evaluate(() => window.farmstead.sfx.engine)), 'the engine stops when you get off');

  // --- doors
  await tp(17.55, 8.75, 'up');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(700);
  check(await page.evaluate(() => window.farmstead.sfx.played.includes('door') && !window.farmstead.sfx.tracks.ambience), 'the cottage door creaks and the outdoors goes quiet');

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log(`\nPolish: ${n} checks passed.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); server.kill(); });
