import { Assets } from './assets/loader.js';
import { buildWorld, worldSpriteKeys } from './world/layout.js';
import { TERRAIN_KEYS } from './render/terrain.js';
import { PLAYER_KEYS, plotSpriteKeys } from './render/sprites.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input/input.js';
import { Sfx } from './audio/sfx.js';
import { Game } from './game.js';
import { CROPS } from './data/crops.js';
import { createNewState } from './systems/state.js';
import { hasSave, loadGame, savePreview } from './systems/save.js';
import { clock } from './systems/time.js';

const storage = (() => {
  try {
    const k = '__farmstead_probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
})();

async function boot() {
  const loading = document.getElementById('loading');
  const bar = document.getElementById('loading-bar');
  const assets = new Assets();
  try {
    await assets.loadManifest();
  } catch (err) {
    loading.querySelector('p').textContent = `Could not load game data: ${err.message}`;
    return;
  }
  const keys = [
    ...worldSpriteKeys(), ...TERRAIN_KEYS, ...PLAYER_KEYS, ...plotSpriteKeys(Object.keys(CROPS)),
    'foliage.grass_tall', 'foliage.fern',
  ];
  await assets.loadImages(keys, (f) => (bar.style.width = `${Math.round(f * 100)}%`));

  const canvas = document.getElementById('game');
  const world = buildWorld(assets);
  const renderer = new Renderer(canvas, assets, world);
  const input = new Input();
  input.bindStick(document.getElementById('stick'), document.getElementById('knob'));
  const sfx = new Sfx(assets);
  const game = new Game({ assets, world, renderer, input, sfx, storage, onQuit: showTitle });
  window.farmstead = game; // inspection hook for tests and debugging

  const resize = () => renderer.resize(window.innerWidth, window.innerHeight, game.camera);
  resize();
  renderer.buildStatic(game.camera);
  window.addEventListener('resize', resize);

  const actionBtn = document.getElementById('btn-action');
  actionBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.press('Action'); });
  document.getElementById('btn-bag').addEventListener('click', () => game.running && !game.uiOpen && game.panels.bag());
  document.getElementById('btn-journal').addEventListener('click', () => game.running && !game.uiOpen && game.panels.journal());
  document.getElementById('btn-menu').addEventListener('click', () => game.running && game.panels.menu());
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.running) game.autosave('hidden'); });
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
  window.addEventListener('keydown', () => sfx.unlock(), { once: true });

  // Title screen
  const title = document.getElementById('title');
  const btnContinue = document.getElementById('btn-continue');
  const btnNew = document.getElementById('btn-new');
  const info = document.getElementById('save-info');
  function showTitle() {
    title.hidden = false;
    const prev = savePreview(storage);
    btnContinue.disabled = !prev;
    info.textContent = prev ? `Saved game: Day ${clock(prev.time).day} · ${prev.coins} coins` : 'No saved game yet.';
    // show the farm behind the title
    if (!game.state) game.state = createNewState();
  }
  function begin(state, isNew) {
    title.hidden = true;
    game.start(state, { isNew });
  }
  btnContinue.addEventListener('click', () => {
    const r = loadGame(storage);
    if (r.ok) begin(r.state, false);
    else info.textContent = r.reason;
  });
  btnNew.addEventListener('click', () => {
    if (hasSave(storage) && !window.confirm('Start a new game? Your current save will be overwritten when the new game saves.')) return;
    begin(createNewState(), true);
  });

  loading.hidden = true;
  showTitle();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    if (game.state) renderer.render(game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
