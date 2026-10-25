import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import * as Q from '../../src/systems/quests.js';
import * as F from '../../src/systems/farming.js';
import * as E from '../../src/systems/economy.js';
import { serialize, deserialize, saveGame, loadGame } from '../../src/systems/save.js';
import { EventBus } from '../../src/core/events.js';
import { advanceTime } from '../../src/systems/simulation.js';

function setup() {
  const s = createNewState();
  const bus = new EventBus();
  Q.attachQuests(() => s, bus);
  return { s, bus };
}

test('first quest is active on a new game', () => {
  const { s } = setup();
  assert.equal(s.quests.q_breaking_ground.status, 'active');
  assert.equal(s.quests.q_first_harvest.status, 'locked');
});

test('quests progress from real events and reward exactly once', () => {
  const { s, bus } = setup();
  const plots = ['starter_5_14', 'starter_6_14', 'starter_7_14'];
  for (const p of plots) F.till(s, p, bus);
  for (const p of plots) F.plant(s, p, bus);
  assert.equal(s.quests.q_breaking_ground.status, 'active');
  for (const p of plots) F.water(s, p, bus);
  assert.equal(s.quests.q_breaking_ground.status, 'complete');
  const coins = s.coins;
  assert.ok(Q.claim(s, 'q_breaking_ground', bus).ok);
  assert.equal(s.coins, coins + 15);
  assert.equal(Q.claim(s, 'q_breaking_ground', bus).ok, false);
  assert.equal(s.coins, coins + 15);
  assert.equal(s.quests.q_first_harvest.status, 'active');
  advanceTime(s, 300);
  for (const p of plots) F.harvest(s, p, bus);
  assert.equal(s.quests.q_first_harvest.status, 'complete');
  Q.claim(s, 'q_first_harvest', bus);
  assert.equal(s.inventory.seed_lettuce, 3);
  E.sell(s, 'carrot', 3, bus);
  assert.equal(s.quests.q_market_day.status, 'complete');
});

test('claim is refused if reward items do not fit', () => {
  const { s } = setup();
  s.quests.q_first_harvest.status = 'complete';
  s.inventory.seed_lettuce = 98;
  const r = Q.claim(s, 'q_first_harvest');
  assert.equal(r.ok, false);
  assert.equal(s.quests.q_first_harvest.status, 'complete');
  assert.equal(s.inventory.seed_lettuce, 98);
});

test('save round-trip preserves plots, inventory, quests and building levels', () => {
  const { s, bus } = setup();
  F.till(s, 'starter_5_14', bus);
  F.plant(s, 'starter_5_14', bus);
  F.water(s, 'starter_5_14', bus);
  advanceTime(s, 100);
  s.buildings.tool_shed.level = 2;
  s.can.capacity = 25;
  s.can.water = 20;
  const loaded = deserialize(serialize(s));
  assert.deepEqual(loaded.plots, s.plots);
  assert.deepEqual(loaded.inventory, s.inventory);
  assert.deepEqual(loaded.quests, s.quests);
  assert.equal(loaded.time, s.time);
  assert.equal(loaded.can.capacity, 25);
  assert.equal(loaded.can.water, 20);
});

test('malformed saves are sanitised or rejected safely', () => {
  const bad = deserialize({ version: 1, coins: -50, inventory: { carrot: 'x', gold: 5, seed_carrot: 1e9 },
    plots: { starter_5_14: { tilled: true, crop: 'dragonfruit', growth: 5 } }, quests: { q_breaking_ground: { status: 'hacked' } } });
  assert.equal(bad.coins, 0);
  assert.deepEqual(bad.inventory, { seed_carrot: 99 });
  assert.equal(bad.plots.starter_5_14.crop, null);
  assert.equal(bad.quests.q_breaking_ground.status, 'active');
  assert.throws(() => deserialize('not json'));
  assert.throws(() => deserialize({ version: 99 }));
});

test('storage wrappers report failures instead of throwing', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadGame(storage).ok, false);
  const s = createNewState();
  assert.ok(saveGame(storage, s).ok);
  assert.ok(loadGame(storage).ok);
  mem.set('farmstead.save', '{broken');
  assert.equal(loadGame(storage).ok, false);
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(saveGame(full, s).ok, false);
});
