import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import * as F from '../../src/systems/farming.js';
import { advanceTime, sleep } from '../../src/systems/simulation.js';
import { CROPS, WATER_DURATION } from '../../src/data/crops.js';
import { EventBus } from '../../src/core/events.js';

const P = 'starter_5_14';

test('full plot lifecycle: till, plant, water, grow, harvest', () => {
  const s = createNewState();
  const events = [];
  const bus = new EventBus();
  bus.on('*', (p, t) => events.push(t));
  assert.equal(F.plotStage(s.plots[P]), 'untilled');
  assert.ok(F.interactPlot(s, P, bus).ok);
  assert.equal(F.plotStage(s.plots[P]), 'tilled');
  assert.ok(F.interactPlot(s, P, bus).ok);
  assert.equal(s.inventory.seed_carrot, 5);
  assert.equal(F.plotStage(s.plots[P]), 'planted');
  // no growth without water
  advanceTime(s, 500);
  assert.equal(s.plots[P].growth, 0);
  assert.equal(F.interactPlot(s, P, bus).action, 'water');
  assert.equal(s.can.water, 9);
  advanceTime(s, CROPS.carrot.growMinutes - 1);
  assert.notEqual(F.plotStage(s.plots[P]), 'ready');
  assert.equal(F.getPlotAction(s, P).action, 'none');
  advanceTime(s, 1);
  assert.equal(F.plotStage(s.plots[P]), 'ready');
  const r = F.interactPlot(s, P, bus);
  assert.ok(r.ok);
  assert.equal(s.inventory.carrot, 1);
  assert.equal(F.plotStage(s.plots[P]), 'tilled');
  // harvesting again does nothing (no duplication)
  assert.equal(F.harvest(s, P, bus).ok, false);
  assert.equal(s.inventory.carrot, 1);
  assert.deepEqual(events, ['till', 'plant', 'water', 'harvest']);
});

test('growth only counts moist time', () => {
  const s = createNewState();
  s.plots[P].tilled = true;
  F.plant(s, P);
  F.water(s, P);
  advanceTime(s, WATER_DURATION + 1000);
  assert.equal(s.plots[P].growth, Math.min(WATER_DURATION, CROPS.carrot.growMinutes));
});

test('cannot plant without seeds or water with empty can', () => {
  const s = createNewState();
  s.inventory = {};
  s.plots[P].tilled = true;
  const a = F.getPlotAction(s, P);
  assert.equal(a.ok, false);
  assert.equal(F.plant(s, P).ok, false);
  s.inventory.seed_carrot = 1;
  F.plant(s, P);
  s.can.water = 0;
  assert.equal(F.water(s, P).ok, false);
  assert.ok(F.refillCan(s).ok);
  assert.equal(s.can.water, s.can.capacity);
});

test('expansion plots are locked until unlocked', () => {
  const s = createNewState();
  assert.equal(F.getPlotAction(s, 'south_5_17').action, 'locked');
  assert.equal(F.till(s, 'south_5_17').ok, false);
  s.unlocks.gardenExpansion = true;
  assert.ok(F.till(s, 'south_5_17').ok);
});

test('harvest fails cleanly when bag cannot hold produce', () => {
  const s = createNewState();
  s.plots[P] = { tilled: true, crop: 'carrot', growth: CROPS.carrot.growMinutes, moistUntil: 0, variant: 0 };
  s.inventory.carrot = 99;
  const r = F.harvest(s, P);
  assert.equal(r.ok, false);
  assert.equal(s.plots[P].crop, 'carrot');
  assert.equal(s.inventory.carrot, 99);
});

test('sleep advances to 6 AM and crops grow overnight while moist', () => {
  const s = createNewState();
  s.plots[P].tilled = true;
  F.plant(s, P);
  F.water(s, P);
  sleep(s);
  assert.equal(s.time, 24 * 60 + 6 * 60);
  assert.equal(F.plotStage(s.plots[P]), 'ready');
});
