import { TILE, GAME_MINUTES_PER_SECOND, PLAYER_SPEED, INTERACT_RANGE, WORLD_W, WORLD_H } from './config.js';
import { PLOTS } from './data/world.js';
import { CROPS } from './data/crops.js';
import { getItem } from './data/items.js';
import { EventBus } from './core/events.js';
import * as Farming from './systems/farming.js';
import * as Economy from './systems/economy.js';
import * as Quests from './systems/quests.js';
import * as Fishing from './systems/fishing.js';
import * as Inv from './systems/inventory.js';
import { FISH } from './data/fish.js';
import { advanceTime, sleep } from './systems/simulation.js';
import { clock, formatClock } from './systems/time.js';
import { saveGame, loadGame } from './systems/save.js';
import { CollisionWorld, overlaps } from './world/collision.js';
import { buildInterior, placedColliders } from './world/layout.js';
import * as Buildings from './systems/buildings.js';
import * as Storage from './systems/storage.js';
import * as Animals from './systems/animals.js';
import * as Clearing from './systems/clearing.js';
import * as Progress from './systems/progress.js';
import * as Vehicles from './systems/vehicles.js';
import { groundFactor } from './systems/ground.js';
import { VEHICLES, IMPLEMENTS } from './data/vehicles.js';
import { activeEvent } from './systems/seasons.js';
import { isRaining } from './systems/weather.js';
import { ACHIEVEMENTS_BY_ID } from './data/achievements.js';
import { QUESTS_BY_ID } from './data/quests.js';
import { SPECIES, productLabel } from './data/animals.js';
import { AnimalActors } from './world/animalActors.js';
import { NpcActors } from './world/npcActors.js';
import { NPCS } from './data/npcs.js';
import * as Relations from './systems/relations.js';
import * as Orders from './systems/orders.js';
import * as Shops from './systems/shops.js';
import { awayText, presentNow } from './systems/npcs.js';
import { ROAD_Y, VILLAGE_X0 } from './data/village.js';
import { BUILDINGS, DECORATIONS } from './data/buildings.js';
import { UPGRADES } from './data/progression.js';
import { Camera } from './world/camera.js';
import { padMenu } from './input/gamepad.js';
import { Effects } from './render/effects.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';

const FACING = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const PLOT_AT = new Map(PLOTS.map((p) => [`${p.tx},${p.ty}`, p]));
const FEET = { w: 13, h: 7 }; // half-size of the player's collision box (px)
const ACTION_TIME = 0.38;
const RUN_FACTOR = 1.55; // Shift, RT or the stick pushed to its rim
const DIR_PAD = new Set(['PadUp', 'PadDown', 'PadLeft', 'PadRight']); // the d-pad moves (Input.moveVector)
const ANIMAL_VOICE = { chicken: 'cluck', cow: 'moo', sheep: 'baa' };
const ZOOM_FACTORS = { near: 0.82, normal: 1, far: 1.25 }; // Settings > Camera
const AUTOSAVE_SECONDS = 60;
const ROAD_CLEARING_COST = 150;
const ANIMAL_REACH = 58; // px from the player's feet to an animal's feet
const NO_SAVING_TEXT = "Saving is unavailable: this device isn't letting the game keep saved data (storage is blocked). You can play, but progress will be lost when you close the game.";

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
    this.farmCollision = new CollisionWorld(world.bounds, world.colliders);
    this.interiors = { house: buildInterior('house') };
    this.placement = null; // { type, x, y, valid } while placing a building
    this.actors = new AnimalActors();
    this.npcs = new NpcActors();
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
    this.actionBuffer = 0; // seconds a tap on Action stays queued if it can't act yet
    this.activeTool = null;
    this.autosaveTimer = 0;
    this.stepTimer = 0;
    this.input.interceptor = (e) => this.interceptKey(e);
    this.bus = new EventBus();
    Quests.attachQuests(() => this.state, this.bus);
    Progress.attachProgress(() => this.state, this.bus);
    this.lastProgressToast = 0;
    this.bus.on('questProgress', ({ id, label, progress, count }) => {
      if (progress >= count && QUESTS_BY_ID[id].objectives.every((o, i) => this.state.quests[id].progress[i] >= o.count)) return; // the completion toast covers it
      const now = performance.now();
      if (now - this.lastProgressToast < 1200 && progress < count) return; // do not spam on every harvest
      this.lastProgressToast = now;
      this.hud.toast(`${label}: ${progress}/${count}`, 'info');
    });
    this.bus.on('questAccepted', ({ id }) => this.hud.toast(`Quest accepted: ${QUESTS_BY_ID[id].title}`, 'info'));
    this.bus.on('questMissed', ({ id }) => this.hud.toast(`The festival ended before you finished: ${QUESTS_BY_ID[id].title}`, 'warn'));
    this.bus.on('unlocked', ({ name }) => {
      this.hud.toast(`Unlocked: ${name}`, 'quest');
      this.sfx.play('unlock');
      this.celebrate('#ffe27a');
    });
    this.bus.on('achievementReady', ({ name }) => { this.hud.toast(`Achievement: ${name} — claim it in the journal`, 'quest'); this.sfx.play('quest'); });
    this.bus.on('levelUp', ({ level, coins }) => {
      this.hud.toast(`Farm level ${level}! +${coins} coins`, 'quest');
      this.sfx.play('levelup');
      this.celebrate('#7fe0ff');
      this.vibrate([30, 40, 60]);
    });
    this.bus.on('constructionStarted', () => this.sfx.play('build'));
    this.bus.on('sprinklerWatered', ({ uid }) => {
      (this.sprayUntil ||= {})[uid] = this.clockSeconds + 6; // show the jets for a moment
      if (this.running && !this.interior) this.sfx.play('water');
    });
    this.bus.on('rainWatered', () => {
      const day = Math.floor(this.state.time / 1440);
      if (this.rainToastDay === day || !this.running) return;
      this.rainToastDay = day;
      this.hud.toast('It is raining: the rain is watering your crops today');
    });
    this.bus.on('questComplete', ({ id }) => {
      const q = Quests.trackedQuests(this.state).find((t) => t.def.id === id);
      this.hud.toast(`Quest complete: ${q?.def.title ?? id} — claim your reward!`, 'quest');
      this.sfx.play('quest');
      this.effects.burst('sparkle', this.state.player.x, this.state.player.y - 60);
    });
    this.bus.on('questStarted', ({ id }) => {
      const def = QUESTS_BY_ID[id];
      if (def.optional) this.hud.toast(`Side quest available: ${def.title} (see the journal)`, 'info');
      else if (def) this.hud.toast(`New quest: ${def.title}`, 'info');
    });
    this.bus.on('constructed', ({ id, level, uid }) => {
      if (DECORATIONS[id]) return;
      const name = BUILDINGS[id].name;
      this.hud.toast(level === 1 && uid ? `${name} finished!` : `${name} upgraded to level ${level}!`, 'good');
      this.sfx.play('build');
      const at = this.buildingPos(id, uid);
      if (at) {
        this.effects.burst('dust', at.x, at.y - 20);
        this.effects.burst('sparkle', at.x, at.y - 90);
      }
      this.refreshColliders();
      this.panels.rerender();
    });
    this.bus.on('buyAnimal', ({ species }) => this.hud.toast(`${SPECIES[species].name} bought`, 'good'));
    this.bus.on('autoWatered', ({ count }) => this.hud.toast(`The well watered ${count} plot${count === 1 ? '' : 's'} this morning`));
  }

  // The vehicle the player is sitting in, or null.
  get drivingVehicle() {
    return this.state?.driving ? Vehicles.findVehicle(this.state, this.state.driving) : null;
  }

  // Current interior scene, or null when outdoors.
  get interior() {
    return this.state?.player.scene === 'house' ? this.interiors.house : null;
  }

  // Static colliders plus everything the player has placed.
  refreshColliders() {
    this.farmCollision = new CollisionWorld(this.world.bounds, [...this.world.colliders, ...placedColliders(this.state, this.placement?.moveUid)]);
  }

  get activeCollision() {
    const room = this.interior;
    if (room) {
      room.collision ||= new CollisionWorld(room.bounds, room.colliders);
      return room.collision;
    }
    return this.farmCollision;
  }

  get uiOpen() {
    return this.panels.open;
  }

  start(state, { isNew }) {
    this.state = state;
    this.applySettings();
    this.running = true;
    this.placement = null;
    this.lastEvent = activeEvent(state.time)?.id || null; // do not announce a festival that was already on
    this.applyCleared();
    this.applyWorldFlags();
    this.setCameraWorld();
    this.camera.follow(state.player.x, state.player.y - 40, 0, true);
    this.hud.cache = {};
    document.getElementById('hud').hidden = false;
    const noSaving = this.storage.persistent === false;
    if (isNew || !state.flags.introSeen) this.showIntro(noSaving);
    else if (noSaving) this.panels.dialog('Saving is unavailable', NO_SAVING_TEXT);
    else this.hud.toast(`Welcome back — Day ${clock(state.time).day}, ${formatClock(state.time)}`);
  }

  stop() {
    this.running = false;
    this.sfx.setEngine(null);
    this.panels.close(true);
    document.getElementById('hud').hidden = true;
  }

  // ------------------------------------------------------------ frame update
  update(dt) {
    if (!this.running) return;
    this.clockSeconds += dt;
    for (const code of this.input.consume()) this.handleKey(code);

    const paused = this.uiOpen;
    if (!paused) advanceTime(this.state, dt * GAME_MINUTES_PER_SECOND, this.bus);

    if (this.action) {
      this.action.t += dt;
      if (this.action.t >= this.action.dur) this.action = null;
    }

    const p = this.state.player;
    const driven = this.drivingVehicle;
    if (driven) this.updateDriving(dt, paused);
    const mv = paused || this.action || driven || this.fishing ? { x: 0, y: 0 } : this.input.moveVector();
    this.playerMoving = Math.hypot(mv.x, mv.y) > 0.05;
    if (this.playerMoving) {
      if (Math.abs(mv.x) > Math.abs(mv.y) * 1.05) p.facing = mv.x > 0 ? 'right' : 'left';
      else p.facing = mv.y > 0 ? 'down' : 'up';
      const run = this.input.running();
      const speed = PLAYER_SPEED * (run ? RUN_FACTOR : 1);
      const next = this.activeCollision.move(p, FEET, mv.x * speed * dt, mv.y * speed * dt);
      p.x = next.x;
      p.y = next.y;
      this.animTime += dt * (run ? RUN_FACTOR : 1); // faster steps, same frames
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = run ? 0.22 : 0.32;
        this.sfx.play('step');
      }
    } else {
      this.animTime = 0;
    }

    this.actors.sync(this.state);
    if (!paused) this.actors.update(dt);
    if (!this.interior) {
      this.npcs.sync(this.state);
      if (!paused) this.npcs.update(dt);
      this.checkVillageVisit();
    }
    if (this.placement) this.updatePlacement();
    this.target = paused ? null : driven ? this.driveTarget() : this.placement ? this.placementTarget() : this.resolveTarget();
    // A tap that landed mid-action (or just before a target was in reach) is
    // kept for a moment and fires as soon as it can, so players never need to
    // hold or repeat the button.
    if (paused) this.actionBuffer = 0;
    else if (this.actionBuffer > 0) {
      this.actionBuffer -= dt;
      if (this.tryInteract()) this.actionBuffer = 0;
    }
    this.effects.update(dt);
    if (!paused) this.updateFishing(dt);
    this.progressTimer = (this.progressTimer || 0) + dt;
    if (this.progressTimer > 0.8) {
      this.progressTimer = 0;
      Progress.checkUnlocks(this.state, this.bus);
      Progress.checkAchievements(this.state, this.bus);
      const ev = activeEvent(this.state.time);
      if ((ev?.id || null) !== this.lastEvent) {
        if (ev && this.lastEvent !== undefined) this.hud.toast(`${ev.name}! ${ev.blurb}`, 'quest');
        this.lastEvent = ev?.id || null;
      }
    }
    this.camera.follow(p.x, p.y - 40, dt);
    this.hud.update();
    this.updateAudio();

    this.autosaveTimer += dt;
    if (this.autosaveTimer > AUTOSAVE_SECONDS && !paused) this.autosave('timer');
  }

  // Gamepad buttons (see Input.pollGamepad). Menus are driven with the d-pad;
  // in the world A acts, B gets off / cancels, LB/RB pick the hotbar slot.
  handlePad(code) {
    const title = document.querySelector('#title:not([hidden]) .title-card');
    const modal = document.querySelector('#modal-root .modal') || (!this.running ? title : null);
    if (modal) {
      if (code === 'PadB' || code === 'Escape') {
        if (this.uiOpen) this.panels.close();
        return;
      }
      padMenu(modal, code);
      return;
    }
    if (!this.running) return;
    document.body.classList.remove('pad-nav');
    if (code === 'PadA') this.input.press('Action');
    else if (code === 'PadB') {
      if (this.drivingVehicle) this.exitVehicle();
      else if (this.placement) this.cancelPlacement();
    } else if (code === 'PadLB' || code === 'PadRB') {
      const n = this.hud.hotbarSlots().length;
      const cur = this.hud.hotbarSlots().findIndex((sl) => (sl.kind === 'seed' ? !this.activeTool && sl.id === this.state.selectedSeed : sl.id === this.activeTool));
      this.selectSlot(((cur < 0 ? 0 : cur) + (code === 'PadRB' ? 1 : n - 1)) % n);
    } else if (!DIR_PAD.has(code)) this.input.press(code);
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
      if (this.panels.current?.onKey?.(e)) {
        e.preventDefault();
        return true;
      }
      return false; // let Enter/Space activate the focused panel button
    }
    if (this.placement && e.code === 'Escape') {
      e.preventDefault();
      this.cancelPlacement();
      return true;
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
    if (this.drivingVehicle) {
      if (code === 'KeyF') this.exitVehicle();
      else if (code === 'KeyE' || code === 'Space' || code === 'Action') this.toggleEngage();
      else if (code === 'KeyJ') this.panels.journal();
      else if (code === 'KeyB' || code === 'KeyI') this.panels.bag();
      else if (code === 'KeyM') this.panels.map();
      return;
    }
    if (this.placement && (code === 'KeyE' || code === 'Space' || code === 'Action')) this.confirmPlacement();
    else if (code === 'KeyE' || code === 'Space' || code === 'Action') {
      if (!this.tryInteract()) this.actionBuffer = 0.5;
    }
    else if (code === 'KeyB' || code === 'KeyI') this.panels.bag();
    else if (code === 'KeyJ') this.panels.journal();
    else if (code === 'KeyM') this.panels.map();
    else if (code === 'Enter') {
      const done = Quests.trackedQuests(this.state).find((q) => q.state.status === 'complete');
      if (done) this.claimQuest(done.def.id);
    } else if (/^Digit[1-9]$/.test(code)) this.selectSlot(Number(code.slice(5)) - 1);
  }

  // ------------------------------------------------------------ targeting
  resolveTarget() {
    const p = this.state.player;
    const room = this.interior;
    if (room) return this.nearestInteractable(room.interactables);
    const [fx, fy] = FACING[p.facing];
    const probes = [
      [p.x + fx * TILE * 0.62, p.y - 8 + fy * TILE * 0.62 - (p.facing === 'up' ? 10 : 0)],
      [p.x, p.y - 6],
    ];
    for (const [x, y] of probes) {
      const def = PLOT_AT.get(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`);
      if (def) {
        const a = Farming.getPlotAction(this.state, def.id);
        if (a.action === 'locked') return { kind: 'object', uid: `unlock:${a.unlock}`, ...this.objectTarget('garden_sign', (def.tx + 0.5) * TILE, (def.ty + 0.9) * TILE, `unlock:${a.unlock}`) };
        return { kind: 'plot', id: def.id, tx: def.tx, ty: def.ty, label: a.label, ok: a.ok, action: a.action };
      }
    }
    // a rod in hand on the creek bank: cast from here
    if (this.fishing) return { kind: 'fish', label: this.fishing.phase === 'bite' ? 'Hook it!' : 'Reel in', ok: true, x: this.fishing.x, y: this.fishing.y - 12 };
    if (this.state.inventory.fishing_rod && this.activeTool === 'rod') {
      const spot = Fishing.castSpot(p, p.facing);
      if (spot) return { kind: 'fish', label: 'Cast line', ok: true, x: spot.x, y: spot.y - 12 };
    }
    const placed = this.state.placed
      .filter((r) => r.type === 'storage_shed' || r.type === 'garage' || BUILDINGS[r.type]?.livestock || r.kind === 'decor')
      .map((r) => (r.kind === 'decor'
        ? { id: r.uid, uid: r.uid, kind: 'decor', x: r.x * TILE, y: (r.y + 0.1) * TILE }
        : r.type === 'garage'
        ? { id: r.uid, uid: r.uid, kind: 'garage', x: r.x * TILE, y: (r.y + 0.15) * TILE }
        : r.type === 'storage_shed'
        ? { id: r.uid, uid: r.uid, kind: 'storage', x: r.x * TILE, y: (r.y + 0.15) * TILE }
        : { id: r.uid, uid: r.uid, kind: 'livestock', x: r.x * TILE, y: (r.y + 0.75) * TILE }));
    const clearable = Clearing.clearables(this.state).map((c) => ({ kind: 'clear', uid: `scn${c.index}`, x: c.x * TILE, y: c.y * TILE + 6 }));
    const wheels = this.state.vehicles.filter((v) => v.uid !== this.state.driving).map((v) => ({ kind: 'vehicle', uid: `veh:${v.uid}`, x: v.x, y: v.y + 10 }));
    const object = this.nearestInteractable([...this.world.interactables, ...placed, ...clearable, ...this.npcInteractables(), ...wheels]);
    const animal = this.nearestAnimal();
    if (animal && (!object || animal.dist <= object.dist)) return animal;
    return object;
  }

  // '?' = they are waiting for goods you carry, '!' = a quest asks you to talk to them.
  npcMarker(id) {
    const s = this.state;
    if (Orders.acceptedOrders(s).some((o) => o.giver === id && Orders.have(s, o) >= o.qty)) return '?';
    const talkQuest = Quests.trackedQuests(s).some(({ def, state: qs }) => qs && def.objectives.some((o, i) => o.type === 'talk' && o.id === id && qs.progress[i] < o.count));
    return talkQuest ? '!' : null;
  }

  // Villagers you can talk to, plus the closed door of anyone who is away.
  npcInteractables() {
    const out = this.npcs.list().map((a) => ({ kind: 'npc', uid: `npc:${a.id}`, x: a.x, y: a.y }));
    for (const def of Object.values(NPCS)) {
      if (def.wander || presentNow(def, this.state.time)) continue;
      out.push({ kind: 'closed', uid: `closed:${def.id}`, x: def.door[0] * TILE, y: (def.door[1] + 0.5) * TILE });
    }
    return out;
  }

  // The closest wandering animal within reach, with the action a tap would do.
  nearestAnimal() {
    const p = this.state.player;
    let best = null;
    let bestD = ANIMAL_REACH;
    for (const ac of this.actors.list()) {
      const d = Math.hypot(ac.x - p.x, ac.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = ac;
      }
    }
    if (!best) return null;
    const a = this.state.animals.find((x) => x.uid === best.uid);
    if (!a) return null;
    return { kind: 'animal', uid: a.uid, dist: bestD, x: best.x, y: best.y, ...this.animalAction(a) };
  }

  animalAction(a) {
    const s = this.state;
    const sp = SPECIES[a.species];
    if (a.stock > 0) return { action: 'collect', ok: true, label: `Collect ${productLabel(a.species, a.stock)} from ${a.name}` };
    if (Animals.isHungry(s, a)) {
      const have = s.inventory[sp.feed] || 0;
      return have > 0
        ? { action: 'feed', ok: true, label: `Feed ${a.name} and any other hungry animals here (${have} ${getItem(sp.feed).name.toLowerCase()})` }
        : { action: 'feed', ok: false, label: `${a.name} is hungry — buy ${getItem(sp.feed).name.toLowerCase()} at the market` };
    }
    if (Animals.canPet(s, a)) return { action: 'pet', ok: true, label: `Pet ${a.name} (${Animals.statusText(s, a)})` };
    return { action: 'none', ok: false, label: `${a.name} — ${Animals.statusText(s, a)}, ${Animals.moodText(a).toLowerCase()}` };
  }

  nearestInteractable(list) {
    const p = this.state.player;
    let best = null;
    let bestD = INTERACT_RANGE;
    for (const it of list) {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    if (!best) return null;
    return { kind: 'object', uid: best.uid, dist: bestD, ...this.objectTarget(best.kind, best.x, best.y, best.uid) };
  }

  objectTarget(kind, x, y, uid) {
    const s = this.state;
    const building = (id) => s.buildings[id]?.job ? ' (builders at work)' : '';
    const shed = uid && s.placed.find((r) => r.uid === uid);
    const barnRec = shed && BUILDINGS[shed.type]?.livestock ? shed : null;
    const npcId = uid && /^(npc|closed):/.test(String(uid)) ? String(uid).split(':')[1] : null;
    const npcDef = npcId ? NPCS[npcId] : null;
    const scn = kind === 'clear' ? Clearing.clearInfo(Number(String(uid).slice(3))) : null;
    const labels = {
      decor: shed ? `${DECORATIONS[shed.type]?.name || 'Decoration'} — move or pick up` : 'Decoration',
      garage: shed?.level >= 1 ? 'Open the garage' : `Garage under construction — ready ${shed?.job ? formatClock(shed.job.end) : ''}`,
      vehicle: (() => {
        const v = Vehicles.findVehicle(s, String(uid || '').split(':')[1]);
        return v ? `${VEHICLES[v.type].name} — fuel ${Vehicles.fuelPct(v)}%, condition ${Math.round(v.condition)}%` : 'Vehicle';
      })(),
      npc: npcDef ? `Talk to ${npcDef.name} (${npcDef.role})` : 'Talk',
      closed: npcDef ? `${npcDef.place} is closed — ${awayText(npcDef, s.time).replace(/^.*? is away — /, '')}` : 'Closed',
      notice_board: 'Read the notice board',
      road_block: s.flags.roadOpen ? 'The road is open' : 'Inspect the fallen tree',
      clear: scn ? `Clear ${scn.name} (${scn.cost} coins)` : 'Clear',
      livestock: barnRec?.level >= 1
        ? `Open ${BUILDINGS[barnRec.type].name.toLowerCase()} (${Animals.animalsAt(s, barnRec.uid).length}/${Animals.capacity(barnRec)} animals)`
        : `${barnRec ? BUILDINGS[barnRec.type].name : 'Building'} under construction — ready ${barnRec?.job ? formatClock(barnRec.job.end) : ''}`,
      house: `Enter cottage${building('house')}`,
      bed: 'Sleep until morning',
      exit: 'Leave cottage',
      storage: shed?.level >= 1 ? 'Open storage shed' : `Storage shed under construction — ready ${shed ? formatClock(shed.job.end) : ''}`,
      mailbox: 'Check the mailbox',
      well: s.can.water < s.can.capacity ? `Refill watering can (${s.can.water}/${s.can.capacity})` : 'Watering can is full',
      workbench: 'Building planner',
      tool_shed: `Workshop — upgrades${building('tool_shed')}`,
      market: 'Open the market stall',
      village_sign: 'Read the signpost',
      garden_sign: (() => {
        const up = UPGRADES[String(uid || 'unlock:gardenExpansion').split(':')[1]] || UPGRADES.gardenExpansion;
        return s.unlocks[up.id] ? `${up.name} (owned)` : `Expand: ${up.name} (${up.cost} coins)`;
      })(),
    };
    const ok = kind === 'closed' ? false : kind === 'garage' ? shed?.level >= 1 : kind === 'clear' ? !!scn && s.coins >= scn.cost : kind === 'well' ? s.can.water < s.can.capacity : kind === 'storage' || kind === 'livestock' ? shed?.level >= 1 : true;
    return { objectKind: kind, x, y, label: labels[kind], ok };
  }

  // ------------------------------------------------------------ actions
  // Returns true if the press was used (even if the game answered "can't").
  tryInteract() {
    const t = this.target;
    if (this.fishing) {
      this.fishAction();
      return true;
    }
    if (!t || this.action) return false;
    if (t.kind === 'drive') this.toggleEngage();
    else if (t.kind === 'fish') this.fishAction();
    else if (t.kind === 'plot') this.interactPlot(t);
    else if (t.kind === 'animal') this.interactAnimal(t);
    else this.interactObject(t.objectKind);
    return true;
  }

  // ------------------------------------------------------------ fishing
  // Action casts from the bank; while the line is out, Action reels in, or hooks
  // when the float dips. Nothing is saved mid-cast: a reload clears the line.
  fishAction() {
    const f = this.fishing;
    if (!f) {
      const p = this.state.player;
      const spot = Fishing.castSpot(p, p.facing);
      if (!spot) return;
      this.fishing = { phase: 'wait', t: 0, wait: Fishing.waitSeconds(), x: spot.x, y: spot.y, fish: null };
      this.effects.burst('water', spot.x, spot.y);
      this.sfx.play('water');
      this.hud.toast('Line cast — wait for a bite');
      return;
    }
    if (f.phase === 'wait') {
      this.fishing = null;
      this.hud.toast('You reel the line in');
      return;
    }
    // hooked!
    const fish = f.fish;
    this.fishing = null;
    const added = Inv.add(this.state.inventory, fish.id, 1, this.bagSlots());
    if (!added.ok) {
      this.hud.toast(added.reason === 'No free space' ? 'Your bag is full — the fish got away' : added.reason, 'warn');
      this.sfx.play('error');
      return;
    }
    this.bus.emit('catch', { item: fish.id, qty: 1 });
    this.effects.burst('water', f.x, f.y);
    this.effects.burst('sparkle', f.x, f.y - 30);
    this.sfx.play('quest');
    this.vibrate(20);
    this.hud.toast(`Caught a ${fish.name}! Worth ${fish.sellPrice} coins at the market`, 'good');
    this.autosave('fish');
  }

  updateFishing(dt) {
    const f = this.fishing;
    if (!f) return;
    f.t += dt;
    if (f.phase === 'wait' && f.t >= f.wait) {
      const fish = Fishing.pickFish(this.state.time);
      if (!fish) {
        this.fishing = null;
        this.hud.toast('Nothing is biting at this time of year');
        return;
      }
      f.phase = 'bite';
      f.t = 0;
      f.fish = fish;
      this.sfx.play('plant');
      this.effects.burst('water', f.x, f.y);
      this.hud.toast('A bite! Press A to hook it', 'quest');
    } else if (f.phase === 'bite' && f.t > Fishing.HOOK_WINDOW) {
      this.fishing = null;
      this.hud.toast('It got away');
    }
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
    if (r.action === 'harvest') {
      this.effects.text(`+${r.qty} ${CROPS[r.crop].name}`, cx, cy - 20, '#fff4c2');
      this.vibrate(15);
    }
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
        this.enterInterior('house');
        break;
      case 'exit':
        this.leaveInterior();
        break;
      case 'bed':
        this.panels.dialog('Bed',
          `It's ${formatClock(s.time)} on day ${clock(s.time).day}. Sleeping skips to 6:00 AM — crops keep growing overnight while their soil is moist, and builders keep working.`,
          [{ label: 'Sleep until morning', primary: true, action: () => this.sleep() },
            { label: 'Save game', action: () => this.manualSave() },
            { label: 'Not yet' }]);
        break;
      case 'storage':
        if (this.target?.uid) this.panels.storage(this.target.uid);
        break;
      case 'livestock': {
        const rec = this.target?.uid && s.placed.find((r) => r.uid === this.target.uid);
        if (rec?.level >= 1) this.panels.livestock(rec.uid);
        else this.hud.toast('The builders are still working on it', 'warn');
        break;
      }
      case 'mailbox':
        this.panels.dialog('Mailbox', this.mailText());
        break;
      case 'tool_shed':
        this.panels.planner('upgrade');
        break;
      case 'garden_sign':
        {
          const up = UPGRADES[String(this.target?.uid || 'unlock:gardenExpansion').split(':')[1]] || UPGRADES.gardenExpansion;
          this.panels.upgrade(up.id, up.name);
        }
        break;
      case 'workbench':
        this.panels.planner('upgrade');
        break;
      case 'village_sign':
        this.panels.dialog('Signpost', '→ Willowmere Village\n\nA note is nailed to the post: "Road closed for repairs after the storm. The village will reopen soon."');
        break;
      case 'clear': {
        const index = Number(String(this.target?.uid).slice(3));
        const info = Clearing.clearInfo(index);
        if (!info) break;
        this.panels.dialog(`Clear the ${info.name}?`,
          `Clearing it costs ${info.cost} coins and frees the space for a building. It can't be undone. You have ${s.coins} coins.`,
          [{ label: `Clear it (${info.cost} coins)`, primary: true, action: () => this.clearScenery(index) }, { label: 'Leave it' }]);
        break;
      }
      case 'road_block': {
        const quest = s.quests.q_open_road;
        if (s.flags.roadOpen) break;
        if (quest.status === 'locked') {
          this.panels.dialog('Fallen Tree', 'A storm-felled trunk blocks the road to Willowmere. Get your farm going first — sell some produce at the market stall and a work crew will be available.');
        } else if (s.coins < ROAD_CLEARING_COST) {
          this.panels.dialog('Fallen Tree', `A work crew will clear the trunk for ${ROAD_CLEARING_COST} coins. You have ${s.coins}.`);
        } else {
          this.panels.dialog('Fallen Tree', `Hire a work crew to clear the trunk and open the road to Willowmere village? It costs ${ROAD_CLEARING_COST} coins.`,
            [{ label: `Open the road (${ROAD_CLEARING_COST} coins)`, primary: true, action: () => this.openRoad() }, { label: 'Not yet' }]);
        }
        break;
      }
      case 'npc': {
        const id = String(this.target?.uid || '').split(':')[1];
        if (NPCS[id]) this.panels.talk(id);
        break;
      }
      case 'closed': {
        this.hud.toast(this.target?.label || 'Closed', 'warn');
        this.sfx.play('error');
        break;
      }
      case 'decor': {
        const rec = s.placed.find((r) => r.uid === this.target?.uid);
        if (!rec) break;
        const d = DECORATIONS[rec.type];
        this.panels.dialog(d.name, `Move it somewhere else, or pick it up for ${Math.floor(d.cost / 2)} coins.`,
          [{ label: 'Move it', primary: true, action: () => this.startMove(rec.uid) },
            { label: `Pick up (+${Math.floor(d.cost / 2)})`, action: () => this.pickUp(rec.uid) }, { label: 'Leave it' }]);
        break;
      }
      case 'garage':
        if (this.target?.uid) this.panels.garage(this.target.uid);
        break;
      case 'vehicle':
        this.panels.vehicle(String(this.target?.uid || '').split(':')[1]);
        break;
      case 'notice_board':
        this.panels.board();
        break;
      default:
    }
  }

  // ------------------------------------------------------------ vehicles
  enterVehicle(uid) {
    const v = Vehicles.findVehicle(this.state, uid);
    if (!v) return;
    this.panels.close(true);
    this.state.driving = uid;
    v.speed = 0;
    this.state.player.x = v.x;
    this.state.player.y = v.y;
    this.driveDist = 0;
    this.sfx.play('attach'); // engine catches
    for (let i = 0; i < 3; i++) this.effects.burst('smoke', v.x - Math.cos(v.heading) * 30, v.y - Math.sin(v.heading) * 30 - 26);
    this.hud.toast(v.fuel > 0 ? 'W / S drive · A / D steer · E use implement · F get off' : 'The tank is empty — get off and refuel', v.fuel > 0 ? 'info' : 'warn');
  }

  exitVehicle(force = false) {
    const v = this.drivingVehicle;
    if (!v) return;
    if (!force && Math.abs(v.speed) > 40) {
      this.hud.toast('Slow down before getting off', 'warn');
      return;
    }
    v.engaged = false;
    v.speed = 0;
    // step out on the first free side
    const half = { w: 13, h: 7 };
    const side = VEHICLES[v.type].width / 2 + 26;
    const perp = v.heading + Math.PI / 2;
    const tries = [[perp, side], [perp + Math.PI, side], [v.heading + Math.PI, VEHICLES[v.type].length / 2 + 30], [v.heading, VEHICLES[v.type].length / 2 + 30]];
    let spot = { x: v.x, y: v.y };
    for (const [ang, d] of tries) {
      const x = v.x + Math.cos(ang) * d;
      const y = v.y + Math.sin(ang) * d;
      if (!this.activeCollision.blocked({ x0: x - half.w, y0: y - half.h, x1: x + half.w, y1: y + half.h })) {
        spot = { x, y };
        break;
      }
    }
    this.state.driving = null;
    this.state.player.x = spot.x;
    this.state.player.y = spot.y;
    this.state.player.facing = 'down';
    this.sfx.play('click');
    this.autosave('vehicle');
  }

  toggleEngage() {
    const v = this.drivingVehicle;
    if (!v) return;
    if (!v.mount.front) {
      this.hud.toast('No implement fitted — park at the garage and attach one', 'warn');
      this.sfx.play('error');
      return;
    }
    v.engaged = !v.engaged;
    this.hud.toast(v.engaged ? `${IMPLEMENTS[v.mount.front].name} working` : `${IMPLEMENTS[v.mount.front].name} stopped`, 'info');
    this.sfx.play('attach');
  }

  driveTarget() {
    const v = this.drivingVehicle;
    if (!v) return null;
    if (!v.mount.front) return { kind: 'drive', ok: false, label: 'No implement fitted — attach one at the garage' };
    const imp = IMPLEMENTS[v.mount.front];
    return { kind: 'drive', ok: true, label: v.engaged ? `Stop the ${imp.name.toLowerCase()}` : `Start the ${imp.name.toLowerCase()}` };
  }

  updateDriving(dt, paused) {
    const v = this.drivingVehicle;
    if (!v) return;
    const mv = paused ? { x: 0, y: 0 } : this.input.moveVector();
    const tx = Math.floor(v.x / TILE);
    const ty = Math.floor(v.y / TILE);
    const plotHere = PLOT_AT.get(`${tx},${ty}`);
    const soft = !!(plotHere && this.state.plots[plotHere.id]?.tilled);
    const r = Vehicles.stepVehicle(v, { throttle: -mv.y, steer: mv.x }, dt, {
      ground: groundFactor(v.x, v.y, soft),
      blocked: (box) => this.activeCollision.blocked(box),
    });
    const p = this.state.player;
    p.x = v.x;
    p.y = v.y;
    p.facing = Math.abs(Math.cos(v.heading)) > Math.abs(Math.sin(v.heading)) ? (Math.cos(v.heading) > 0 ? 'right' : 'left') : Math.sin(v.heading) > 0 ? 'down' : 'up';
    this.playerMoving = false;
    // distance driven becomes events (whole tiles), for quests and achievements
    this.driveDist = (this.driveDist || 0) + r.moved / TILE;
    if (this.driveDist >= 1) {
      const tiles = Math.floor(this.driveDist);
      this.driveDist -= tiles;
      this.bus.emit('drive', { qty: tiles });
    }
    // exhaust puffs from the back of a running tractor
    this.smokeTimer = (this.smokeTimer || 0) - dt;
    if (v.fuel > 0 && !paused && this.smokeTimer <= 0) {
      this.smokeTimer = 0.18 - Math.min(0.1, Math.abs(v.speed) / 1500);
      const back = VEHICLES[v.type].length * 0.32;
      this.effects.burst('smoke', v.x - Math.cos(v.heading) * back, v.y - Math.sin(v.heading) * back - 26);
    }
    if (r.bump > 2) {
      this.vibrate(40);
      this.sfx.play('error');
      this.effects.burst('dirt', v.x + Math.cos(v.heading) * 40, v.y + Math.sin(v.heading) * 40);
    }
    if (r.stalled && !this.stallWarned) {
      this.stallWarned = true;
      this.hud.toast('Out of fuel! Get off (F) and refuel', 'warn');
    } else if (!r.stalled && v.fuel > 0) this.stallWarned = false;
    if (v.fuel > 0 && v.fuel < Vehicles.tankSize(v) * 0.12 && !this.lowFuelWarned) {
      this.lowFuelWarned = true;
      this.hud.toast('Fuel is running low', 'warn');
    } else if (v.fuel > Vehicles.tankSize(v) * 0.2) this.lowFuelWarned = false;
    if (!paused) {
      const w = Vehicles.work(this.state, v, this.bus);
      if (w.count) {
        this.hud.cache.quests = null;
        this.workSfx = (this.workSfx || 0) - 1;
        const fx = { till: 'dirt', plant: 'seed', water: 'water', harvest: 'harvest' }[w.action];
        const a = Vehicles.workArea(v);
        this.effects.burst(fx, a.cx, a.cy);
        if (this.workSfx <= 0) {
          this.sfx.play({ till: 'till', plant: 'plant', water: 'water', harvest: 'harvest' }[w.action]);
          this.workSfx = 4;
        }
      }
    }
  }

  // ---- garage and vehicle transactions (called by the panels)
  vehicleResult(r, okText) {
    if (r.ok) {
      if (okText) this.hud.toast(typeof okText === 'function' ? okText(r) : okText, 'good');
      this.sfx.play('coin');
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.hud.cache.quests = null;
    this.panels.rerender();
    return r;
  }

  buyVehicle(type) { return this.vehicleResult(Vehicles.buyVehicle(this.state, type, this.bus), `${VEHICLES[type].name} delivered to the garage`); }
  buyImplement(id) { return this.vehicleResult(Vehicles.buyImplement(this.state, id, this.bus), `${IMPLEMENTS[id].name} bought`); }
  refuelVehicle(uid, field = false) { return this.vehicleResult(field ? Vehicles.fieldRefuel(this.state, uid, this.bus) : Vehicles.refuel(this.state, uid, undefined, this.bus), (r) => `Added ${r.units} fuel for ${r.cost} coins`); }
  repairVehicle(uid) { return this.vehicleResult(Vehicles.repair(this.state, uid, this.bus), (r) => `Repaired for ${r.cost} coins`); }
  upgradeVehicle(uid) { return this.vehicleResult(Vehicles.upgradeVehicle(this.state, uid, this.bus), 'Upgrade fitted'); }
  attachImplement(uid, id) { return this.clunk(this.vehicleResult(Vehicles.attach(this.state, uid, id), `${IMPLEMENTS[id].name} attached`)); }
  detachImplement(uid, slot) { return this.clunk(this.vehicleResult(Vehicles.detach(this.state, uid, slot), 'Detached')); }
  clunk(r) {
    if (r.ok) this.sfx.play('attach');
    return r;
  }
  unloadVehicle(uid) { return this.vehicleResult(Vehicles.unload(this.state, uid), (r) => `Unloaded ${r.moved} crops into your bag`); }
  towVehicle(uid) { return this.vehicleResult(Vehicles.sendToGarage(this.state, uid), 'Towed back to the garage'); }

  openRoad() {
    const s = this.state;
    if (s.flags.roadOpen) return;
    if (s.coins < ROAD_CLEARING_COST) {
      this.hud.toast('Not enough coins', 'warn');
      return;
    }
    s.coins -= ROAD_CLEARING_COST;
    s.flags.roadOpen = true;
    this.bus.emit('roadOpened', { cost: ROAD_CLEARING_COST });
    this.applyWorldFlags();
    this.effects.burst('dirt', 34.3 * TILE, 12.3 * TILE - 20);
    this.sfx.play('quest');
    this.hud.toast('The road to Willowmere is open!', 'good');
    this.autosave('road');
  }

  // The fallen tree and the invisible gate behind it exist only while the road is shut.
  applyWorldFlags() {
    const rb = this.world.roadBlock;
    const open = !!this.state.flags.roadOpen;
    if (rb && rb.open !== open) {
      rb.open = open;
      const list = (arr, item) => {
        if (!item) return;
        const at = arr.indexOf(item);
        if (open && at >= 0) arr.splice(at, 1);
        else if (!open && at < 0) arr.push(item);
      };
      list(this.world.drawables, rb.drawable);
      list(this.world.colliders, rb.collider);
      list(this.world.colliders, rb.gate);
    }
    this.refreshColliders();
  }

  checkVillageVisit() {
    const s = this.state;
    if (s.flags.visitedVillage || s.player.x < (VILLAGE_X0 + 3) * TILE) return;
    s.flags.visitedVillage = true;
    this.bus.emit('visit', { id: 'village' });
    this.hud.toast('Welcome to Willowmere!', 'good');
  }

  // ---- village transactions (called by the panels)
  storeBuy(itemId, qty) {
    const r = Shops.storeBuy(this.state, itemId, qty, this.bus);
    if (!r.ok) {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    } else {
      this.sfx.play('coin');
      this.hud.toast(`Bought ${qty} ${getItem(itemId).name}`);
    }
    this.panels.rerender();
    return r;
  }

  traderSell(itemId, qty) {
    const r = Shops.traderSell(this.state, itemId, qty, this.bus);
    if (!r.ok) {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    } else {
      this.sfx.play('coin');
      this.hud.toast(`Sold for ${r.total} coins`, 'good');
    }
    this.panels.rerender();
    return r;
  }

  acceptOrder(id) {
    const r = Orders.accept(this.state, id, this.bus);
    this.hud.toast(r.ok ? 'Request accepted — bring the goods to them' : r.reason, r.ok ? 'good' : 'warn');
    this.sfx.play(r.ok ? 'click' : 'error');
    this.panels.rerender();
    return r;
  }

  deliverOrder(id, giver) {
    const r = Orders.deliver(this.state, id, giver, this.bus);
    if (r.ok) {
      this.sfx.play('quest');
      this.hud.toast(`Delivered! +${r.order.coins} coins, +${r.order.rep} friendship with ${NPCS[r.order.giver].name}`, 'good');
      this.autosave('deliver');
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
    return r;
  }

  giveGift(npcId, itemId) {
    const r = Relations.gift(this.state, npcId, itemId, this.bus);
    if (r.ok) {
      this.sfx.play('quest');
      const name = NPCS[npcId].name;
      this.hud.toast(`${name} ${r.liked ? 'loves' : 'thanks you for'} the ${getItem(itemId).name}! +${r.gained} friendship`, 'good');
      if (r.levelUp) this.hud.toast(`${name} now counts you as: ${r.levelUp}`, 'quest');
      this.autosave('gift');
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    return r;
  }

  clearScenery(index) {
    const r = Clearing.clear(this.state, index, this.bus);
    if (!r.ok) {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
      return;
    }
    this.applyCleared();
    this.effects.burst('dirt', r.info.x * TILE, r.info.y * TILE - 20);
    this.sfx.play('till');
    this.hud.toast(`Cleared the ${r.info.name}`, 'good');
    this.autosave('clear');
  }

  // Make the world's drawables and colliders match state.cleared (also used to
  // restore scenery when a different save or a new game starts).
  applyCleared() {
    const w = this.world;
    const cleared = new Set(this.state.cleared);
    for (const [i, sc] of w.scenery) {
      const gone = cleared.has(i);
      if (gone === !!sc.gone) continue;
      sc.gone = gone;
      const list = (arr, item) => {
        const at = arr.indexOf(item);
        if (gone && at >= 0) arr.splice(at, 1);
        else if (!gone && at < 0) arr.push(item);
      };
      list(w.drawables, sc.drawable);
      if (sc.collider) list(w.colliders, sc.collider);
    }
    this.refreshColliders();
  }

  mailText() {
    const q = this.state.quests;
    if (q.q_breaking_ground.status === 'active') {
      return 'Welcome to the farm!\n\nThe garden plots are inside the fence south-west of the cottage. Face a plot and press E to till it, then again to plant carrot seeds, then water them. Your watering can refills at the well or the water barrel.';
    }
    if (q.q_first_harvest.status === 'active') return 'Crops only grow while their soil is moist (dark soil). If the soil dries out, water again. Sleeping in the cottage passes the night quickly.';
    if (q.q_market_day.status === 'active') return 'The market stall is at the east end of the path. Sell your produce there and buy new seeds with the coins.';
    if (q.q_room_to_grow.status === 'active') return 'Your garden has room to grow: the overgrown south bed can be cleared — check the sign by the garden fence.';
    if (q.q_storage.status === 'active') return 'Running out of room in your bag? The building planner at the workbench can put up a storage shed. Builders need a few hours to finish it.';
    if (q.q_home_improvements.status === 'active') return 'Every building on the farm can be improved: a bigger cottage, a well that waters for you, a better workshop and a busier market stall. Visit the workbench.';
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

  acceptQuest(id) {
    const r = Quests.accept(this.state, id, this.bus);
    if (!r.ok) this.hud.toast(r.reason, 'warn');
    this.hud.cache.quests = null;
    this.panels.rerender();
    return r;
  }

  abandonQuest(id) {
    const r = Quests.abandon(this.state, id, this.bus);
    this.hud.toast(r.ok ? 'Quest put down — you can pick it up again from the journal' : r.reason, r.ok ? 'info' : 'warn');
    this.hud.cache.quests = null;
    this.panels.rerender();
    return r;
  }

  claimAchievement(id) {
    const r = Progress.claimAchievement(this.state, id, this.bus);
    if (r.ok) {
      this.sfx.play('coin');
      this.hud.toast(`${ACHIEVEMENTS_BY_ID[id].name}: +${r.reward.coins} coins, +${r.reward.xp} XP`, 'good');
      this.autosave('achievement');
    } else this.hud.toast(r.reason, 'warn');
    this.panels.rerender();
    return r;
  }

  claimQuest(id) {
    const r = Quests.claim(this.state, id, this.bus);
    if (r.ok) {
      this.sfx.play('coin');
      this.hud.toast(`Reward: ${Quests.rewardText(r.reward)} · +${r.xp} XP`, 'good');
      this.autosave('quest');
    } else this.hud.toast(r.reason, 'warn');
    this.hud.cache.quests = null;
    this.panels.rerender();
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

  // ------------------------------------------------------------ livestock
  interactAnimal(t) {
    const a = this.state.animals.find((x) => x.uid === t.uid);
    const ac = this.actors.get(t.uid);
    if (!a) return;
    if (t.action === 'collect') return this.collectFrom(a.uid, ac);
    if (t.action === 'feed') return this.feedHome(a.home);
    if (t.action === 'pet') {
      const r = Animals.pet(this.state, a.uid, this.bus);
      if (r.ok) {
        this.sfx.play(ANIMAL_VOICE[a.species] || 'click');
        if (ac) this.effects.burst('heart', ac.x, ac.y - SPECIES[a.species].drawHeight + 10);
        this.hud.toast(`${a.name} loves the attention`);
      } else this.hud.toast(r.reason, 'warn');
      return;
    }
    this.hud.toast(t.label);
  }

  collectFrom(uid, ac = this.actors.get(uid)) {
    const a0 = this.state.animals.find((x) => x.uid === uid);
    const r = Animals.collect(this.state, uid, this.bus);
    if (r.ok) {
      this.sfx.play('harvest');
      this.sfx.play(ANIMAL_VOICE[a0.species] || 'harvest');
      this.action = { kind: 'carry', t: 0, dur: ACTION_TIME * 1.4 };
      if (ac) {
        this.effects.burst('harvest', ac.x, ac.y - 20);
        this.effects.text(`+${productLabel(a0.species, r.qty)}`, ac.x, ac.y - 50, '#fff4c2');
      }
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
    return r;
  }

  collectHome(homeUid) {
    const r = Animals.collectYard(this.state, homeUid, this.bus);
    if (r.ok) {
      this.sfx.play('harvest');
      const parts = Object.entries(r.got).map(([id, q]) => `${q} ${getItem(id).name.toLowerCase()}`);
      this.hud.toast(`Collected ${parts.join(', ')}${r.blocked ? ` — ${r.blocked}` : ''}`, 'good');
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
  }

  feedHome(homeUid) {
    const r = Animals.feedYard(this.state, homeUid, this.bus);
    if (r.ok) {
      this.sfx.play('plant');
      const one = this.state.animals.find((x) => x.home === homeUid);
      if (one) this.sfx.play(ANIMAL_VOICE[one.species]);
      for (const a of this.state.animals) {
        const ac = a.home === homeUid && this.actors.get(a.uid);
        if (ac) this.effects.burst('feed', ac.x, ac.y - 6);
      }
      this.hud.toast(`Fed ${r.fed} ${r.fed === 1 ? 'animal' : 'animals'}${r.short ? ` — out of feed for ${r.short}` : ''}`, 'good');
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
  }

  buyAnimal(speciesId, homeUid) {
    const r = Animals.buy(this.state, speciesId, homeUid, this.bus);
    if (r.ok) this.sfx.play('coin');
    else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
  }

  sellAnimal(uid) {
    const r = Animals.sell(this.state, uid, this.bus);
    if (r.ok) {
      this.sfx.play('coin');
      this.hud.toast(`Sold ${r.animal.name} for ${r.value} coins`, 'good');
    } else this.hud.toast(r.reason, 'warn');
    this.panels.rerender();
  }

  // ------------------------------------------------------------ storage
  bagSlots() {
    return Buildings.bagSlots(this.state);
  }

  storeItem(uid, id, qty) {
    if (qty <= 0) return;
    const r = Storage.deposit(this.state, uid, id, qty, this.bus);
    if (!r.ok) {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    } else this.sfx.play('click');
    this.panels.rerender();
  }

  takeItem(uid, id, qty) {
    if (qty <= 0) return;
    const r = Storage.withdraw(this.state, uid, id, qty, this.bus);
    if (!r.ok) {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    } else this.sfx.play('click');
    this.panels.rerender();
  }

  // ------------------------------------------------------------ buildings
  startUpgrade(target) {
    const r = Buildings.startUpgrade(this.state, target, this.bus);
    if (r.ok) {
      this.sfx.play('coin');
      this.hud.toast(`Builders are on it — ready at ${formatClock(r.job.end)}`, 'good');
      this.autosave('upgrade');
    } else {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
    }
    this.panels.rerender();
  }

  startPlacement(type) {
    if (this.drivingVehicle) {
      this.hud.toast('Get off the tractor first', 'warn');
      return;
    }
    const info = Buildings.placeableInfo(this.state, type);
    if (info.state !== 'available') {
      this.hud.toast(info.reason || 'Cannot build that', 'warn');
      return;
    }
    this.panels.close(true);
    this.placement = { type, x: 0, y: 0, valid: false };
    this.updatePlacement();
    document.getElementById('btn-cancel').hidden = false;
    this.hud.toast('Walk to choose a spot · E / A to place · Esc to cancel');
  }

  updatePlacement() {
    const pl = this.placement;
    const p = this.state.player;
    const [fx, fy] = FACING[p.facing];
    // Put the whole reserved area (building plus pasture) just in front of the player.
    const rel = Buildings.areaRect(pl.type, 0, 0);
    const w = rel.x1 - rel.x0;
    const h = rel.y1 - rel.y0;
    const dist = (fy !== 0 ? h : w) / 2 + 0.6;
    const cx = p.x / TILE + fx * dist;
    const cy = p.y / TILE + fy * dist - 0.3;
    pl.x = Math.round((cx - (rel.x0 + rel.x1) / 2) * 4) / 4;
    pl.y = Math.round((cy - (rel.y0 + rel.y1) / 2) * 4) / 4;
    pl.check = this.buildCheck(Buildings.areaRect(pl.type, pl.x, pl.y));
    // Near miss: slide to the closest spot that works (within ~2 tiles) so a
    // few pixels of overlap never makes the player hunt for the exact tile.
    if (!pl.check.ok) {
      const snap = this.nearestBuildable(pl.type, pl.x, pl.y);
      if (snap) {
        pl.x = snap.x;
        pl.y = snap.y;
        pl.check = snap.check;
      }
    }
    pl.valid = pl.check.ok;
  }

  nearestBuildable(type, x, y, reach = 2) {
    const offsets = [];
    for (let dx = -reach; dx <= reach; dx += 0.25) for (let dy = -reach; dy <= reach; dy += 0.25) offsets.push([dx, dy, dx * dx + dy * dy]);
    offsets.sort((a, b) => a[2] - b[2]);
    for (const [dx, dy, d2] of offsets) {
      if (d2 > reach * reach) break;
      const check = this.buildCheck(Buildings.areaRect(type, x + dx, y + dy));
      if (check.ok) return { x: x + dx, y: y + dy, check };
    }
    return null;
  }

  // Why a footprint (tile rect) can't be built on, or { ok: true }. It must be
  // inside the bounds and clear of colliders, no-build zones (garden, creek,
  // paths), doors and the player. `rects` are the offending things in px, so
  // the renderer can outline them; `text` is shown to the player.
  buildCheck(rt) {
    const r = { x0: rt.x0 * TILE, y0: rt.y0 * TILE, x1: rt.x1 * TILE, y1: rt.y1 * TILE };
    const pad = { x0: r.x0 - 6, y0: r.y0 - 6, x1: r.x1 + 6, y1: r.y1 + 6 };
    const b = this.world.bounds;
    if (r.x0 < b.x0 || r.y0 < b.y0 || r.x1 > b.x1 || r.y1 > b.y1) {
      return { ok: false, rects: [], text: 'That would hang over the edge of the map — move the other way' };
    }
    const hits = this.farmCollision.rects.filter((c) => overlaps(pad, c));
    if (hits.length) {
      const owner = (c) => [...this.world.scenery.entries()].find(([, sc]) => !sc.gone && sc.collider === c);
      const clearable = hits.map((c) => { const o = owner(c); return o && Clearing.clearInfo(o[0]); }).find(Boolean);
      const text = clearable ? `A ${clearable.name} is in the way — cancel and clear it first` : 'Something is in the way — try another spot';
      return { ok: false, rects: hits, text };
    }
    const inGarden = DECORATIONS[this.placement?.type]?.inGarden;
    if (inGarden) {
      const plot = PLOTS.find((d) => overlaps(r, { x0: d.tx * TILE, y0: d.ty * TILE, x1: (d.tx + 1) * TILE, y1: (d.ty + 1) * TILE }));
      if (plot) return { ok: false, rects: [{ x0: plot.tx * TILE, y0: plot.ty * TILE, x1: (plot.tx + 1) * TILE, y1: (plot.ty + 1) * TILE }], text: 'Not on a plot — put it on the path between the beds' };
    }
    const zones = this.world.noBuild.filter((z) => overlaps(r, z) && !(inGarden && z.name === 'the garden'));
    if (zones.length) return { ok: false, rects: [], text: `Can't build on ${zones[0].name} — try another spot` };
    const near = (x, y) => x > r.x0 - TILE * 0.7 && x < r.x1 + TILE * 0.7 && y > r.y0 - TILE * 0.5 && y < r.y1 + TILE * 0.9;
    if (this.world.interactables.some((it) => near(it.x, it.y))) {
      return { ok: false, rects: [], text: 'Too close to a door, sign or well — leave it some room' };
    }
    const p = this.state.player;
    if (overlaps(r, { x0: p.x - 16, y0: p.y - 10, x1: p.x + 16, y1: p.y + 6 })) {
      return { ok: false, rects: [], text: "You're standing in the way — step back" };
    }
    return { ok: true, rects: [], text: '' };
  }

  isBuildable(rt) {
    return this.buildCheck(rt).ok;
  }

  placementTarget() {
    const pl = this.placement;
    const name = (DECORATIONS[pl.type] || BUILDINGS[pl.type]).name;
    if (pl.moveUid) return { kind: 'placement', ok: pl.valid, label: pl.valid ? `Move ${name} here` : pl.check?.text || "Can't move it there" };
    const cost = Buildings.placeableInfo(this.state, pl.type).cost;
    return { kind: 'placement', ok: pl.valid, label: pl.valid ? `Place ${name} (${cost} coins)` : pl.check?.text || "Can't build here — try another spot" };
  }

  // Pick a finished building or a decoration up and put it somewhere else (free).
  startMove(uid) {
    const rec = this.state.placed.find((p) => p.uid === uid);
    if (!rec) return;
    if (this.drivingVehicle) {
      this.hud.toast('Get off the tractor first', 'warn');
      return;
    }
    if (rec.kind === 'building' && (rec.level < 1 || rec.job)) {
      this.hud.toast('Wait until the builders have finished', 'warn');
      return;
    }
    this.panels.close(true);
    this.placement = { type: rec.type, x: rec.x, y: rec.y, valid: true, moveUid: uid };
    this.refreshColliders();
    this.updatePlacement();
    document.getElementById('btn-cancel').hidden = false;
    this.hud.toast('Walk to the new spot · E / A to move it here · Esc to cancel');
  }

  confirmMove() {
    const pl = this.placement;
    if (!pl.valid) {
      this.hud.toast(pl.check?.text || "Can't move it there", 'warn');
      this.sfx.play('error');
      return;
    }
    const rec = this.state.placed.find((p) => p.uid === pl.moveUid);
    if (rec) {
      rec.x = Math.round(pl.x * 100) / 100;
      rec.y = Math.round(pl.y * 100) / 100;
    }
    this.cancelPlacement();
    this.actors.map.clear(); // animals come out inside the new pasture
    this.refreshColliders();
    this.effects.burst('dirt', pl.x * TILE, pl.y * TILE);
    this.sfx.play('till');
    this.hud.toast(`${(DECORATIONS[pl.type] || BUILDINGS[pl.type]).name} moved`, 'good');
    this.autosave('move');
  }

  // Take a decoration back for half its price.
  pickUp(uid) {
    const i = this.state.placed.findIndex((p) => p.uid === uid && p.kind === 'decor');
    if (i < 0) return;
    const rec = this.state.placed[i];
    const refund = Math.floor(DECORATIONS[rec.type].cost / 2);
    this.state.placed.splice(i, 1);
    this.state.coins += refund;
    this.refreshColliders();
    this.sfx.play('coin');
    this.hud.toast(`${DECORATIONS[rec.type].name} picked up (+${refund} coins)`, 'good');
    this.autosave('pickup');
  }

  confirmPlacement() {
    if (this.placement.moveUid) {
      this.confirmMove();
      return;
    }
    const pl = this.placement;
    const r = Buildings.place(this.state, pl.type, pl.x, pl.y, (rect) => this.isBuildable(rect), this.bus);
    if (!r.ok) {
      this.hud.toast(r.reason, 'warn');
      this.sfx.play('error');
      return;
    }
    this.cancelPlacement();
    this.refreshColliders();
    this.effects.burst('dirt', pl.x * TILE, pl.y * TILE);
    this.sfx.play(DECORATIONS[pl.type] ? 'till' : 'build'); // hammering for buildings
    const name = (DECORATIONS[pl.type] || BUILDINGS[pl.type]).name;
    this.hud.toast(r.record.job ? `${name} construction started — ready at ${formatClock(r.record.job.end)}` : `${name} placed`, 'good');
    this.autosave('build');
  }

  cancelPlacement() {
    const moved = this.placement?.moveUid;
    this.placement = null;
    if (moved) this.refreshColliders();
    document.getElementById('btn-cancel').hidden = true;
  }

  // ------------------------------------------------------------ scenes
  setCameraWorld() {
    const room = this.interior;
    this.camera.worldW = room ? room.w : WORLD_W;
    this.camera.worldH = room ? room.h : WORLD_H;
    this.camera.setFit(room ? { w: room.w, h: room.h } : null);
  }

  transition(fn) {
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    this.running = false;
    setTimeout(() => {
      fn();
      this.setCameraWorld();
      this.camera.follow(this.state.player.x, this.state.player.y - 40, 0, true);
      this.running = true;
      fade.classList.remove('on');
    }, 450);
  }

  enterInterior(id) {
    this.sfx.play('door');
    this.transition(() => {
      const room = this.interiors[id];
      this.state.player.scene = id;
      this.state.player.x = room.spawn[0];
      this.state.player.y = room.spawn[1];
      this.state.player.facing = 'up';
    });
  }

  leaveInterior() {
    this.sfx.play('door');
    this.transition(() => {
      const door = this.world.interactables.find((i) => i.kind === 'house');
      this.state.player.scene = 'farm';
      this.state.player.x = door.x;
      this.state.player.y = door.y + TILE * 0.35;
      this.state.player.facing = 'down';
    });
  }

  sleep() {
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    this.running = false;
    setTimeout(() => {
      sleep(this.state, this.bus);
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
    const when = `Day ${clock(this.state.time).day}, ${formatClock(this.state.time)}`;
    if (r.ok) this.hud.toast(`Game saved — ${when}`, 'good');
    // Show the result inside the pause menu too, where the player is looking.
    if (this.panels.current?.title === 'Paused') this.panels.menu({ ok: r.ok, text: r.ok ? `Saved ✓  ${when}` : r.reason });
  }

  toggleMute() {
    this.state.settings.muted = !this.state.settings.muted;
    this.applySettings();
  }

  // Stars and a ring around the player: unlocks and level-ups.
  celebrate(color) {
    const p = this.state.player;
    this.effects.ring(p.x, p.y - 10, color);
    this.effects.burst('sparkle', p.x, p.y - 60);
  }

  // Where a building stands (bottom centre, px): placed ones by uid, fixed ones from the map.
  buildingPos(id, uid) {
    if (uid) {
      const rec = this.state.placed.find((p) => p.uid === uid);
      return rec ? { x: rec.x * TILE, y: rec.y * TILE } : null;
    }
    const d = this.world.drawables.find((x) => x.building === id);
    return d ? { x: d.x, y: d.y } : null;
  }

  // A short buzz on phones that support it (Settings > Vibration).
  vibrate(pattern) {
    if (!this.state?.settings.vibration) return;
    try {
      // the Android app has a native bridge (WebViews ignore navigator.vibrate)
      if (window.AndroidHaptics) window.AndroidHaptics.vibrate(Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern);
      else navigator.vibrate?.(pattern);
    } catch { /* not supported */ }
  }

  // Music follows where you are, ambience follows the weather, the engine follows the throttle.
  updateAudio() {
    const s = this.state;
    const indoors = !!this.interior;
    this.sfx.setMusic(!indoors && s.player.x > VILLAGE_X0 * TILE ? 'music_village' : 'music_farm');
    this.sfx.setAmbience(indoors ? null : isRaining(s.time) ? 'ambience_rain' : 'ambience_farm');
    const v = this.drivingVehicle;
    this.sfx.setEngine(v && v.fuel > 0 ? Math.min(1, Math.abs(v.speed) / Vehicles.topSpeed(v)) : null);
  }

  // Sound, camera distance and touch-control size from state.settings.
  applySettings() {
    const st = this.state.settings;
    this.sfx.muted = st.muted;
    this.sfx.volume = st.volume;
    this.sfx.musicVolume = st.music;
    this.sfx.ambienceVolume = st.ambience;
    this.sfx.apply();
    const zoom = ZOOM_FACTORS[st.zoom] || 1;
    document.body.classList.toggle('big-controls', !!st.bigControls);
    if (this.camera.zoom !== zoom) {
      this.camera.zoom = zoom;
      this.renderer.resize(window.innerWidth, window.innerHeight, this.camera);
      if (this.running) this.camera.follow(this.state.player.x, this.state.player.y - 40, 0, true);
    }
  }

  changeSetting(key, value, save = true) {
    this.state.settings[key] = value;
    this.applySettings();
    if (save) this.autosave('settings');
  }

  // Go back to the last save (or its backup). Progress since then is lost.
  loadLastSave() {
    const r = loadGame(this.storage);
    if (!r.ok) {
      this.hud.toast(r.reason, 'warn');
      return r;
    }
    this.stop();
    this.start(r.state, { isNew: false });
    if (r.recovered) this.hud.toast('The latest save was damaged, so the backup was loaded', 'warn');
    return r;
  }

  quitToTitle() {
    this.autosave('quit');
    this.stop();
    this.onQuit?.();
  }

  showIntro(noSaving = false) {
    this.state.flags.introSeen = true;
    this.panels.dialog('Welcome to Farmstead',
      'You have inherited a small cottage, a fenced garden and a handful of carrot seeds.\n\n' +
      'Walk with WASD / arrow keys (or the on-screen stick) and press E / Space (or the action button) to interact with whatever you face.\n\n' +
      'Start with the quest on the left: till, plant and water the garden plots.' + (noSaving ? `\n\n${NO_SAVING_TEXT}` : ''),
      [{ label: "Let's farm!", primary: true }]);
  }
}
