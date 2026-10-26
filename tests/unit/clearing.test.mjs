import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import { serialize, deserialize } from '../../src/systems/save.js';
import { clearInfo, clearables, clear } from '../../src/systems/clearing.js';
import { SCENERY } from '../../src/data/world.js';

const idx = (sprite, pred = () => true) => SCENERY.findIndex((e, i) => e[0] === sprite && pred(e, i));

test('border trees stay, inner trees bushes and rocks can be cleared', () => {
  assert.equal(clearInfo(idx('foliage.tree_oak', (e) => e[1] < 2)), null, 'west edge tree is permanent');
  assert.equal(clearInfo(idx('foliage.tree_oak', (e) => e[1] > 24 && e[2] > 20 && e[2] < 24)).name, 'tree');
  assert.equal(clearInfo(idx('foliage.bush_green')).name, 'bush');
  assert.equal(clearInfo(idx('foliage.rock_cluster')).name, 'boulder');
  assert.equal(clearInfo(idx('foliage.tree_stump')).name, 'tree stump');
  assert.equal(clearInfo(9999), null);
});

test('clearing costs coins, is recorded and cannot repeat', () => {
  const s = createNewState();
  const i = idx('foliage.bush_green');
  const cost = clearInfo(i).cost;
  s.coins = cost - 1;
  assert.equal(clear(s, i).ok, false);
  assert.equal(s.coins, cost - 1);
  s.coins = cost + 5;
  assert.equal(clear(s, i).ok, true);
  assert.equal(s.coins, 5);
  assert.deepEqual(s.cleared, [i]);
  assert.equal(clear(s, i).ok, false, 'already cleared');
  assert.ok(!clearables(s).some((c) => c.index === i));
});

test('cleared scenery survives save and load; bad entries are dropped', () => {
  const s = createNewState();
  s.coins = 500;
  const i = idx('foliage.rock_small');
  clear(s, i);
  assert.deepEqual(deserialize(serialize(s)).cleared, [i]);
  const bad = JSON.parse(serialize(s));
  bad.cleared = [i, i, 9999, -1, 'x', idx('foliage.tree_oak', (e) => e[1] < 2)];
  assert.deepEqual(deserialize(bad).cleared, [i]);
});

test('version 3 saves load with nothing cleared', () => {
  const s = deserialize({ version: 3, coins: 12, buildings: {}, placed: [], animals: [] });
  assert.equal(s.version, 5);
  assert.deepEqual(s.cleared, []);
});
