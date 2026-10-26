import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import { serialize, deserialize } from '../../src/systems/save.js';
import { placeableInfo } from '../../src/systems/buildings.js';
import { sprinklerTick, plotsInRange } from '../../src/systems/sprinklers.js';
import { advanceTime } from '../../src/systems/simulation.js';
import { PLOTS } from '../../src/data/world.js';

const garden = (s) => PLOTS.filter((p) => p.group === 'starter' || (p.group === 'south' && s.unlocks.gardenExpansion));
const plantAll = (s) => { for (const p of PLOTS) Object.assign(s.plots[p.id], { tilled: true, crop: 'carrot', growth: 0, moistUntil: 0 }); };
const addSprinkler = (s, x = 7.0, y = 16.6) => s.placed.push({ uid: 'sp1', kind: 'decor', type: 'sprinkler', x, y, level: 1, job: null });

test('sprinklers unlock at farm level 2', () => {
  const s = createNewState();
  s.coins = 1000;
  assert.equal(placeableInfo(s, 'sprinkler').state, 'locked');
  assert.match(placeableInfo(s, 'sprinkler').reason, /level 2/);
  s.xp = 100;
  assert.equal(placeableInfo(s, 'sprinkler').state, 'available');
  s.coins = 10;
  assert.equal(placeableInfo(s, 'sprinkler').state, 'unaffordable');
});

test('one sprinkler in the middle of the garden waters both beds', () => {
  const s = createNewState();
  s.unlocks.gardenExpansion = true;
  plantAll(s);
  addSprinkler(s);
  const n = sprinklerTick(s);
  assert.equal(n, 16);
  for (const p of garden(s)) assert.ok(s.plots[p.id].moistUntil > s.time, p.id);
  for (const p of PLOTS.filter((d) => d.group === 'north')) assert.equal(s.plots[p.id].moistUntil, 0, 'the north field is out of reach');
  assert.equal(sprinklerTick(s), 0, 'nothing to do while the soil is wet');
  assert.equal(plotsInRange(s, 7.0, 16.6).length, 16);
});

test('only planted, growing, unlocked plots are watered', () => {
  const s = createNewState();
  plantAll(s);
  s.plots.starter_5_14.crop = null;
  s.plots.starter_6_14.growth = 99999;
  addSprinkler(s);
  sprinklerTick(s);
  assert.equal(s.plots.starter_5_14.moistUntil, 0, 'bare soil');
  assert.equal(s.plots.starter_6_14.moistUntil, 0, 'ripe crop');
  assert.equal(s.plots.south_5_17.moistUntil, 0, 'south bed still locked');
  assert.ok(s.plots.starter_7_14.moistUntil > s.time);
});

test('crops under a sprinkler grow without the can, and the sprinkler survives a save', () => {
  const s = deserialize(serialize((() => { const x = createNewState(); addSprinkler(x); return x; })()));
  assert.equal(s.placed.filter((p) => p.type === 'sprinkler').length, 1);
  Object.assign(s.plots.starter_5_14, { tilled: true, crop: 'carrot', growth: 0, moistUntil: 0 });
  advanceTime(s, 300);
  assert.ok(s.plots.starter_5_14.growth >= 240, `grew to ${s.plots.starter_5_14.growth}`);
});
