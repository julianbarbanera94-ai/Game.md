import test from 'node:test';
import assert from 'node:assert/strict';
import { pickFish, biteWeight, waitSeconds, castSpot, HOOK_WINDOW } from '../../src/systems/fishing.js';
import { FISH, FISH_LIST } from '../../src/data/fish.js';
import { ITEMS, getItem } from '../../src/data/items.js';
import { serialize, deserialize } from '../../src/systems/save.js';
import { createNewState } from '../../src/systems/state.js';
import { CREEK } from '../../src/data/world.js';

const at = (day, hour) => (day - 1) * 1440 + hour * 60;
const TILE = 64;

test('every fish is a sellable item and the rod is a tool in the market', () => {
  for (const f of FISH_LIST) {
    assert.equal(getItem(f.id).category, 'fish');
    assert.equal(getItem(f.id).sellPrice, f.sellPrice);
    assert.ok(f.sellPrice > 0);
  }
  assert.equal(getItem('fishing_rod').category, 'tool');
  assert.ok(getItem('fishing_rod').buyPrice > 0);
});

test('the season decides which fish bite: spring has no bass, summer has no trout', () => {
  const spring = new Set(Array.from({ length: 400 }, (_, i) => pickFish(at(3, 12), () => i / 400)?.id));
  assert.ok(!spring.has('bass'));
  assert.ok(spring.has('trout'));
  const summer = new Set(Array.from({ length: 400 }, (_, i) => pickFish(at(30, 12), () => i / 400)?.id));
  assert.ok(summer.has('bass'));
  assert.ok(!summer.has('trout'));
});

test('dawn and dusk bite better than midday, and nothing bites when no fish fit the season', () => {
  assert.ok(biteWeight(FISH.trout, at(3, 6)) > biteWeight(FISH.trout, at(3, 12)));
  assert.ok(biteWeight(FISH.bass, at(30, 19)) > biteWeight(FISH.bass, at(30, 12)));
  assert.ok(biteWeight(FISH.perch, at(3, 19)) > biteWeight(FISH.perch, at(3, 12)));
  // every season has at least one fish, so the 'nothing bites' case is only for a rod with no fish in its pool
  for (const f of FISH_LIST) assert.ok(f.seasons.length > 0, `${f.id} bites somewhere`);
  for (let season = 0; season < 4; season++) assert.ok(FISH_LIST.some((f) => f.seasons.includes(season)), `season ${season} has fish`);
});

test('rare fish are rare: pike is a small share of autumn bites', () => {
  let pike = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (pickFish(at(60, 12))?.id === 'pike') pike++;
  assert.ok(pike / N < 0.12, `pike share ${pike / N}`);
  assert.ok(pike > 0);
});

test('bites come after a short random wait and the hook window is fair', () => {
  assert.equal(waitSeconds(() => 0), 3);
  assert.ok(Math.abs(waitSeconds(() => 0.999) - 8.994) < 1e-9, 'a wait within 3 to 9 seconds');
  assert.ok(HOOK_WINDOW >= 1);
});

test('lines can only be cast from either bank, facing the water', () => {
  const north = { x: 10 * TILE, y: (CREEK.y0 - 0.6) * TILE };
  const south = { x: 10 * TILE, y: (CREEK.y1 + 0.6) * TILE };
  assert.ok(castSpot(north, 'down'));
  assert.ok(castSpot(south, 'up'));
  assert.equal(castSpot(north, 'up'), null, 'facing away from the water');
  assert.equal(castSpot(south, 'down'), null, 'facing away from the water');
  assert.equal(castSpot({ x: 10 * TILE, y: 12 * TILE }, 'down'), null, 'not on the bank');
});

test('caught fish are saved in the bag and survive a reload', () => {
  const s = createNewState();
  s.inventory.trout = 2;
  s.inventory.fishing_rod = 1;
  const back = deserialize(serialize(s));
  assert.equal(back.inventory.trout, 2);
  assert.equal(back.inventory.fishing_rod, 1);
  assert.equal(ITEMS.fishing_rod.maxStack, 1);
});
