import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import * as E from '../../src/systems/economy.js';
import * as Inv from '../../src/systems/inventory.js';

test('buying validates funds and is atomic', () => {
  const s = createNewState();
  s.coins = 25;
  assert.equal(E.buy(s, 'seed_carrot', 3).ok, false);
  assert.equal(s.coins, 25);
  assert.equal(s.inventory.seed_carrot, 6);
  assert.ok(E.buy(s, 'seed_carrot', 2).ok);
  assert.equal(s.coins, 5);
  assert.equal(s.inventory.seed_carrot, 8);
});

test('locked stock cannot be bought', () => {
  const s = createNewState();
  s.coins = 1000;
  const r = E.buy(s, 'seed_tomato', 1);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Market Day/);
  s.quests.q_market_day.status = 'claimed';
  assert.ok(E.buy(s, 'seed_tomato', 1).ok);
});

test('selling pays the right amount and never goes negative', () => {
  const s = createNewState();
  s.inventory.carrot = 3;
  const before = s.coins;
  assert.ok(E.sell(s, 'carrot', 2).ok);
  assert.equal(s.coins, before + 44);
  assert.equal(E.sell(s, 'carrot', 2).ok, false);
  assert.equal(s.inventory.carrot, 1);
  assert.equal(E.sell(s, 'seed_carrot', 1).ok, false);
  assert.equal(E.sell(s, 'carrot', 0).ok, false);
});

test('upgrade purchase requires quest and coins, only once', () => {
  const s = createNewState();
  s.coins = 1000;
  assert.equal(E.purchaseUpgrade(s, 'gardenExpansion').ok, false);
  s.quests.q_market_day.status = 'claimed';
  assert.ok(E.purchaseUpgrade(s, 'gardenExpansion').ok);
  assert.equal(s.coins, 750);
  assert.equal(E.purchaseUpgrade(s, 'gardenExpansion').ok, false);
  assert.equal(s.coins, 750);
});

test('inventory rejects bad quantities and full bags', () => {
  const inv = {};
  assert.equal(Inv.add(inv, 'carrot', -1).ok, false);
  assert.equal(Inv.add(inv, 'nope', 1).ok, false);
  assert.equal(Inv.add(inv, 'carrot', 100).ok, false);
  assert.ok(Inv.add(inv, 'carrot', 99).ok);
  assert.equal(Inv.remove(inv, 'carrot', 100).ok, false);
  assert.equal(inv.carrot, 99);
});
