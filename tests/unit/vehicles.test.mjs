import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import { serialize, deserialize } from '../../src/systems/save.js';
import { EventBus } from '../../src/core/events.js';
import * as V from '../../src/systems/vehicles.js';
import * as F from '../../src/systems/farming.js';
import { groundFactor, onRoad } from '../../src/systems/ground.js';
import { placedColliders } from '../../src/world/layout.js';
import { attachQuests } from '../../src/systems/quests.js';
import { attachProgress } from '../../src/systems/progress.js';
import { TILE } from '../../src/config.js';
import { VEHICLES, IMPLEMENTS } from '../../src/data/vehicles.js';

function farm({ level = 3, garage = true } = {}) {
  const s = createNewState();
  s.xp = level >= 5 ? 700 : 300; // level 3 or 5
  s.coins = 20000;
  if (garage) s.placed.push({ uid: 'p9', kind: 'building', type: 'garage', x: 21.5, y: 15.2, level: 1, job: null, storage: {} });
  const bus = new EventBus();
  attachQuests(() => s, bus);
  attachProgress(() => s, bus);
  return { s, bus };
}
const open = () => ({ ground: 1, blocked: () => false });
const drive = (v, input, secs, ctx = open(), dt = 1 / 60) => {
  let moved = 0;
  for (let t = 0; t < secs; t += dt) moved += V.stepVehicle(v, input, dt, ctx).moved;
  return moved;
};

test('buying: needs a garage, farm level, coins and room; arrives half full', () => {
  const none = farm({ garage: false });
  assert.match(V.buyVehicle(none.s, 'tractor_small').reason, /garage/);
  const low = farm({ level: 1 });
  low.s.xp = 0;
  assert.match(V.buyVehicle(low.s, 'tractor_small').reason, /level 3/);
  const { s, bus } = farm();
  const events = [];
  bus.on('buyVehicle', (e) => events.push(e));
  s.coins = 100;
  assert.match(V.buyVehicle(s, 'tractor_small', bus).reason, /coins/);
  s.coins = 20000;
  assert.match(V.buyVehicle(s, 'tractor_large', bus).reason, /level 5/);
  const r = V.buyVehicle(s, 'tractor_small', bus);
  assert.equal(r.ok, true);
  assert.equal(s.coins, 20000 - 1500);
  assert.equal(r.vehicle.fuel, 20);
  assert.equal(events.length, 1);
  const spot = V.parkingSpot(s);
  assert.equal(r.vehicle.y, spot.y);
  V.buyVehicle(s, 'tractor_small', bus);
  V.buyVehicle(s, 'tractor_small', bus);
  assert.match(V.buyVehicle(s, 'tractor_small', bus).reason, /holds 3/);
  assert.equal(s.vehicles.length, 3);
  assert.equal(new Set(s.vehicles.map((v) => v.uid)).size, 3);
});

test('implements: buy once, attach to one vehicle, one per slot, trailer needs to be empty to detach', () => {
  const { s, bus } = farm();
  V.buyVehicle(s, 'tractor_small', bus);
  V.buyVehicle(s, 'tractor_small', bus);
  const [a, b] = s.vehicles;
  assert.equal(V.attach(s, a.uid, 'plough').ok, false, "can't attach what you don't own");
  assert.equal(V.buyImplement(s, 'plough', bus).ok, true);
  assert.equal(V.buyImplement(s, 'plough', bus).ok, false, 'one each');
  V.buyImplement(s, 'seeder', bus);
  V.buyImplement(s, 'crop_trailer', bus);
  assert.equal(V.attach(s, a.uid, 'plough').ok, true);
  assert.equal(V.attach(s, b.uid, 'plough').ok, false, 'already on another tractor');
  assert.match(V.attach(s, a.uid, 'seeder').reason, /Detach the Plough/);
  assert.equal(V.attach(s, a.uid, 'crop_trailer').ok, true);
  a.cargo = { carrot: 3 };
  assert.equal(V.detach(s, a.uid, 'rear').ok, false, 'unload first');
  assert.equal(V.unload(s, a.uid).moved, 3);
  assert.equal(s.inventory.carrot, 3);
  assert.equal(V.detach(s, a.uid, 'rear').ok, true);
  assert.equal(V.detach(s, a.uid, 'front').ok, true);
  assert.equal(V.attach(s, b.uid, 'plough').ok, true, 'free again');
});

test('driving: accelerates, caps at the ground-limited top speed, brakes, reverses slower', () => {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  v.fuel = 40;
  drive(v, { throttle: 1, steer: 0 }, 3, { ground: 1, blocked: () => false });
  assert.ok(Math.abs(v.speed - VEHICLES.tractor_small.maxSpeed) < 1, `road top speed (${v.speed})`);
  drive(v, { throttle: 1, steer: 0 }, 1, { ground: 0.72, blocked: () => false });
  assert.ok(v.speed <= VEHICLES.tractor_small.maxSpeed * 0.72 + 0.5, `grass slows it (${v.speed})`);
  drive(v, { throttle: 0, steer: 0 }, 4);
  assert.equal(v.speed, 0, 'coasts to a stop');
  drive(v, { throttle: -1, steer: 0 }, 3);
  assert.ok(v.speed < 0 && Math.abs(v.speed) <= VEHICLES.tractor_small.maxReverse + 0.5);
  const xAfter = v.x;
  assert.ok(xAfter !== undefined);
});

test('steering only bites while rolling, flips in reverse, and keeps the heading in range', () => {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  v.fuel = 40;
  v.heading = 0;
  drive(v, { throttle: 0, steer: 1 }, 1);
  assert.equal(v.heading, 0, 'no turning on the spot');
  drive(v, { throttle: 1, steer: 1 }, 1.5);
  assert.ok(v.heading > 0.5, `turns right when moving forward (${v.heading})`);
  const fwd = v.heading;
  v.speed = 0;
  v.heading = 0;
  drive(v, { throttle: -1, steer: 1 }, 1.5);
  assert.ok(v.heading < 0, `reversing flips the steering (${v.heading})`);
  v.heading = 3.1;
  drive(v, { throttle: 1, steer: 1 }, 2);
  assert.ok(v.heading >= -Math.PI && v.heading <= Math.PI);
  assert.ok(fwd > 0);
});

test('fuel: burns while moving, nothing happens without it, refuel costs coins, no free money', () => {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  const start = v.fuel;
  drive(v, { throttle: 1, steer: 0 }, 5);
  assert.ok(v.fuel < start && v.fuel > start - 2, `uses fuel (${start} -> ${v.fuel})`);
  v.fuel = 0;
  v.speed = 0;
  const r = V.stepVehicle(v, { throttle: 1, steer: 0 }, 0.5, open());
  assert.equal(v.speed, 0, 'an empty tank does not move');
  assert.equal(r.stalled, true);
  s.coins = 5;
  const lowFunds = V.refuel(s, v.uid, 2, bus);
  assert.equal(lowFunds.units, 2, 'buys what it can afford');
  assert.equal(s.coins, 1);
  s.coins = 1000;
  const full = V.refuel(s, v.uid, 2, bus);
  assert.equal(v.fuel, V.tankSize(v));
  assert.equal(full.full, true);
  assert.equal(s.coins, 1000 - full.cost);
  assert.equal(V.refuel(s, v.uid, 2, bus).ok, false, 'already full');
  s.coins = 0;
  v.fuel = 5;
  assert.equal(V.refuel(s, v.uid, 2, bus).ok, false, 'nothing to spend');
  assert.equal(V.refuel(s, 'nope').ok, false);
});

test('collisions stop the tractor and wear it; gentle bumps cost nothing', () => {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  v.fuel = 40;
  v.x = 500; v.y = 500; v.heading = 0; v.speed = 0;
  const wall = (box) => box.x1 > 560;
  drive(v, { throttle: 1, steer: 0 }, 3, { ground: 1, blocked: wall });
  assert.ok(v.x + VEHICLES.tractor_small.half <= 560.01, 'never enters the wall');
  assert.ok(v.condition < 100 - 0.5, `a hard hit damages it (${v.condition})`);
  const condAfter = v.condition;
  v.speed = 0;
  v.x = 500;
  drive(v, { throttle: 0.1, steer: 0 }, 1, { ground: 1, blocked: wall });
  assert.ok(v.condition >= condAfter - 0.5, 'creeping into it is harmless');
});

test('wear slows the machine; repair restores it for coins; engine upgrades add speed and tank', () => {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  const fresh = V.topSpeed(v);
  v.condition = 10;
  assert.ok(V.topSpeed(v) < fresh * 0.7);
  v.condition = 0;
  assert.ok(V.topSpeed(v) >= fresh * 0.39, 'worn out is slow, not stuck');
  const cost = V.repairCost(v);
  assert.equal(cost, 120);
  s.coins = 50;
  assert.equal(V.repair(s, v.uid, bus).ok, false);
  s.coins = 500;
  assert.equal(V.repair(s, v.uid, bus).cost, 120);
  assert.equal(v.condition, 100);
  assert.equal(V.repair(s, v.uid, bus).ok, false, 'nothing to fix');
  const tank = V.tankSize(v);
  s.coins = 5000;
  assert.equal(V.upgradeVehicle(s, v.uid, bus).ok, true);
  assert.ok(V.topSpeed(v) > fresh && V.tankSize(v) > tank);
  s.coins = 5000;
  assert.equal(V.upgradeVehicle(s, v.uid, bus).ok, true);
  assert.equal(V.upgradeVehicle(s, v.uid, bus).ok, false, 'two levels only');
});

test('ground: roads and the village square are fast, grass slower, soft soil slowest', () => {
  assert.equal(onRoad(17.9 * TILE, 15 * TILE), true, 'the main road south');
  assert.equal(onRoad(48 * TILE, 12 * TILE), true, 'the village square');
  assert.equal(groundFactor(25 * TILE, 19 * TILE), 0.72);
  assert.equal(groundFactor(25 * TILE, 19 * TILE, true), 0.6);
  assert.equal(groundFactor(17.9 * TILE, 15 * TILE, true), 1);
});

function rig(implement, { seeds = 0 } = {}) {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  V.buyImplement(s, implement, bus);
  V.attach(s, v.uid, implement);
  // park facing east just west of the starter plots (row 14-15, columns 5-8): the work area sits over them
  v.fuel = 40;
  v.heading = 0;
  v.speed = 120;
  v.engaged = true;
  v.x = 4.2 * TILE;
  v.y = 15.0 * TILE; // rows 14 and 15 straddle y = 15
  const def = VEHICLES.tractor_small;
  v.x = 5.5 * TILE - (def.length / 2 + V.WORK_AHEAD); // the area centre is over column 5
  s.inventory = seeds ? { seed_carrot: seeds } : {};
  return { s, bus, v };
}

test('plough: tills the plots in front of it, once, and counts them', () => {
  const { s, bus, v } = rig('plough');
  const events = [];
  bus.on('machineWork', (e) => events.push(e));
  const r = V.work(s, v, bus);
  assert.ok(r.count >= 1, 'something was ploughed');
  const tilled = Object.values(s.plots).filter((p) => p.tilled).length;
  assert.equal(tilled, r.count);
  assert.equal(V.work(s, v, bus).count, 0, 'already tilled: nothing more to do');
  assert.equal(events[0].action, 'till');
  assert.equal(s.counters.machineWork, tilled);
  assert.equal(s.counters.till, tilled, 'counts as tilling too');
  v.engaged = false;
  v.x += 64;
  assert.equal(V.work(s, v, bus).count, 0, 'does nothing while stopped');
  v.engaged = true;
  v.speed = 5;
  assert.equal(V.work(s, v, bus).count, 0, 'does nothing when barely moving');
  v.speed = 120;
  v.fuel = 0;
  assert.equal(V.work(s, v, bus).count, 0, 'or without fuel');
});

test('seeder plants tilled plots using seeds; sprayer waters; reaper harvests into the trailer then the bag', () => {
  const a = rig('seeder', { seeds: 10 });
  for (const p of Object.values(a.s.plots)) p.tilled = true;
  const planted = V.work(a.s, a.v, a.bus).count;
  assert.ok(planted >= 1);
  assert.equal(a.s.inventory.seed_carrot, 10 - planted, 'uses real seeds');
  const none = rig('seeder', { seeds: 0 });
  for (const p of Object.values(none.s.plots)) p.tilled = true;
  assert.equal(V.work(none.s, none.v, none.bus).count, 0, 'no seeds, no planting');

  const w = rig('sprayer');
  for (const p of Object.values(w.s.plots)) { p.tilled = true; p.crop = 'carrot'; p.growth = 10; }
  const watered = V.work(w.s, w.v, w.bus).count;
  assert.ok(watered >= 1);
  assert.equal(w.s.can.water, 10, 'does not use the watering can');
  assert.equal(V.work(w.s, w.v, w.bus).count, 0, 'already wet');

  const h = rig('reaper');
  V.buyImplement(h.s, 'crop_trailer', h.bus);
  V.attach(h.s, h.v.uid, 'crop_trailer');
  for (const p of Object.values(h.s.plots)) { p.tilled = true; p.crop = 'carrot'; p.growth = 9999; }
  const reaped = V.work(h.s, h.v, h.bus).count;
  assert.ok(reaped >= 1);
  assert.equal(V.cargoUsed(h.v), reaped, 'goes in the trailer');
  assert.equal(h.s.counters.harvest, reaped);
  assert.equal(h.s.inventory.carrot || 0, 0);
  // a full trailer overflows into the bag
  const h2 = rig('reaper');
  V.buyImplement(h2.s, 'crop_trailer', h2.bus);
  V.attach(h2.s, h2.v.uid, 'crop_trailer');
  h2.v.cargo = { carrot: IMPLEMENTS.crop_trailer.capacity };
  for (const p of Object.values(h2.s.plots)) { p.tilled = true; p.crop = 'carrot'; p.growth = 9999; }
  const got = V.work(h2.s, h2.v, h2.bus).count;
  assert.equal(h2.s.inventory.carrot, got, 'into the bag instead');
  assert.equal(V.cargoUsed(h2.v), IMPLEMENTS.crop_trailer.capacity);
});

test('locked plots are left alone by machines', () => {
  const { s, bus, v } = rig('plough');
  v.x = 5.5 * TILE - (VEHICLES.tractor_small.length / 2 + V.WORK_AHEAD);
  v.y = 17.5 * TILE; // the south bed, not yet bought
  const r = V.work(s, v, bus);
  assert.equal(r.count, 0);
  assert.ok(!Object.entries(s.plots).some(([id, p]) => id.startsWith('south') && p.tilled));
});

test('towing and unloading', () => {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  v.x = 900; v.y = 900;
  assert.equal(V.sendToGarage(s, v.uid).ok, true);
  assert.equal(v.y, V.parkingSpot(s).y);
  s.driving = v.uid;
  assert.equal(V.sendToGarage(s, v.uid).ok, false, 'not while sitting in it');
  s.driving = null;
  assert.equal(V.unload(s, v.uid).ok, false, 'empty');
  V.buyImplement(s, 'crop_trailer', bus);
  V.attach(s, v.uid, 'crop_trailer');
  v.cargo = { carrot: 5, lettuce: 2 };
  for (let i = 0; i < 16; i++) s.inventory[`seed_x${i}`] = 1; // fill the bag
  const r = V.unload(s, v.uid);
  assert.equal(r.ok, false, 'bag full: nothing moves');
  assert.equal(V.cargoUsed(v), 7);
});

test('quests and achievements for machinery use real events', () => {
  const { s, bus } = farm();
  s.quests.q_garage.status = 'active';
  bus.emit('constructed', { id: 'garage', level: 1 });
  assert.equal(s.quests.q_garage.status, 'complete');
  s.quests.q_first_drive.status = 'active';
  bus.emit('drive', { qty: 25 });
  bus.emit('drive', { qty: 15 });
  assert.equal(s.quests.q_first_drive.status, 'complete');
  s.quests.q_plough_field.status = 'active';
  bus.emit('machineWork', { action: 'plant', qty: 6 });
  assert.equal(s.quests.q_plough_field.progress[0], 0, 'only ploughing counts');
  bus.emit('machineWork', { action: 'till', qty: 6 });
  assert.equal(s.quests.q_plough_field.status, 'complete');
  assert.equal(s.counters.driven, 40);
});

test('save v7: vehicles round-trip; v6 saves have none; bad vehicle data is sanitised', () => {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  V.buyImplement(s, 'plough', bus);
  V.buyImplement(s, 'crop_trailer', bus);
  V.attach(s, v.uid, 'plough');
  V.attach(s, v.uid, 'crop_trailer');
  v.cargo = { carrot: 12 };
  v.fuel = 17;
  v.condition = 61;
  v.upgrade = 1;
  const back = deserialize(serialize(s));
  assert.equal(back.version, 7);
  const b = back.vehicles[0];
  assert.deepEqual([b.type, b.fuel, b.condition, b.upgrade, b.mount.front, b.mount.rear, b.cargo.carrot], ['tractor_small', 17, 61, 1, 'plough', 'crop_trailer', 12]);
  assert.deepEqual(back.owned.implements.sort(), ['crop_trailer', 'plough']);
  assert.equal(b.engaged, false);

  const old = deserialize({ version: 6, coins: 10, buildings: {}, placed: [] });
  assert.equal(old.version, 7);
  assert.deepEqual(old.vehicles, []);
  assert.deepEqual(old.owned.implements, []);

  const data = JSON.parse(serialize(s));
  data.vehicles = [
    { uid: 'a', type: 'spaceship', x: 1, y: 1 },
    { uid: 'b', type: 'tractor_small', x: -50, y: 1e9, heading: 'x', fuel: 1e6, condition: 500, upgrade: 99, mount: { front: 'reaper', rear: 'plough' }, cargo: { carrot: 1e6, junk: 5, seed_carrot: 3 } },
    { uid: 'b', type: 'tractor_small', x: 1, y: 1 },
    { uid: 'c', type: 'tractor_small', x: 1, y: 1, mount: { front: 'plough', rear: 'crop_trailer' }, cargo: { carrot: 500 } },
    { uid: 'd', type: 'tractor_small', x: 1, y: 1, mount: { front: 'plough', rear: null } },
  ];
  data.owned = { implements: ['plough', 'crop_trailer', 'laser', 'plough'] };
  const clean = deserialize(data);
  assert.deepEqual(clean.vehicles.map((x) => x.uid), ['b', 'c', 'd']);
  const [vb, vc, vd] = clean.vehicles;
  assert.ok(vb.x >= 0 && vb.y <= 28 * 64 + 1);
  assert.ok(vb.fuel <= V.tankSize(vb) && vb.condition <= 100 && vb.upgrade <= 2);
  assert.equal(vb.mount.front, null, 'not owned');
  assert.equal(vb.mount.rear, null, 'wrong slot');
  assert.deepEqual(vb.cargo, {}, 'no trailer: no cargo');
  assert.equal(vc.mount.front, 'plough');
  assert.equal(vc.mount.rear, 'crop_trailer');
  assert.ok(vc.cargo.carrot <= IMPLEMENTS.crop_trailer.capacity);
  assert.equal(vd.mount.front, null, 'the plough is already on another tractor');
  assert.deepEqual(clean.owned.implements.sort(), ['crop_trailer', 'plough']);
});

test('a save made while driving puts the player beside the tractor', () => {
  const { s, bus } = farm();
  const v = V.buyVehicle(s, 'tractor_small', bus).vehicle;
  v.x = 800; v.y = 600;
  s.driving = v.uid;
  s.player.x = 800; s.player.y = 600;
  const back = deserialize(serialize(s));
  assert.equal(back.driving, null);
  assert.ok(Math.abs(back.player.x - 850) < 1 && back.player.y === 600);
});

test('moving a placed building: its old footprint no longer blocks', () => {
  const { s } = farm();
  const all = placedColliders(s);
  const without = placedColliders(s, 'p9');
  assert.equal(without.length, all.length - 1);
  assert.equal(placedColliders(s, 'nope').length, all.length);
});
