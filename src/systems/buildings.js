import {
  BUILDINGS, DECORATIONS, BAG_SLOTS_BY_HOUSE_LEVEL, CAN_CAPACITY_BY_SHED_LEVEL,
  SELL_MULTIPLIER_BY_MARKET_LEVEL, STORAGE_SLOTS_BY_LEVEL,
} from '../data/buildings.js';
import { PLOTS } from '../data/world.js';
import { CROPS } from '../data/crops.js';
import { WATER_DURATION } from '../data/crops.js';
import { NULL_BUS } from '../core/events.js';
import { isRequirementMet, requirementText } from './economy.js';
import { pastureOf } from './pasture.js';
import { isPlotAvailable } from './farming.js';

// Building levels, construction jobs, placement and level effects.
// Fixed farm buildings live in state.buildings[id] = { level, job }.
// Player-placed objects live in state.placed[] = { uid, kind, type, x, y, level, job, storage? }.
// A job is { toLevel, start, end } in game minutes on the shared clock.

export const FIXED_BUILDINGS = ['house', 'well', 'tool_shed', 'market_stall'];

export function createBuildingState() {
  return Object.fromEntries(FIXED_BUILDINGS.map((id) => [id, { level: 1, job: null }]));
}

export function buildingLevel(state, id) {
  return state.buildings[id]?.level || 0;
}

export const bagSlots = (state) => BAG_SLOTS_BY_HOUSE_LEVEL[buildingLevel(state, 'house') - 1];
export const canCapacity = (state) => CAN_CAPACITY_BY_SHED_LEVEL[buildingLevel(state, 'tool_shed') - 1];
export const sellMultiplier = (state) => SELL_MULTIPLIER_BY_MARKET_LEVEL[buildingLevel(state, 'market_stall') - 1];
export const storageSlots = (record) => STORAGE_SLOTS_BY_LEVEL[Math.max(0, record.level - 1)];
export const hasSprinklerCan = (state) => buildingLevel(state, 'tool_shed') >= 3;

// Resolve a target ({ id } for fixed buildings or { uid } for placed ones).
function record(state, target) {
  if (target.uid) return state.placed.find((p) => p.uid === target.uid) || null;
  return state.buildings[target.id] || null;
}
function typeOf(state, target) {
  return target.uid ? record(state, target)?.type : target.id;
}

export function jobProgress(job, time) {
  if (!job) return 1;
  return Math.min(1, Math.max(0, (time - job.start) / (job.end - job.start)));
}

// What happens if the player tries to upgrade this building now.
export function upgradeInfo(state, target) {
  const rec = record(state, target);
  const def = BUILDINGS[typeOf(state, target)];
  if (!rec || !def) return { state: 'missing' };
  const current = def.levels[rec.level - 1] || null;
  if (rec.job) return { state: 'building', def, rec, current, next: def.levels[rec.job.toLevel - 1], job: rec.job };
  const next = def.levels[rec.level];
  if (!next) return { state: 'max', def, rec, current };
  if (!isRequirementMet(state, next.requires)) return { state: 'locked', def, rec, current, next, reason: requirementText(next.requires) };
  if (state.coins < next.cost) return { state: 'unaffordable', def, rec, current, next, reason: `Needs ${next.cost} coins` };
  return { state: 'available', def, rec, current, next };
}

export function startUpgrade(state, target, bus = NULL_BUS) {
  const info = upgradeInfo(state, target);
  if (info.state !== 'available') {
    const reasons = { building: 'Already under construction', max: 'Already at the highest level', missing: 'Unknown building' };
    return { ok: false, reason: info.reason || reasons[info.state] };
  }
  state.coins -= info.next.cost;
  info.rec.job = { toLevel: info.rec.level + 1, start: state.time, end: state.time + info.next.buildMinutes };
  bus.emit('constructionStarted', { id: info.def.id, level: info.rec.job.toLevel });
  return { ok: true, job: info.rec.job };
}

// Status of building something new from the planner.
export function placeableInfo(state, type) {
  const deco = DECORATIONS[type];
  if (deco) return { state: state.coins >= deco.cost ? 'available' : 'unaffordable', cost: deco.cost, def: deco, kind: 'decor', reason: `Needs ${deco.cost} coins` };
  const def = BUILDINGS[type];
  if (!def?.placeable) return { state: 'missing' };
  const first = def.levels[0];
  if (!isRequirementMet(state, first.requires)) return { state: 'locked', cost: first.cost, def, kind: 'building', reason: requirementText(first.requires) };
  if (state.coins < first.cost) return { state: 'unaffordable', cost: first.cost, def, kind: 'building', reason: `Needs ${first.cost} coins` };
  return { state: 'available', cost: first.cost, def, kind: 'building' };
}

// Collision footprint (tiles) of a decoration, or of a building at `level`.
export function footprintSize(type, level = 1) {
  if (DECORATIONS[type]) return DECORATIONS[type].footprint;
  const def = BUILDINGS[type];
  return def.levels[Math.max(1, level) - 1].footprint || def.footprint;
}

export function footprintRect(type, x, y, level = 1) {
  const fp = footprintSize(type, level);
  return { x0: x - fp[0] / 2, y0: y - fp[1], x1: x + fp[0] / 2, y1: y };
}

// Everything a placed object reserves: the building at its largest size plus,
// for livestock buildings, the whole pasture. Used to validate placement.
export function areaRect(type, x, y) {
  const def = BUILDINGS[type];
  const base = footprintRect(type, x, y, def ? def.levels.length : 1);
  const g = pastureOf(type, x, y);
  if (!g) return base;
  return {
    x0: Math.min(base.x0, g.rect.x0), y0: Math.min(base.y0, g.rect.y0),
    x1: Math.max(base.x1, g.rect.x1), y1: Math.max(base.y1, g.rect.y1),
  };
}

// Place a building/decoration at tile coords (x, y = bottom-centre anchor).
// `isFree(rect)` is supplied by the world (collision + no-build zones).
export function place(state, type, x, y, isFree, bus = NULL_BUS) {
  const info = placeableInfo(state, type);
  if (info.state !== 'available') return { ok: false, reason: info.reason || 'Cannot build that' };
  if (!isFree(areaRect(type, x, y))) return { ok: false, reason: "Can't build there" };
  state.coins -= info.cost;
  state.nextUid = (state.nextUid || 1) + 1;
  const rec = { uid: `p${state.nextUid}`, kind: info.kind, type, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  if (info.kind === 'building') {
    rec.level = 0;
    rec.job = { toLevel: 1, start: state.time, end: state.time + info.def.levels[0].buildMinutes };
    rec.storage = {};
  } else {
    rec.level = 1;
    rec.job = null;
  }
  state.placed.push(rec);
  bus.emit('placed', { id: type, uid: rec.uid });
  if (info.kind === 'decor') bus.emit('constructed', { id: type, level: 1, uid: rec.uid });
  return { ok: true, record: rec };
}

// Finish any construction job whose end time has passed.
export function tickConstruction(state, bus = NULL_BUS) {
  const finish = (rec, id) => {
    if (!rec.job || state.time < rec.job.end) return;
    rec.level = rec.job.toLevel;
    rec.job = null;
    applyLevelEffects(state);
    bus.emit('constructed', { id, level: rec.level, uid: rec.uid });
  };
  for (const id of FIXED_BUILDINGS) finish(state.buildings[id], id);
  for (const p of state.placed) if (p.kind === 'building') finish(p, p.type);
}

// Keep derived values (watering-can capacity) in sync with building levels.
export function applyLevelEffects(state) {
  const cap = canCapacity(state);
  if (state.can.capacity !== cap) {
    state.can.capacity = cap;
    state.can.water = cap;
  }
}

// 6:00 AM: an upgraded well waters plots automatically.
export function morning(state, bus = NULL_BUS) {
  const lvl = buildingLevel(state, 'well');
  if (lvl < 2) return 0;
  let n = 0;
  for (const def of PLOTS) {
    if (lvl === 2 && def.group !== 'starter') continue;
    if (!isPlotAvailable(state, def.id)) continue;
    const plot = state.plots[def.id];
    if (!plot.tilled || !plot.crop || plot.growth >= CROPS[plot.crop].growMinutes) continue;
    plot.moistUntil = Math.max(plot.moistUntil, state.time + WATER_DURATION);
    n++;
  }
  if (n) bus.emit('autoWatered', { count: n });
  return n;
}

// The sprite to draw for a building record right now.
export function spriteFor(state, type, rec, stages) {
  const def = BUILDINGS[type];
  if (rec.job) {
    const p = jobProgress(rec.job, state.time);
    const target = def.levels[rec.job.toLevel - 1];
    return { sprite: stages[Math.min(stages.length - 1, Math.floor(p * stages.length))], w: target.w * 0.9, constructing: true, progress: p };
  }
  const lvl = def.levels[rec.level - 1];
  return { sprite: lvl.sprite, w: lvl.w, constructing: false };
}
