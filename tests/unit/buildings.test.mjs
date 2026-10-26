import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import * as B from '../../src/systems/buildings.js';
import * as F from '../../src/systems/farming.js';
import * as E from '../../src/systems/economy.js';
import * as S from '../../src/systems/storage.js';
import { advanceTime, sleep } from '../../src/systems/simulation.js';
import { serialize, deserialize } from '../../src/systems/save.js';
import { EventBus } from '../../src/core/events.js';
import { attachQuests } from '../../src/systems/quests.js';

const free = () => true;

test('upgrade is gated, charged once, and finishes after construction time', () => {
  const s = createNewState();
  s.coins = 1000;
  const target = { id: 'tool_shed' };
  assert.equal(B.upgradeInfo(s, target).state, 'locked');
  s.quests.q_first_harvest.status = 'claimed';
  assert.equal(B.upgradeInfo(s, target).state, 'available');
  assert.ok(B.startUpgrade(s, target).ok);
  assert.equal(s.coins, 850);
  assert.equal(B.startUpgrade(s, target).ok, false); // already building
  assert.equal(s.coins, 850);
  assert.equal(s.can.capacity, 10);
  advanceTime(s, 179);
  assert.equal(B.buildingLevel(s, 'tool_shed'), 1);
  advanceTime(s, 1);
  assert.equal(B.buildingLevel(s, 'tool_shed'), 2);
  assert.equal(s.can.capacity, 25);
  assert.equal(s.can.water, 25);
});

test('house level raises bag capacity', () => {
  const s = createNewState();
  assert.equal(B.bagSlots(s), 16);
  s.buildings.house.level = 2;
  assert.equal(B.bagSlots(s), 24);
});

test('market stall level raises sell prices', () => {
  const s = createNewState();
  s.inventory.pumpkin = 1;
  s.buildings.market_stall.level = 3;
  const before = s.coins;
  assert.ok(E.sell(s, 'pumpkin', 1).ok);
  assert.equal(s.coins - before, Math.round(160 * 1.25));
});

test('well level 2 waters the starter bed each morning; level 3 waters everything', () => {
  const s = createNewState();
  s.unlocks.gardenExpansion = true;
  for (const id of ['starter_5_14', 'south_5_17']) {
    s.plots[id] = { tilled: true, crop: 'pumpkin', growth: 0, moistUntil: 0, variant: 0 };
  }
  s.buildings.well.level = 2;
  sleep(s);
  assert.ok(F.isWet(s, s.plots.starter_5_14));
  assert.ok(!F.isWet(s, s.plots.south_5_17));
  s.buildings.well.level = 3;
  sleep(s);
  assert.ok(F.isWet(s, s.plots.south_5_17));
  // growth continued overnight on the auto-watered starter plot
  assert.ok(s.plots.starter_5_14.growth > 0);
});

test('level 3 workshop can waters a row of three', () => {
  const s = createNewState();
  s.buildings.tool_shed.level = 3;
  B.applyLevelEffects(s);
  for (const c of [5, 6, 7]) s.plots[`starter_${c}_14`] = { tilled: true, crop: 'carrot', growth: 0, moistUntil: 0, variant: 0 };
  const r = F.water(s, 'starter_6_14');
  assert.deepEqual(r.watered.sort(), ['starter_5_14', 'starter_6_14', 'starter_7_14']);
  assert.equal(s.can.water, 39);
});

test('placing a storage shed: validation, construction, storage transfers', () => {
  const s = createNewState();
  const bus = new EventBus();
  attachQuests(() => s, bus);
  s.coins = 500;
  assert.equal(B.place(s, 'storage_shed', 20, 16, free, bus).ok, false); // locked
  s.quests.q_restock.status = 'claimed';
  s.quests.q_storage.status = 'active';
  assert.equal(B.place(s, 'storage_shed', 20, 16, () => false, bus).ok, false); // blocked spot
  assert.equal(s.coins, 500);
  const r = B.place(s, 'storage_shed', 20, 16, free, bus);
  assert.ok(r.ok);
  assert.equal(s.coins, 300);
  const uid = r.record.uid;
  s.inventory.carrot = 5;
  assert.equal(S.deposit(s, uid, 'carrot', 2).ok, false); // still under construction
  advanceTime(s, 360, bus);
  assert.equal(r.record.level, 1);
  assert.equal(s.quests.q_storage.status, 'complete');
  assert.ok(S.deposit(s, uid, 'carrot', 3).ok);
  assert.equal(s.inventory.carrot, 2);
  assert.equal(r.record.storage.carrot, 3);
  assert.equal(S.withdraw(s, uid, 'carrot', 4).ok, false);
  assert.ok(S.withdraw(s, uid, 'carrot', 3).ok);
  assert.equal(s.inventory.carrot, 5);
  const loaded = deserialize(serialize(s));
  assert.deepEqual(loaded.placed, s.placed);
});

test('decorations place instantly and persist', () => {
  const s = createNewState();
  s.coins = 100;
  assert.ok(B.place(s, 'scarecrow', 12, 20, free).ok);
  assert.equal(s.coins, 60);
  assert.equal(s.placed[0].level, 1);
  assert.equal(deserialize(serialize(s)).placed[0].type, 'scarecrow');
});

test('version 1 saves migrate: large watering can becomes workshop level 2', () => {
  const v1 = { version: 1, time: 500, coins: 77, unlocks: { gardenExpansion: true, wateringCan2: true }, can: { water: 20, capacity: 25 } };
  const s = deserialize(v1);
  assert.equal(s.version, 7);
  assert.equal(B.buildingLevel(s, 'tool_shed'), 2);
  assert.equal(s.can.capacity, 25);
  assert.equal(s.can.water, 20);
  assert.equal(s.unlocks.gardenExpansion, true);
  assert.equal('wateringCan2' in s.unlocks, false);
  assert.deepEqual(s.placed, []);
});

test('corrupt building data is rejected safely', () => {
  const s = deserialize({ version: 2, buildings: { house: { level: 99, job: { toLevel: 7, start: 5, end: 1 } } },
    placed: [{ uid: 'x', type: 'castle', x: 1, y: 1 }, { uid: 'y', type: 'storage_shed', x: 3, y: 3, level: 0 }] });
  assert.equal(s.buildings.house.level, 3);
  assert.equal(s.buildings.house.job, null);
  assert.deepEqual(s.placed, []);
});
