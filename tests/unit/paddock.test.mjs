import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import { deserialize, serialize } from '../../src/systems/save.js';
import { isPlotAvailable, getPlotAction } from '../../src/systems/farming.js';
import { purchaseUpgrade, upgradeStatus } from '../../src/systems/economy.js';
import { paddockBlocker } from '../../src/systems/paddock.js';
import { PLOTS, PADDOCK } from '../../src/data/world.js';
import { SHOP_STOCK } from '../../src/data/progression.js';
import { TILE } from '../../src/config.js';

const paddockPlots = PLOTS.filter((p) => p.group === 'paddock');
const garageAt = (s, x = 21.5, y = 12.6) => s.placed.push({ uid: 'g1', kind: 'building', type: 'garage', x, y, level: 1, job: null, storage: {} });
const ready = () => {
  const s = createNewState();
  s.coins = 50000;
  s.unlocks.northField = true;
  garageAt(s);
  return s;
};

test('the paddock is 40 plots in open meadow, clear of the road, garden and north field', () => {
  assert.equal(paddockPlots.length, 40);
  for (const p of paddockPlots) {
    assert.ok(p.tx * TILE >= PADDOCK.x0 * TILE && (p.tx + 1) * TILE <= PADDOCK.x1 * TILE + 1);
    assert.ok(p.ty >= 14 && p.ty <= 18);
  }
  assert.ok(PADDOCK.x0 > 21, 'east of the garage and the central path');
});

test('paddock plots are locked until the East Paddock is bought, and say what to buy', () => {
  const s = ready();
  assert.equal(isPlotAvailable(s, 'paddock_23_14'), false);
  const a = getPlotAction(s, 'paddock_23_14');
  assert.equal(a.action, 'locked');
  assert.match(a.label, /east paddock/i);
});

test('buying it needs the North Field and a garage, and costs 1200', () => {
  const s = createNewState();
  s.coins = 50000;
  assert.equal(upgradeStatus(s, 'eastPaddock').state, 'locked', 'no North Field, no garage');
  s.unlocks.northField = true;
  assert.equal(upgradeStatus(s, 'eastPaddock').state, 'locked', 'still no garage');
  garageAt(s);
  assert.equal(upgradeStatus(s, 'eastPaddock').state, 'available');
  s.coins = 1199;
  assert.equal(upgradeStatus(s, 'eastPaddock').state, 'unaffordable');
  s.coins = 1200;
  assert.equal(purchaseUpgrade(s, 'eastPaddock').ok, true);
  assert.equal(s.coins, 0);
  assert.equal(isPlotAvailable(s, 'paddock_23_14'), true);
  assert.equal(purchaseUpgrade(s, 'eastPaddock').ok, false, 'bought once');
});

test('a building or a tractor inside the paddock blocks the purchase and names the thing in the way', () => {
  const s = ready();
  s.placed.push({ uid: 'b1', kind: 'building', type: 'storage_shed', x: 26, y: 17.5, level: 1, job: null, storage: {} });
  assert.match(paddockBlocker(s), /Storage Shed/);
  assert.equal(upgradeStatus(s, 'eastPaddock').state, 'blocked');
  assert.equal(purchaseUpgrade(s, 'eastPaddock').ok, false);
  assert.equal(s.coins, 50000, 'nothing is charged');
  s.placed.pop();
  s.vehicles.push({ uid: 'v1', type: 'tractor_small', x: 26 * TILE, y: 16 * TILE, heading: 0, speed: 0, fuel: 10, condition: 100, upgrade: 0, mount: { front: null, rear: null }, cargo: {}, engaged: false });
  assert.match(paddockBlocker(s), /tractor/);
  s.vehicles[0].x = 10 * TILE;
  assert.equal(paddockBlocker(s), null, 'outside the paddock is fine');
});

test('a building just outside the paddock does not block it', () => {
  const s = ready();
  s.placed.push({ uid: 'b2', kind: 'building', type: 'storage_shed', x: 20, y: 12, level: 1, job: null, storage: {} });
  assert.equal(paddockBlocker(s), null);
});

test('corn and wheat are sold once the paddock is bought', () => {
  const entries = SHOP_STOCK.filter((e) => ['seed_corn', 'seed_wheat'].includes(e.item));
  assert.equal(entries.length, 2);
  for (const e of entries) assert.deepEqual(e.requires, { unlock: 'eastPaddock' });
});

test('an old save without the paddock loads with it locked and keeps everything else', () => {
  const s = createNewState();
  s.coins = 777;
  const data = JSON.parse(serialize(s));
  delete data.unlocks.eastPaddock;
  const back = deserialize(data);
  assert.equal(back.unlocks.eastPaddock, false);
  assert.equal(back.coins, 777);
  assert.equal(back.plots.paddock_23_14.tilled, false);
});
