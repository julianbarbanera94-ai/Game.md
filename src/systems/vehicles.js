import { TILE } from '../config.js';
import {
  VEHICLES, IMPLEMENTS, UPGRADES, MAX_VEHICLES, GARAGE_FUEL_PRICE, FIELD_FUEL_PRICE, REPAIR_PRICE,
  WORK_FUEL_FACTOR, LOW_CONDITION, PARK_OFFSET,
} from '../data/vehicles.js';
import { PLOTS } from '../data/world.js';
import { CROPS } from '../data/crops.js';
import { getItem } from '../data/items.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import * as Farming from './farming.js';
import { bagSlots } from './buildings.js';
import { WATER_DURATION } from '../data/crops.js';
import { levelOf } from './level.js';
import { groundFactor } from './ground.js';

// Vehicle state lives in state.vehicles (one record each), state.owned.implements
// (ids) and state.driving (the uid being driven, or null).
//   { uid, type, x, y, heading (rad, 0 = east), speed, fuel, condition 0-100,
//     upgrade 0-2, mount: { front: implementId|null, rear: implementId|null },
//     cargo: { itemId: qty }, engaged }

export const vehicleDef = (v) => VEHICLES[v.type];
export const garageRecord = (state) => state.placed.find((p) => p.type === 'garage' && p.level >= 1) || null;
export const parkingSpot = (state) => {
  const g = garageRecord(state);
  return g ? { x: g.x * TILE, y: (g.y + PARK_OFFSET) * TILE } : null;
};
export const findVehicle = (state, uid) => state.vehicles.find((v) => v.uid === uid) || null;

// ---------------------------------------------------------------- derived stats
export function tankSize(v) {
  const up = v.upgrade > 0 ? UPGRADES[v.upgrade - 1].tank : 1;
  return Math.round(vehicleDef(v).fuelCap * up);
}
export function topSpeed(v) {
  const up = v.upgrade > 0 ? UPGRADES[v.upgrade - 1].speed : 1;
  const wear = v.condition >= LOW_CONDITION ? 1 : 0.4 + 0.6 * (v.condition / LOW_CONDITION);
  return vehicleDef(v).maxSpeed * up * wear;
}
export const cargoUsed = (v) => Object.values(v.cargo).reduce((n, q) => n + q, 0);
export const cargoCapacity = (v) => (v.mount.rear ? IMPLEMENTS[v.mount.rear].capacity : 0);
export const fuelPct = (v) => Math.round((v.fuel / tankSize(v)) * 100);

// ---------------------------------------------------------------- ownership
export function buyVehicle(state, type, bus = NULL_BUS) {
  const def = VEHICLES[type];
  const spot = parkingSpot(state);
  if (!def) return { ok: false, reason: 'Unknown vehicle' };
  if (!spot) return { ok: false, reason: 'Build a garage first' };
  if (levelOf(state) < def.level) return { ok: false, reason: `Needs farm level ${def.level}` };
  if (state.vehicles.length >= MAX_VEHICLES) return { ok: false, reason: `The garage only holds ${MAX_VEHICLES} vehicles` };
  if (state.coins < def.cost) return { ok: false, reason: 'Not enough coins' };
  state.coins -= def.cost;
  state.nextUid = (state.nextUid || 1) + 1;
  const stagger = state.vehicles.length * 70;
  const v = {
    uid: `v${state.nextUid}`, type, x: spot.x + stagger, y: spot.y, heading: Math.PI / 2, speed: 0,
    fuel: 0, condition: 100, upgrade: 0, mount: { front: null, rear: null }, cargo: {}, engaged: false,
  };
  v.fuel = Math.round(tankSize(v) * 0.5); // delivered half full
  state.vehicles.push(v);
  bus.emit('buyVehicle', { type, uid: v.uid, cost: def.cost });
  return { ok: true, vehicle: v };
}

export function buyImplement(state, id, bus = NULL_BUS) {
  const def = IMPLEMENTS[id];
  if (!def) return { ok: false, reason: 'Unknown implement' };
  if (!garageRecord(state)) return { ok: false, reason: 'Build a garage first' };
  if (state.owned.implements.includes(id)) return { ok: false, reason: 'You already own one' };
  if (state.coins < def.cost) return { ok: false, reason: 'Not enough coins' };
  state.coins -= def.cost;
  state.owned.implements.push(id);
  bus.emit('buyImplement', { id, cost: def.cost });
  return { ok: true };
}

export const mountedOn = (state, implementId) => state.vehicles.find((v) => v.mount.front === implementId || v.mount.rear === implementId) || null;

export function attach(state, uid, implementId) {
  const v = findVehicle(state, uid);
  const def = IMPLEMENTS[implementId];
  if (!v || !def) return { ok: false, reason: 'Unknown vehicle or implement' };
  if (!state.owned.implements.includes(implementId)) return { ok: false, reason: "You don't own that" };
  if (mountedOn(state, implementId)) return { ok: false, reason: 'It is already attached to a vehicle' };
  if (v.mount[def.slot]) return { ok: false, reason: `Detach the ${IMPLEMENTS[v.mount[def.slot]].name} first` };
  v.mount[def.slot] = implementId;
  return { ok: true };
}

export function detach(state, uid, slot) {
  const v = findVehicle(state, uid);
  if (!v || !v.mount[slot]) return { ok: false, reason: 'Nothing attached' };
  if (slot === 'rear' && cargoUsed(v) > 0) return { ok: false, reason: 'Unload the trailer first' };
  v.mount[slot] = null;
  if (slot === 'front') v.engaged = false;
  return { ok: true };
}

// ---------------------------------------------------------------- fuel and repairs
export function refuel(state, uid, price = GARAGE_FUEL_PRICE, bus = NULL_BUS) {
  const v = findVehicle(state, uid);
  if (!v) return { ok: false, reason: 'No such vehicle' };
  const missing = Math.ceil(tankSize(v) - v.fuel);
  if (missing <= 0) return { ok: false, reason: 'The tank is already full' };
  const afford = Math.floor(state.coins / price);
  const units = Math.min(missing, afford);
  if (units <= 0) return { ok: false, reason: `Fuel costs ${price} coins per unit` };
  state.coins -= units * price;
  v.fuel = Math.min(tankSize(v), v.fuel + units);
  bus.emit('refuelVehicle', { uid, units, cost: units * price });
  return { ok: true, units, cost: units * price, full: v.fuel >= tankSize(v) - 0.01 };
}

export const fieldRefuel = (state, uid, bus) => refuel(state, uid, FIELD_FUEL_PRICE, bus);
export const repairCost = (v) => Math.ceil((100 - v.condition) * REPAIR_PRICE);

export function repair(state, uid, bus = NULL_BUS) {
  const v = findVehicle(state, uid);
  if (!v) return { ok: false, reason: 'No such vehicle' };
  const cost = repairCost(v);
  if (cost <= 0) return { ok: false, reason: 'It is in perfect condition' };
  if (state.coins < cost) return { ok: false, reason: `Repairs cost ${cost} coins` };
  state.coins -= cost;
  v.condition = 100;
  bus.emit('repairVehicle', { uid, cost });
  return { ok: true, cost };
}

export function upgradeVehicle(state, uid, bus = NULL_BUS) {
  const v = findVehicle(state, uid);
  if (!v) return { ok: false, reason: 'No such vehicle' };
  const next = UPGRADES[v.upgrade];
  if (!next) return { ok: false, reason: 'Fully upgraded' };
  if (state.coins < next.cost) return { ok: false, reason: `Needs ${next.cost} coins` };
  state.coins -= next.cost;
  v.upgrade += 1;
  bus.emit('upgradeVehicle', { uid, level: v.upgrade });
  return { ok: true };
}

// Tow a vehicle back to the garage's parking spot.
export function sendToGarage(state, uid) {
  const v = findVehicle(state, uid);
  const spot = parkingSpot(state);
  if (!v) return { ok: false, reason: 'No such vehicle' };
  if (!spot) return { ok: false, reason: 'There is no garage to tow it to' };
  if (state.driving === uid) return { ok: false, reason: 'Get out first' };
  const idx = state.vehicles.indexOf(v);
  v.x = spot.x + idx * 70;
  v.y = spot.y;
  v.heading = Math.PI / 2;
  v.speed = 0;
  v.engaged = false;
  return { ok: true };
}

// Move trailer cargo into the bag as far as it fits.
export function unload(state, uid) {
  const v = findVehicle(state, uid);
  if (!v) return { ok: false, reason: 'No such vehicle' };
  if (cargoUsed(v) === 0) return { ok: false, reason: 'The trailer is empty' };
  let moved = 0;
  for (const [id, qty] of Object.entries(v.cargo)) {
    for (let i = 0; i < qty; i++) {
      if (!Inv.add(state.inventory, id, 1, bagSlots(state)).ok) break;
      v.cargo[id] -= 1;
      moved += 1;
    }
    if (v.cargo[id] <= 0) delete v.cargo[id];
  }
  if (!moved) return { ok: false, reason: 'Your bag is full' };
  return { ok: true, moved, left: cargoUsed(v) };
}

// ---------------------------------------------------------------- driving physics
// One step of arcade driving. input: { throttle: -1..1 (forward positive), steer: -1..1 (right positive) }.
// ctx.blocked(box) tells whether an axis-aligned box hits something solid.
export function stepVehicle(v, input, dt, ctx) {
  const def = vehicleDef(v);
  const grip = ctx.ground ?? 1;
  const hasFuel = v.fuel > 0;
  const fwdMax = topSpeed(v) * grip;
  const revMax = def.maxReverse * grip;
  const throttle = hasFuel ? input.throttle : 0;
  const target = throttle > 0 ? fwdMax * throttle : throttle < 0 ? -revMax * -throttle : 0;
  const towardTarget = Math.abs(target) > Math.abs(v.speed) && Math.sign(target) === Math.sign(v.speed || target);
  const rate = target === 0 ? def.brake * 0.45 : towardTarget ? def.accel : def.brake;
  if (v.speed < target) v.speed = Math.min(target, v.speed + rate * dt);
  else if (v.speed > target) v.speed = Math.max(target, v.speed - rate * dt);
  // wheels cannot exceed what the ground allows
  v.speed = Math.max(-revMax, Math.min(fwdMax, v.speed));

  // steering needs forward or backward motion; reversing flips the wheel
  const bite = Math.min(1, Math.abs(v.speed) / 70);
  v.heading += input.steer * def.turnRate * bite * Math.sign(v.speed || 1) * dt;
  v.heading = ((v.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  const dx = Math.cos(v.heading) * v.speed * dt;
  const dy = Math.sin(v.heading) * v.speed * dt;
  const box = (x, y) => ({ x0: x - def.half, y0: y - def.half, x1: x + def.half, y1: y + def.half });
  let moved = 0;
  let hit = false;
  if (!ctx.blocked(box(v.x + dx, v.y + dy))) {
    v.x += dx;
    v.y += dy;
    moved = Math.hypot(dx, dy);
  } else if (dx && !ctx.blocked(box(v.x + dx, v.y))) {
    v.x += dx;
    moved = Math.abs(dx);
    hit = true;
  } else if (dy && !ctx.blocked(box(v.x, v.y + dy))) {
    v.y += dy;
    moved = Math.abs(dy);
    hit = true;
  } else {
    hit = Math.abs(v.speed) > 1;
  }
  let bump = 0;
  if (hit && Math.abs(v.speed) > 90) {
    bump = Math.min(6, Math.abs(v.speed) / 60);
    v.condition = Math.max(0, v.condition - bump);
  }
  if (hit) v.speed *= -0.12;

  // fuel and wear
  const working = v.engaged && v.mount.front && Math.abs(v.speed) > 10;
  const moving = Math.abs(v.speed) > 5 || Math.abs(input.throttle) > 0.05;
  if (moving && hasFuel) {
    v.fuel = Math.max(0, v.fuel - def.fuelPerSec * (working ? 1 + WORK_FUEL_FACTOR : 1) * (Math.abs(v.speed) > 5 ? 1 : 0.25) * dt);
    v.condition = Math.max(0, v.condition - def.wearPerSec * (Math.abs(v.speed) / def.maxSpeed) * dt);
  }
  return { moved, hit, bump, stalled: !hasFuel && Math.abs(input.throttle) > 0.05 };
}

// ---------------------------------------------------------------- implements
export function workArea(v) {
  const def = vehicleDef(v);
  const ahead = def.length / 2 + 26;
  return {
    cx: v.x + Math.cos(v.heading) * ahead,
    cy: v.y + Math.sin(v.heading) * ahead,
    width: def.workWidth * TILE,
    depth: 52,
    heading: v.heading,
  };
}

export function plotsUnder(area) {
  const cos = Math.cos(area.heading);
  const sin = Math.sin(area.heading);
  const out = [];
  for (const p of PLOTS) {
    const dx = (p.tx + 0.5) * TILE - area.cx;
    const dy = (p.ty + 0.5) * TILE - area.cy;
    const along = dx * cos + dy * sin;
    const across = -dx * sin + dy * cos;
    if (Math.abs(along) <= area.depth / 2 + 8 && Math.abs(across) <= area.width / 2 + 4) out.push(p.id);
  }
  return out;
}

// Work every plot under the implement once. Returns { count, actions }.
export function work(state, v, bus = NULL_BUS) {
  const imp = v.mount.front && IMPLEMENTS[v.mount.front];
  if (!imp || !v.engaged || v.fuel <= 0 || Math.abs(v.speed) <= 10) return { count: 0, action: null };
  let count = 0;
  for (const id of plotsUnder(workArea(v))) {
    if (!Farming.isPlotAvailable(state, id)) continue;
    const plot = state.plots[id];
    let did = false;
    if (imp.action === 'till') did = Farming.till(state, id, bus).ok;
    else if (imp.action === 'plant') did = plot.tilled && !plot.crop && Farming.plant(state, id, bus).ok;
    else if (imp.action === 'water') {
      if (plot.crop && !Farming.isReady(plot) && !Farming.isWet(state, plot)) {
        plot.moistUntil = state.time + WATER_DURATION;
        bus.emit('water', { plotId: id, crop: plot.crop });
        did = true;
      }
    } else if (imp.action === 'harvest' && plot.crop && Farming.isReady(plot)) did = harvestInto(state, v, id, bus).ok;
    if (did) count += 1;
  }
  if (count) bus.emit('machineWork', { action: imp.action, qty: count, uid: v.uid });
  return { count, action: imp.action };
}

// Harvest into the trailer when there is room, otherwise into the bag.
function harvestInto(state, v, plotId, bus) {
  const plot = state.plots[plotId];
  const crop = CROPS[plot.crop];
  if (v.mount.rear && cargoUsed(v) + crop.yield <= cargoCapacity(v)) {
    v.cargo[crop.id] = (v.cargo[crop.id] || 0) + crop.yield;
    plot.crop = null;
    plot.growth = 0;
    bus.emit('harvest', { plotId, crop: crop.id, qty: crop.yield });
    return { ok: true, trailer: true };
  }
  return Farming.harvest(state, plotId, bus);
}

export const implementLabel = (v) => (v.mount.front ? IMPLEMENTS[v.mount.front].name : null);
export { groundFactor, getItem };
