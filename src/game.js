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
import { CollisionWorld, overlaps } from './world/collision.js';
import { buildInterior, placedColliders } from './world/layout.js';
import * as Buildings from './systems/buildings.js';
import * as Storage from './systems/storage.js';
import * as Animals from './systems/animals.js';
import * as Clearing from './systems/clearing.js';
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
import { Camera } from './world/camera.js';
import { Effects } from './render/effects.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';

const FACING = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const PLOT_AT = new Map(PLOTS.map((p) => [`${p.tx},${p.ty}`, p]));
const FEET = { w: 13, h: 7 }; // half-size of the player's collision box (px)
const ACTION_TIME = 0.38;
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
    this.bus.on('questComplete', ({ id }) => {
      const q = Quests.trackedQuests(this.state).find((t) => t.def.id === id);
      this.hud.toast(`Quest complete: ${q?.def.title ?? id} — claim your reward!`, 'quest');
      this.sfx.play('quest');
    });
    this.bus.on('questStarted', ({ id }) => {
      const q = Quests.trackedQuests(this.state).find((t) => t.def.id === id);
      if (q) this.hud.toast(`New quest: ${q.def.title}`, 'info');
    });
    this.bus.on('constructed', ({ id, level, uid }) => {
      if (DECORATIONS[id]) return;
      const name = BUILDINGS[id].name;
      this.hud.toast(level === 1 && uid ? `${name} finished!` : `${name} upgraded to level ${level}!`, 'good');
      this.sfx.play('quest');
      this.refreshColliders();
      this.panels.rerender();
    });
    this.bus.on('buyAnimal', ({ species }) => this.hud.toast(`${SPECIES[species].name} bought`, 'good'));
    this.bus.on('autoWatered', ({ count }) => this.hud.toast(`The well watered ${count} plot${count === 1 ? '' : 's'} this morning`));
  }

  // Current interior scene, or null when outdoors.
  get interior() {
    return this.state?.player.scene === 'house' ? this.interiors.house : null;
  }

  // Static colliders plus everything the player has placed.
  refreshColliders() {
    this.farmCollision = new CollisionWorld(this.world.bounds, [...this.world.colliders, ...placedColliders(this.state)]);
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
    this.sfx.muted = state.settings.muted;
    this.running = true;
    this.placement = null;
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
    const mv = paused || this.action ? { x: 0, y: 0 } : this.input.moveVector();
    this.playerMoving = Math.hypot(mv.x, mv.y) > 0.05;
    if (this.playerMoving) {
      if (Math.abs(mv.x) > Math.abs(mv.y) * 1.05) p.facing = mv.x > 0 ? 'right' : 'left';
      else p.facing = mv.y > 0 ? 'down' : 'up';
      const next = this.activeCollision.move(p, FEET, mv.x * PLAYER_SPEED * dt, mv.y * PLAYER_SPEED * dt);
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

    this.actors.sync(this.state);
    if (!paused) this.actors.update(dt);
    if (!this.interior) {
      this.npcs.sync(this.state);
      if (!paused) this.npcs.update(dt);
      this.checkVillageVisit();
    }
    if (this.placement) this.updatePlacement();
    this.target = paused ? null : this.placement ? this.placementTarget() : this.resolveTarget();
    // A tap that landed mid-action (or just before a target was in reach) is
    // kept for a moment and fires as soon as it can, so players never need to
    // hold or repeat the button.
    if (paused) this.actionBuffer = 0;
    else if (this.actionBuffer > 0) {
      this.actionBuffer -= dt;
      if (this.tryInteract()) this.actionBuffer = 0;
    }
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
    if (this.placement && (code === 'KeyE' || code === 'Space' || code === 'Action')) this.confirmPlacement();
    else if (code === 'KeyE' || code === 'Space' || code === 'Action') {
      if (!this.tryInteract()) this.actionBuffer = 0.5;
    }
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
        if (a.action === 'locked') return { kind: 'object', ...this.objectTarget('garden_sign', (def.tx + 0.5) * TILE, (def.ty + 0.9) * TILE) };
        return { kind: 'plot', id: def.id, tx: def.tx, ty: def.ty, label: a.label, ok: a.ok, action: a.action };
      }
    }
    const placed = this.state.placed
      .filter((r) => r.type === 'storage_shed' || BUILDINGS[r.type]?.livestock)
      .map((r) => (r.type === 'storage_shed'
        ? { id: r.uid, uid: r.uid, kind: 'storage', x: r.x * TILE, y: (r.y + 0.15) * TILE }
        : { id: r.uid, uid: r.uid, kind: 'livestock', x: r.x * TILE, y: (r.y + 0.75) * TILE }));
    const clearable = Clearing.clearables(this.state).map((c) => ({ kind: 'clear', uid: `scn${c.index}`, x: c.x * TILE, y: c.y * TILE + 6 }));
    const object = this.nearestInteractable([...this.world.interactables, ...placed, ...clearable, ...this.npcInteractables()]);
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
      garden_sign: s.unlocks.gardenExpansion ? 'South garden bed (owned)' : 'Expand the garden',
    };
    const ok = kind === 'closed' ? false : kind === 'clear' ? !!scn && s.coins >= scn.cost : kind === 'well' ? s.can.water < s.can.capacity : kind === 'storage' || kind === 'livestock' ? shed?.level >= 1 : true;
    return { objectKind: kind, x, y, label: labels[kind], ok };
  }

  // ------------------------------------------------------------ actions
  // Returns true if the press was used (even if the game answered "can't").
  tryInteract() {
    const t = this.target;
    if (!t || this.action) return false;
    if (t.kind === 'plot') this.interactPlot(t);
    else if (t.kind === 'animal') this.interactAnimal(t);
    else this.interactObject(t.objectKind);
    return true;
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
        this.panels.upgrade('gardenExpansion', 'Garden Expansion');
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
      case 'notice_board':
        this.panels.board();
        break;
      default:
    }
  }

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
        this.sfx.play('click');
        if (ac) this.effects.text('♥', ac.x, ac.y - SPECIES[a.species].drawHeight - 6, '#ff9fb2');
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
      this.action = { kind: 'harvest', t: 0, dur: ACTION_TIME };
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
    if (r.x0 < b.x0 || r.y0 < b.y0 + TILE || r.x1 > b.x1 || r.y1 > b.y1) {
      return { ok: false, rects: [], text: 'Too close to the edge of the map — face another way or move' };
    }
    const hits = this.farmCollision.rects.filter((c) => overlaps(pad, c));
    if (hits.length) {
      const owner = (c) => [...this.world.scenery.entries()].find(([, sc]) => !sc.gone && sc.collider === c);
      const clearable = hits.map((c) => { const o = owner(c); return o && Clearing.clearInfo(o[0]); }).find(Boolean);
      const text = clearable ? `A ${clearable.name} is in the way — cancel and clear it first` : 'Something is in the way — try another spot';
      return { ok: false, rects: hits, text };
    }
    const zones = this.world.noBuild.filter((z) => overlaps(r, z));
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
    const cost = Buildings.placeableInfo(this.state, pl.type).cost;
    return { kind: 'placement', ok: pl.valid, label: pl.valid ? `Place ${name} (${cost} coins)` : pl.check?.text || "Can't build here — try another spot" };
  }

  confirmPlacement() {
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
    this.sfx.play('till');
    const name = (DECORATIONS[pl.type] || BUILDINGS[pl.type]).name;
    this.hud.toast(r.record.job ? `${name} construction started — ready at ${formatClock(r.record.job.end)}` : `${name} placed`, 'good');
    this.autosave('build');
  }

  cancelPlacement() {
    this.placement = null;
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
    this.sfx.play('click');
    this.transition(() => {
      const room = this.interiors[id];
      this.state.player.scene = id;
      this.state.player.x = room.spawn[0];
      this.state.player.y = room.spawn[1];
      this.state.player.facing = 'up';
    });
  }

  leaveInterior() {
    this.sfx.play('click');
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
    this.sfx.muted = this.state.settings.muted;
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
