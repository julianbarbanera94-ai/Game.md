import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import * as A from '../../src/systems/animals.js';
import * as B from '../../src/systems/buildings.js';
import * as E from '../../src/systems/economy.js';
import { advanceTime, sleep } from '../../src/systems/simulation.js';
import { serialize, deserialize } from '../../src/systems/save.js';
import { EventBus } from '../../src/core/events.js';
import { attachQuests } from '../../src/systems/quests.js';
import { SPECIES } from '../../src/data/animals.js';
import { pastureOf, pastureColliders } from '../../src/systems/pasture.js';

const free = () => true;

// A finished coop (and optionally barn) with plenty of coins.
function farm({ barn = false } = {}) {
  const s = createNewState();
  s.coins = 5000;
  s.quests.q_room_to_grow.status = 'claimed';
  s.quests.q_egg_money.status = 'claimed';
  const coop = B.place(s, 'chicken_coop', 20, 14, free).record;
  let barnRec = null;
  if (barn) barnRec = B.place(s, 'barn', 28, 14, free).record;
  advanceTime(s, 700);
  return { s, coop, barn: barnRec };
}

test('animal buildings are gated, take time to build, and have level capacities', () => {
  const s = createNewState();
  s.coins = 5000;
  assert.equal(B.placeableInfo(s, 'chicken_coop').state, 'locked');
  s.quests.q_room_to_grow.status = 'claimed';
  const r = B.place(s, 'chicken_coop', 20, 14, free);
  assert.ok(r.ok);
  assert.equal(s.coins, 5000 - 350);
  assert.equal(A.capacity({ type: 'chicken_coop', level: 1 }), 4);
  assert.equal(A.capacity({ type: 'barn', level: 3 }), 10);
  assert.equal(A.buy(s, 'chicken', r.record.uid).ok, false); // still under construction
  advanceTime(s, 480);
  assert.equal(r.record.level, 1);
});

test('buying: right home, capacity, funds; refunds half when sold', () => {
  const { s, coop } = farm();
  for (let i = 0; i < 4; i++) assert.ok(A.buy(s, 'chicken', coop.uid).ok);
  assert.equal(s.coins, 5000 - 350 - 4 * 60);
  const full = A.buy(s, 'chicken', coop.uid);
  assert.equal(full.ok, false);
  assert.match(full.reason, /full/);
  assert.equal(A.buy(s, 'cow', coop.uid).ok, false); // cows live in a barn
  const names = new Set(s.animals.map((a) => a.name));
  assert.equal(names.size, 4, 'each animal gets its own name');
  const before = s.coins;
  const sold = A.sell(s, s.animals[0].uid);
  assert.equal(sold.value, 30);
  assert.equal(s.coins, before + 30);
  assert.equal(s.animals.length, 3);
  s.coins = 10;
  assert.equal(A.buy(s, 'chicken', coop.uid).ok, false);
  assert.equal(s.coins, 10);
});

test('production only accrues while fed; hungry animals produce nothing', () => {
  const { s, coop } = farm();
  const hen = A.buy(s, 'chicken', coop.uid).animal;
  hen.fedUntil = s.time; // hungry now
  advanceTime(s, 1000);
  assert.equal(hen.stock, 0);
  assert.ok(A.isHungry(s, hen));
  const r = A.feedYard(s, coop.uid);
  assert.equal(r.ok, false); // no feed in the bag
  assert.match(r.reason, /feed/i);
  s.inventory.chicken_feed = 3;
  assert.ok(A.feedYard(s, coop.uid).ok);
  assert.equal(s.inventory.chicken_feed, 2);
  advanceTime(s, SPECIES.chicken.cycleMinutes / 1.25 + 1); // happy? not yet: base rate
  // happiness started at 50 (< 60), so base speed applies until it climbs
  assert.ok(hen.stock <= 1);
});

test('feeding is only for hungry animals and uses the matching feed', () => {
  const { s, coop, barn } = farm({ barn: true });
  advanceTime(s, 700);
  const hen = A.buy(s, 'chicken', coop.uid).animal;
  const cow = A.buy(s, 'cow', barn.uid).animal;
  s.inventory.chicken_feed = 5;
  s.inventory.hay = 5;
  assert.equal(A.feedYard(s, coop.uid).ok, false); // newly bought animals arrive fed
  hen.fedUntil = s.time - 1;
  cow.fedUntil = s.time - 1;
  assert.ok(A.feedYard(s, coop.uid).ok);
  assert.equal(s.inventory.chicken_feed, 4);
  assert.equal(s.inventory.hay, 5, "the coop's feeding doesn't touch hay");
  assert.ok(A.feedYard(s, barn.uid).ok);
  assert.equal(s.inventory.hay, 4);
});

test('products accumulate, stop at the stock cap, and collecting never duplicates', () => {
  const { s, coop } = farm();
  const hen = A.buy(s, 'chicken', coop.uid).animal;
  s.inventory.chicken_feed = 99;
  const keepFed = () => { hen.fedUntil = s.time + 5000; };
  keepFed();
  advanceTime(s, SPECIES.chicken.cycleMinutes);
  assert.equal(hen.stock, 1);
  keepFed();
  advanceTime(s, SPECIES.chicken.cycleMinutes * 10);
  assert.equal(hen.stock, SPECIES.chicken.maxStock);
  const r = A.collect(s, hen.uid);
  assert.ok(r.ok && r.qty === SPECIES.chicken.maxStock);
  assert.equal(s.inventory.egg, SPECIES.chicken.maxStock);
  assert.equal(A.collect(s, hen.uid).ok, false);
  assert.equal(s.inventory.egg, SPECIES.chicken.maxStock);
});

test('a full bag keeps the product with the animal', () => {
  const { s, coop } = farm();
  const hen = A.buy(s, 'chicken', coop.uid).animal;
  hen.stock = 2;
  s.inventory = {};
  for (let i = 0; i < 16; i++) s.inventory[`seed_${['carrot', 'lettuce', 'potato', 'tomato', 'strawberry', 'pumpkin', 'corn', 'wheat'][i % 8]}`] = 1;
  s.inventory.hay = 1; s.inventory.chicken_feed = 1; s.inventory.carrot = 1; s.inventory.lettuce = 1; s.inventory.potato = 1;
  s.inventory.tomato = 1; s.inventory.corn = 1; s.inventory.wheat = 1;
  const r = A.collect(s, hen.uid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /bag is full/);
  assert.equal(hen.stock, 2);
  assert.equal(s.inventory.egg, undefined);
});

test('happy animals produce faster; hunger lowers happiness; petting has a cooldown', () => {
  const { s, coop } = farm();
  const a = A.buy(s, 'chicken', coop.uid).animal;
  const b = A.buy(s, 'chicken', coop.uid).animal;
  a.happiness = 90; b.happiness = 10;
  a.fedUntil = b.fedUntil = s.time + 100000;
  advanceTime(s, 300);
  const made = (x) => x.stock * SPECIES.chicken.cycleMinutes + x.progress; // total production so far
  assert.ok(made(a) > made(b), 'happy hen is ahead');
  const hungry = A.buy(s, 'chicken', coop.uid).animal;
  hungry.fedUntil = s.time - 1; hungry.happiness = 70;
  advanceTime(s, 300);
  assert.ok(hungry.happiness < 70);
  const p = A.pet(s, a.uid);
  assert.ok(p.ok);
  assert.equal(A.pet(s, a.uid).ok, false);
  advanceTime(s, 241);
  assert.ok(A.pet(s, a.uid).ok);
});

test('selling products pays market prices; animal quests advance from real events', () => {
  const { s, coop } = farm();
  const bus = new EventBus();
  attachQuests(() => s, bus);
  s.quests.q_coop.status = 'complete';
  s.quests.q_coop.status = 'claimed';
  s.quests.q_first_hens.status = 'active';
  const h1 = A.buy(s, 'chicken', coop.uid, bus).animal;
  const h2 = A.buy(s, 'chicken', coop.uid, bus).animal;
  assert.equal(s.quests.q_first_hens.progress[0], 2);
  h1.fedUntil = h2.fedUntil = s.time - 1;
  s.inventory.chicken_feed = 5;
  A.feedYard(s, coop.uid, bus);
  assert.equal(s.quests.q_first_hens.status, 'complete');
  s.quests.q_first_hens.status = 'claimed';
  s.quests.q_egg_money.status = 'active';
  h1.stock = 3; h2.stock = 1;
  A.collectYard(s, coop.uid, bus);
  assert.equal(s.inventory.egg, 4);
  assert.equal(s.quests.q_egg_money.progress[0], 4);
  const before = s.coins;
  assert.ok(E.sell(s, 'egg', 4, bus).ok);
  assert.equal(s.coins - before, 48);
  assert.equal(s.quests.q_egg_money.status, 'complete');
});

test('market sells feed only once the matching building exists', () => {
  const s = createNewState();
  s.coins = 500;
  assert.equal(E.buy(s, 'chicken_feed', 1).ok, false);
  const { s: s2 } = farm();
  assert.ok(E.buy(s2, 'chicken_feed', 2).ok);
  assert.equal(E.buy(s2, 'hay', 1).ok, false); // no barn yet
});

test('sleeping keeps livestock producing; saves round-trip animals exactly', () => {
  const { s, coop } = farm();
  const hen = A.buy(s, 'chicken', coop.uid).animal;
  hen.fedUntil = s.time + 5000;
  sleep(s);
  assert.ok(hen.stock >= 1 || hen.progress > 0);
  const loaded = deserialize(serialize(s));
  assert.deepEqual(loaded.animals, s.animals);
  assert.deepEqual(loaded.placed, s.placed);
});

test('corrupt livestock data is dropped; old saves load with no animals', () => {
  const { s, coop } = farm();
  A.buy(s, 'chicken', coop.uid);
  const data = JSON.parse(serialize(s));
  data.animals.push({ uid: 'x1', species: 'dragon', home: coop.uid });
  data.animals.push({ uid: 'x2', species: 'cow', home: coop.uid }); // wrong home type
  data.animals.push({ uid: 'x3', species: 'chicken', home: 'nope' });
  data.animals.push({ uid: data.animals[0].uid, species: 'chicken', home: coop.uid }); // duplicate uid
  data.animals[0].stock = 999;
  data.animals[0].happiness = -50;
  for (let i = 0; i < 10; i++) data.animals.push({ uid: `y${i}`, species: 'chicken', home: coop.uid });
  const loaded = deserialize(data);
  assert.equal(loaded.animals.length, 4, 'capped at the coop capacity');
  assert.equal(loaded.animals[0].stock, SPECIES.chicken.maxStock);
  assert.equal(loaded.animals[0].happiness, 0);
  const v2 = deserialize({ version: 2, coins: 10, buildings: {}, placed: [] });
  assert.deepEqual(v2.animals, []);
});

test('pasture geometry: gate gap in the bottom fence, roaming bounds inside the fence', () => {
  const g = pastureOf('chicken_coop', 20, 14);
  assert.ok(g.bounds.x0 > g.rect.x0 && g.bounds.x1 < g.rect.x1 && g.bounds.y1 < g.rect.y1);
  const cols = pastureColliders('chicken_coop', 20, 14);
  const bottom = cols.filter((c) => c.y0 > g.rect.y1 - 0.3);
  assert.equal(bottom.length, 2);
  assert.ok(bottom[0].x1 <= g.gate[0] + 1e-9 && bottom[1].x0 >= g.gate[1] - 1e-9, 'gate is open');
  assert.ok(g.gate[1] - g.gate[0] >= 1.2, 'gate wide enough for the player');
});

import { AnimalActors } from '../../src/world/animalActors.js';
import { animalFrame, ANIMAL_KEYS } from '../../src/render/animals.js';
import { TILE } from '../../src/config.js';

test('animals wander inside their pasture, are created and removed with the herd', () => {
  const { s, coop } = farm();
  for (let i = 0; i < 4; i++) A.buy(s, 'chicken', coop.uid);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const actors = new AnimalActors(rand);
  actors.sync(s);
  assert.equal(actors.list().length, 4);
  const g = pastureOf('chicken_coop', coop.x, coop.y);
  let moved = false;
  for (let i = 0; i < 6000; i++) {
    actors.update(1 / 60);
    for (const ac of actors.list()) {
      assert.ok(ac.x >= g.bounds.x0 * TILE - 0.01 && ac.x <= g.bounds.x1 * TILE + 0.01, 'x inside the fence');
      assert.ok(ac.y >= g.bounds.y0 * TILE - 0.01 && ac.y <= g.bounds.y1 * TILE + 0.01, 'y inside the fence');
      if (ac.moving) moved = true;
    }
  }
  assert.ok(moved, 'they actually walk around');
  A.sell(s, s.animals[0].uid);
  actors.sync(s);
  assert.equal(actors.list().length, 3);
});

test('every animal frame the renderer can ask for exists in the manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../../assets/manifest.json', import.meta.url))).assets;
  for (const k of ANIMAL_KEYS) assert.ok(manifest[k], `missing sprite ${k}`);
  for (const k of ['icon.product_egg', 'icon.product_milk', 'icon.product_wool', 'icon.feed_chicken', 'icon.feed_hay']) assert.ok(manifest[k], k);
  for (const sp of ['chicken', 'cow', 'sheep']) {
    for (const facing of ['up', 'down', 'left', 'right']) {
      for (const moving of [true, false]) {
        const f = animalFrame(sp, { facing, moving, t: 1.3 });
        assert.ok(manifest[f.key], `${sp} ${facing} -> ${f.key}`);
      }
    }
  }
});
