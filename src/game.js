import { TILE, GAME_MINUTES_PER_SECOND, PLAYER_SPEED, INTERACT_RANGE, WORLD_W, WORLD_H } from './config.js';
import { PLOTS } from './data/world.js';
import { CROPS } from './data/crops.js';
import { getItem } from './data/items.js';
import { EventBus } from './core/events.js';
import * as Farming from './systems/farming.js';
import * as Economy from './systems/economy.js';
import * as Quests from './systems/quests.js';
import { advanceTime, sleep } from './systems/simulation.js';
import { clock, formatClock } from './systems/time.js';
import { saveGame } from './systems/save.js';
import { CollisionWorld } from './world/collision.js';
import { Camera } from './world/camera.js';
import { Effects } from './render/effects.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';

const FACING = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const PLOT_AT = new Map(PLOTS.map((p) => [`${p.tx},${p.ty}`, p]));
const FEET = { w: 13, h: 7 }; // half-size of the player's collision box (px)
const ACTION_TIME = 0.38;
const AUTOSAVE_SECONDS = 60;

export class Game {
  constructor({ assets, world, renderer, input, sfx, storage, onQuit }) {
    this.assets = assets;
    this.world = world;
    this.renderer = renderer;
    this.input = input;
    this.sfx = sfx;
    this.storage = storage;
    this.onQuit = onQuit;
    this.camera = new Camera(WORLD_W, WORLD_H);
    this.collision = new CollisionWorld(world.bounds, world.colliders);
    this.effects = new Effects();
    this.hud = new Hud(this);
    this.panels = new Panels(this);
    this.state = null;
    this.running = false;
    this.animTime = 0;
    this.clockSeconds = 0;
    this.playerMoving = false;
    this.action = null;
    this.target = null;
    this.activeTool = null;
    this.autosaveTimer = 0;
    this.stepTimer = 0;
    this.input.interceptor = (e) => this.interceptKey(e);
    this.bus = new EventBus();
    Quests.attachQuests(() => this.state, this.bus);
    this.bus.on('questComplete', ({ id }) => {
      const q = Quests.trackedQuests(this.state).find((t) => t.def.id === id);
      this.hud.toast(`Quest complete: ${q?.def.title ?? id} — claim your reward!`, 'quest');
      this.sfx.play('quest');
    });
    this.bus.on('questStarted', ({ id }) => {
      const q = Quests.trackedQuests(this.state).find((t) => t.def.id === id);
      if (q) this.hud.toast(`New quest: ${q.def.title}`, 'info');
    });
  }

  get uiOpen() {
    return this.panels.open;
  }

  start(state, { isNew }) {
    this.state = state;
    this.sfx.muted = state.settings.muted;
    this.running = true;
    this.camera.follow(state.player.x, state.player.y - 40, 0, true);
    this.hud.cache = {};
    document.getElementById('hud').hidden = false;
    if (isNew || !state.flags.introSeen) this.showIntro();
    else this.hud.toast(`Welcome back — Day ${clock(state.time).day}, ${formatClock(state.time)}`);
  }

  stop() {
    this.running = false;
    this.panels.close(true);
    document.getElementById('hud').hidden = true;
  }

  // ------------------------------------------------------------ frame update
  update(dt) {
    if (!this.running) return;
    this.clockSeconds += dt;
    for (const code of this.input.consume()) this.handleKey(code);

    const paused = this.uiOpen;
    if (!paused) advanceTime(this.state, dt * GAME_MINUTES_PER_SECOND);

    if (this.action) {
      this.action.t += dt;
      if (this.action.t >= this.action.dur) this.action = null;
    }

    const p = this.state.player;
    const mv = paused || this.action ? { x: 0, y: 0 } : this.input.moveVector();
    this.playerMoving = Math.hypot(mv.x, mv.y) > 0.05;
    if (this.playerMoving) {
      if (Math.abs(mv.x) > Math.abs(mv.y) * 1.05) p.facing = mv.x > 0 ? 'right' : 'left';
      else p.facing = mv.y > 0 ? 'down' : 'up';
      const next = this.collision.move(p, FEET, mv.x * PLAYER_SPEED * dt, mv.y * PLAYER_SPEED * dt);
      p.x = next.x;
      p.y = next.y;
      this.animTime += dt;
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.32;
        this.sfx.play('step');
      }
    } else {
      this.animTime = 0;
    }

    this.target = paused ? null : this.resolveTarget();
    this.effects.update(dt);
    this.camera.follow(p.x, p.y - 40, dt);
    this.hud.update();

    this.autosaveTimer += dt;
    if (this.autosaveTimer > AUTOSAVE_SECONDS && !paused) this.autosave('timer');
  }

  // Runs synchronously in the keydown handler, before the browser's default
  // action, so keyboard input can't reach a stale focused button.
  interceptKey(e) {
    if (!this.running) return false;
    if (this.uiOpen) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.panels.close();
        return true;
      }
      return false; // let Enter/Space activate the focused panel button
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault(); // gameplay keys must not also click focused HUD buttons
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    return false;
  }

  handleKey(code) {
    if (code === 'Escape') {
      if (this.uiOpen) this.panels.close();
      else this.panels.menu();
      return;
    }
    if (this.uiOpen) return;
    if (code === 'KeyE' || code === 'Space' || code === 'Action') this.interact();
    else if (code === 'KeyB' || code === 'KeyI') this.panels.bag();
    else if (code === 'KeyJ') this.panels.journal();
    else if (code === 'Enter') {
      const done = Quests.trackedQuests(this.state).find((q) => q.state.status === 'complete');
      if (done) this.claimQuest(done.def.id);
    } else if (/^Digit[1-9]$/.test(code)) this.selectSlot(Number(code.slice(5)) - 1);
  }

  // ------------------------------------------------------------ targeting
  resolveTarget() {
    const p = this.state.player;
    const [fx, fy] = FACING[p.facing];
    const probes = [
      [p.x + fx * TILE * 0.62, p.y - 8 + fy * TILE * 0.62 - (p.facing === 'up' ? 10 : 0)],
      [p.x, p.y - 6],
    ];
    for (const [x, y] of probes) {
      const def = PLOT_AT.get(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`);
      if (def) {
        const a = Farming.getPlotAction(this.state, def.id);
        if (a.action === 'locked') return { kind: 'object', ...this.objectTarget('garden_sign', (def.tx + 0.5) * TILE, (def.ty + 0.9) * TILE) };
        return { kind: 'plot', id: def.id, tx: def.tx, ty: def.ty, label: a.label, ok: a.ok, action: a.action };
      }
    }
    let best = null;
    let bestD = INTERACT_RANGE;
    for (const it of this.world.interactables) {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    if (!best) return null;
    return { kind: 'object', ...this.objectTarget(best.kind, best.x, best.y) };
  }

  objectTarget(kind, x, y) {
    const s = this.state;
    const labels = {
      house: 'Enter cottage (sleep / save)',
      mailbox: 'Check the mailbox',
      well: s.can.water < s.can.capacity ? `Refill watering can (${s.can.water}/${s.can.capacity})` : 'Watering can is full',
      workbench: 'Use workbench',
      tool_shed: 'Tool shed — upgrades',
      market: 'Open the market stall',
      village_sign: 'Read the signpost',
      road_block: 'Inspect the fallen tree',
      garden_sign: s.unlocks.gardenExpansion ? 'South garden bed (owned)' : 'Expand the garden',
    };
    const ok = kind === 'well' ? s.can.water < s.can.capacity : true;
    return { objectKind: kind, x, y, label: labels[kind], ok };
  }

  // ------------------------------------------------------------ actions
  interact() {
    const t = this.target;
    if (!t || this.action) return;
    if (t.kind === 'plot') this.interactPlot(t);
    else this.interactObject(t.objectKind);
  }

  interactPlot(t) {
    const r = Farming.interactPlot(this.state, t.id, this.bus);
    const cx = (t.tx + 0.5) * TILE;
    const cy = (t.ty + 0.5) * TILE;
    if (!r.ok) {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
      return;
    }
    this.action = { kind: r.action, t: 0, dur: ACTION_TIME };
    const fx = { till: ['dirt', 'till', 'hoe'], plant: ['seed', 'plant', null], water: ['water', 'water', 'can'], harvest: ['harvest', 'harvest', null] }[r.action];
    this.effects.burst(fx[0], cx, cy);
    this.sfx.play(fx[1]);
    this.activeTool = fx[2];
    if (r.action === 'harvest') this.effects.text(`+${r.qty} ${CROPS[r.crop].name}`, cx, cy - 20, '#fff4c2');
    if (r.action === 'plant' && !this.state.inventory[this.state.selectedSeed]) {
      const next = Farming.seedToPlant(this.state);
      if (next) this.state.selectedSeed = next;
    }
  }

  interactObject(kind) {
    const s = this.state;
    switch (kind) {
      case 'market':
        this.panels.shop(Object.keys(s.inventory).some((id) => getItem(id)?.sellPrice != null) ? 'sell' : 'buy');
        break;
      case 'well': {
        const r = Farming.refillCan(s, this.bus);
        if (r.ok) {
          this.hud.toast('Watering can refilled');
          this.sfx.play('refill');
          this.effects.burst('water', s.player.x, s.player.y - 30);
          this.activeTool = 'can';
        } else this.hud.toast(r.reason, 'warn');
        break;
      }
      case 'house':
        this.panels.dialog('Your Cottage',
          `It's ${formatClock(s.time)} on day ${clock(s.time).day}. Sleeping skips to 6:00 AM — crops keep growing overnight while their soil is moist.`,
          [{ label: 'Sleep until morning', primary: true, action: () => this.sleep() },
            { label: 'Save game', action: () => this.manualSave() },
            { label: 'Leave' }]);
        break;
      case 'mailbox':
        this.panels.dialog('Mailbox', this.mailText());
        break;
      case 'tool_shed':
        this.panels.upgrade('wateringCan2', 'Tool Shed');
        break;
      case 'garden_sign':
        this.panels.upgrade('gardenExpansion', 'Garden Expansion');
        break;
      case 'workbench':
        this.panels.dialog('Workbench', 'The workbench needs a proper set of tools before you can craft. Crafting and building upgrades arrive with the workshop in a later update.');
        break;
      case 'village_sign':
        this.panels.dialog('Signpost', '→ Willowmere Village\n\nA note is nailed to the post: "Road closed for repairs after the storm. The village will reopen soon."');
        break;
      case 'road_block':
        this.panels.dialog('Fallen Tree', 'A storm-felled trunk blocks the road to Willowmere. It will be cleared once the village opens in a later update.');
        break;
      default:
    }
  }

  mailText() {
    const q = this.state.quests;
    if (q.q_breaking_ground.status === 'active') {
      return 'Welcome to the farm!\n\nThe garden plots are inside the fence south-west of the cottage. Face a plot and press E to till it, then again to plant carrot seeds, then water them. Your watering can refills at the well or the water barrel.';
    }
    if (q.q_first_harvest.status === 'active') return 'Crops only grow while their soil is moist (dark soil). If the soil dries out, water again. Sleeping in the cottage passes the night quickly.';
    if (q.q_market_day.status === 'active') return 'The market stall is at the east end of the path. Sell your produce there and buy new seeds with the coins.';
    if (q.q_room_to_grow.status === 'active') return 'Your garden has room to grow: the overgrown south bed can be cleared — check the sign by the garden fence.';
    return 'No new mail today. Keep the garden growing!';
  }

  sell(id, qty) {
    if (qty <= 0) return;
    const r = Economy.sell(this.state, id, qty, this.bus);
    if (r.ok) {
      this.sfx.play('coin');
      this.hud.toast(`Sold ${qty}× ${getItem(id).name} for ${r.total} coins`, 'good');
      this.effects.burst('coins', this.state.player.x, this.state.player.y - 50);
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
  }

  buy(id, qty) {
    const r = Economy.buy(this.state, id, qty, this.bus);
    if (r.ok) {
      this.sfx.play('coin');
      this.hud.toast(`Bought ${qty}× ${getItem(id).name}`, 'good');
      if (!this.state.inventory[this.state.selectedSeed]) this.state.selectedSeed = id;
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
  }

  purchaseUpgrade(id) {
    const r = Economy.purchaseUpgrade(this.state, id, this.bus);
    if (r.ok) {
      this.sfx.play('quest');
      this.hud.toast(id === 'gardenExpansion' ? 'The south garden bed is cleared — 8 new plots!' : 'Upgrade purchased!', 'good');
      this.autosave('upgrade');
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
  }

  claimQuest(id) {
    const r = Quests.claim(this.state, id, this.bus);
    if (r.ok) {
      this.sfx.play('coin');
      this.hud.toast(`Reward: ${Quests.rewardText(r.reward)}`, 'good');
      this.autosave('quest');
    } else this.hud.toast(r.reason, 'warn');
    this.hud.cache.quests = null;
  }

  selectSlot(i) {
    const slot = this.hud.hotbarSlots()[i];
    if (!slot) return;
    this.sfx.play('click');
    if (slot.kind === 'seed') {
      this.state.selectedSeed = slot.id;
      this.activeTool = null;
    } else this.activeTool = slot.id;
  }

  sleep() {
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    this.running = false;
    setTimeout(() => {
      sleep(this.state);
      this.running = true;
      fade.classList.remove('on');
      this.hud.toast(`Good morning! Day ${clock(this.state.time).day}`, 'good');
      this.autosave('sleep');
    }, 700);
  }

  // ------------------------------------------------------------ persistence
  autosave(reason) {
    this.autosaveTimer = 0;
    const r = saveGame(this.storage, this.state);
    if (!r.ok) this.hud.toast(r.reason, 'warn');
    else if (reason === 'sleep') this.hud.toast('Game saved');
    return r;
  }

  manualSave() {
    const r = this.autosave('manual');
    if (r.ok) this.hud.toast('Game saved', 'good');
  }

  toggleMute() {
    this.state.settings.muted = !this.state.settings.muted;
    this.sfx.muted = this.state.settings.muted;
  }

  quitToTitle() {
    this.autosave('quit');
    this.stop();
    this.onQuit?.();
  }

  showIntro() {
    this.state.flags.introSeen = true;
    this.panels.dialog('Welcome to Farmstead',
      'You have inherited a small cottage, a fenced garden and a handful of carrot seeds.\n\n' +
      'Walk with WASD / arrow keys (or the on-screen stick) and press E / Space (or the action button) to interact with whatever you face.\n\n' +
      'Start with the quest on the left: till, plant and water the garden plots.',
      [{ label: "Let's farm!", primary: true }]);
  }
}
