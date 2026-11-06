import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import * as V from '../../src/systems/vehicles.js';
import { PARCELS } from '../../src/data/land.js';
import { PLOTS, PLOT_GROUPS } from '../../src/data/world.js';
import { VEHICLES } from '../../src/data/vehicles.js';
import { TILE } from '../../src/config.js';

// Drive a tractor up and down a parcel's field in rows as wide as its implement
// and check each attachment reaches every plot.
function run(parcel, type, implement) {
  const s = createNewState();
  s.coins = 99999;
  for (const p of PARCELS) s.unlocks[p.id] = true;
  s.unlocks.northField = true;
  s.flags.roadOpen = true;
  s.time = 8 * 60;
  s.inventory = s.inventory || {};
  s.inventory.seed_carrot = 999;
  s.owned.implements.push(implement);
  const v = { uid: 'v1', type, x: 0, y: 0, heading: 0, speed: 0, fuel: 999, condition: 100, upgrade: 0, mount: { front: implement, rear: null }, cargo: {}, engaged: true };
  s.vehicles.push(v);
  const f = parcel.field;
  const w = VEHICLES[type].workWidth;
  const ids = PLOTS.filter((p) => p.group === parcel.group).map((p) => p.id);
  assert.ok(ids.length > 0);
  if (implement !== 'plough') for (const id of ids) Object.assign(s.plots[id], { tilled: true });
  if (implement === 'sprayer' || implement === 'reaper') for (const id of ids) Object.assign(s.plots[id], { crop: 'carrot', growth: implement === 'reaper' ? 99999 : 1, moistUntil: 0 });
  let swaths = 0;
  for (let r = 0; r * w < f.rows; r++) {
    const cy = (f.y0 + Math.min(f.rows - 0.5, r * w + w / 2)) * TILE;
    const dir = r % 2 ? -1 : 1;
    v.heading = dir > 0 ? 0 : Math.PI;
    const len = VEHICLES[type].length / 2 + V.WORK_AHEAD;
    for (let x = dir > 0 ? f.x0 * TILE - len : (f.x0 + f.cols) * TILE + len; dir > 0 ? x < (f.x0 + f.cols) * TILE : x > f.x0 * TILE; x += dir * 20) {
      v.x = x; v.y = cy; v.speed = 100; v.fuel = 999;
      V.work(s, v);
      if (implement === 'reaper') s.inventory = {};
    }
    swaths++;
    if (implement === 'reaper') s.inventory = {}; // unload the bag between rows (a full bag stops harvesting)
  }
  return { s, ids, swaths };
}

for (const p of PARCELS) {
  for (const type of ['tractor_small', 'tractor_large']) {
    test(`${p.name}: ${type} plough, seeder, sprayer and reaper reach every plot`, () => {
      const plough = run(p, type, 'plough');
      assert.ok(plough.ids.every((id) => plough.s.plots[id].tilled), 'plough tilled all');
      // seeder needs seeds in the bag
      const seeded = (() => {
        const q = run(p, type, 'seeder');
        return q;
      })();
      assert.ok(seeded.ids.every((id) => seeded.s.plots[id].crop), 'seeder planted all');
      const spray = run(p, type, 'sprayer');
      assert.ok(spray.ids.every((id) => spray.s.plots[id].moistUntil > spray.s.time), 'sprayer watered all');
      const reap = run(p, type, 'reaper');
      assert.ok(reap.ids.every((id) => !reap.s.plots[id].crop), 'reaper harvested all');
    });
  }
}
