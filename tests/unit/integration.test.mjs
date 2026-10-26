// Phase 9: the systems share one state and every reward or purchase can only happen once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import { serialize, deserialize, saveGame, loadGame, hasSave, savePreview, BACKUP_KEY } from '../../src/systems/save.js';
import { EventBus } from '../../src/core/events.js';
import { attachQuests, claim as claimQuest } from '../../src/systems/quests.js';
import { attachProgress, claimAchievement } from '../../src/systems/progress.js';
import * as Econ from '../../src/systems/economy.js';
import * as Orders from '../../src/systems/orders.js';
import * as Relations from '../../src/systems/relations.js';
import * as Animals from '../../src/systems/animals.js';
import * as Clearing from '../../src/systems/clearing.js';
import * as V from '../../src/systems/vehicles.js';
import * as F from '../../src/systems/farming.js';
import { advanceTime } from '../../src/systems/simulation.js';
import { SAVE_KEY } from '../../src/config.js';
import { NPCS } from '../../src/data/npcs.js';

function world() {
  const s = createNewState();
  const bus = new EventBus();
  attachQuests(() => s, bus);
  attachProgress(() => s, bus);
  return { s, bus };
}
const memStorage = () => {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const snapshot = (s) => JSON.stringify({ coins: s.coins, inv: s.inventory, unlocks: s.unlocks, orders: s.orders, rel: s.relations, ach: s.achievements });

test('one inventory and purse: hand-farmed crops sell, the coins buy seeds, a delivery uses the same bag', () => {
  const { s, bus } = world();
  const plot = 'starter_5_14';
  assert.ok(F.till(s, plot, bus).ok);
  s.selectedSeed = 'seed_carrot';
  assert.ok(F.plant(s, plot, bus).ok);
  assert.ok(F.water(s, plot, bus).ok);
  advanceTime(s, 300, bus);
  const h = F.harvest(s, plot, bus);
  assert.ok(h.ok, h.reason);
  assert.equal(s.inventory.carrot, h.qty);
  const before = s.coins;
  assert.ok(Econ.sell(s, 'carrot', 1, bus).ok);
  assert.ok(s.coins > before);
  assert.ok(Econ.buy(s, 'seed_carrot', 1, bus).ok);
  assert.equal(s.counters.harvest, h.qty, 'achievement counters see the same harvest');
});

test('rewards and purchases cannot be repeated', () => {
  const { s, bus } = world();
  s.coins = 50000;
  s.xp = 300;
  // quest reward
  s.quests.q_breaking_ground.status = 'complete';
  assert.ok(claimQuest(s, 'q_breaking_ground', bus).ok);
  const afterQuest = s.coins;
  assert.equal(claimQuest(s, 'q_breaking_ground', bus).ok, false);
  assert.equal(s.coins, afterQuest);
  // achievement reward
  s.counters.harvest = 1;
  assert.ok(claimAchievement(s, 'first_harvest', bus).ok);
  const afterAch = s.coins;
  assert.equal(claimAchievement(s, 'first_harvest', bus).ok, false);
  assert.equal(s.coins, afterAch);
  // land unlock
  s.quests.q_market_day.status = 'claimed';
  const up = Econ.upgradeStatus(s, 'gardenExpansion');
  if (up.state === 'available') {
    assert.ok(Econ.purchaseUpgrade(s, 'gardenExpansion', bus).ok);
    const c = s.coins;
    assert.equal(Econ.purchaseUpgrade(s, 'gardenExpansion', bus).ok, false);
    assert.equal(s.coins, c);
  }
  // implements are one of each
  s.placed.push({ uid: 'p9', kind: 'building', type: 'garage', x: 21.5, y: 15.2, level: 1, job: null, storage: {} });
  assert.ok(V.buyImplement(s, 'plough', bus).ok);
  const c2 = s.coins;
  assert.equal(V.buyImplement(s, 'plough', bus).ok, false);
  assert.equal(s.coins, c2);
  // scenery clears once
  const idx = Clearing.clearables(s)[0];
  if (idx != null) {
    const i = typeof idx === 'object' ? idx.index : idx;
    assert.ok(Clearing.clear(s, i, bus).ok);
    const c3 = s.coins;
    assert.equal(Clearing.clear(s, i, bus).ok, false);
    assert.equal(s.coins, c3);
  }
});

test('deliveries pay once and only with the goods', () => {
  const { s, bus } = world();
  const ord = s.orders.list.find((o) => o.status === 'open');
  assert.ok(ord, 'a request is posted on day 1');
  assert.ok(Orders.accept(s, ord.id, bus).ok);
  assert.equal(Orders.accept(s, ord.id, bus).ok, false);
  const before = snapshot(s);
  assert.equal(Orders.deliver(s, ord.id, ord.giver, bus).ok, false, 'no goods, no delivery');
  assert.equal(snapshot(s), before, 'a refused delivery changes nothing');
  s.inventory[ord.item] = ord.qty;
  const coins = s.coins;
  assert.ok(Orders.deliver(s, ord.id, ord.giver, bus).ok);
  assert.equal(s.coins, coins + ord.coins);
  assert.equal(s.inventory[ord.item] || 0, 0);
  s.inventory[ord.item] = ord.qty;
  assert.equal(Orders.deliver(s, ord.id, ord.giver, bus).ok, false, 'already delivered');
  assert.equal(s.inventory[ord.item], ord.qty);
});

test('a refused purchase or sale leaves everything untouched', () => {
  const { s, bus } = world();
  s.coins = 5;
  const before = snapshot(s);
  assert.equal(Econ.buy(s, 'seed_carrot', 1, bus).ok, false);
  assert.equal(Econ.sell(s, 'carrot', 3, bus).ok, false);
  assert.equal(Econ.buy(s, 'seed_carrot', -2, bus).ok, false);
  assert.equal(Econ.buy(s, 'seed_carrot', 1.5, bus).ok, false);
  assert.equal(snapshot(s), before);
});

test('animal goods are collected once', () => {
  const { s, bus } = world();
  s.placed.push({ uid: 'c1', kind: 'building', type: 'chicken_coop', x: 22, y: 15, level: 1, job: null, storage: {} });
  s.coins = 1000;
  const a = Animals.buy(s, 'chicken', 'c1', bus).animal;
  a.stock = 2;
  assert.ok(Animals.collect(s, a.uid, bus).ok);
  assert.equal(s.inventory.egg, 2);
  assert.equal(Animals.collect(s, a.uid, bus).ok, false);
  assert.equal(s.inventory.egg, 2);
});

test('gifts: one per villager per day, favourites count more, only produce and animal goods', () => {
  const { s, bus } = world();
  const mara = NPCS.mara;
  s.inventory.carrot = 2;
  s.inventory[mara.likes[0]] = 1;
  assert.equal(Relations.gift(s, 'mara', 'seed_carrot', bus).ok, false, 'seeds are not a present');
  const liked = Relations.gift(s, 'mara', mara.likes[0], bus);
  assert.ok(liked.ok && liked.liked);
  assert.equal(s.relations.mara.points, Relations.GIFT_POINTS.liked);
  assert.equal(s.inventory[mara.likes[0]] || 0, 0);
  const again = Relations.gift(s, 'mara', 'carrot', bus);
  assert.equal(again.ok, false, 'second gift the same day is refused');
  assert.equal(s.inventory.carrot, 2, 'and keeps the item');
  const other = Relations.gift(s, 'bram', 'carrot', bus);
  assert.ok(other.ok, 'another villager can still get one');
  assert.equal(s.relations.bram.points, NPCS.bram.likes.includes('carrot') ? Relations.GIFT_POINTS.liked : Relations.GIFT_POINTS.other);
  s.time += 24 * 60;
  assert.ok(Relations.canGift(s, 'mara'), 'tomorrow Mara accepts presents again');
  assert.equal(s.counters.gifts, 2);
  const back = deserialize(serialize(s));
  assert.equal(back.relations.mara.lastGiftDay, s.relations.mara.lastGiftDay, 'the gift day is saved');
  assert.equal(Relations.gift(s, 'nobody', 'carrot', bus).ok, false);
});

test('settings are saved and sanitised', () => {
  const s = createNewState();
  s.settings = { muted: true, volume: 0.3, music: 0.2, ambience: 0.9, vibration: false, zoom: 'far', bigControls: true };
  const back = deserialize(serialize(s));
  assert.deepEqual(back.settings, { muted: true, volume: 0.3, music: 0.2, ambience: 0.9, vibration: false, zoom: 'far', bigControls: true });
  const bad = deserialize({ ...JSON.parse(serialize(s)), settings: { muted: 'yes', volume: 7, music: -1, ambience: 'loud', vibration: 'no', zoom: 'giant', bigControls: 0 } });
  assert.equal(bad.settings.volume, 1);
  assert.equal(bad.settings.music, 0);
  assert.equal(bad.settings.ambience, 0.5);
  assert.equal(bad.settings.vibration, true);
  assert.equal(bad.settings.zoom, 'normal');
  assert.equal(bad.settings.bigControls, false);
});

test('the previous save is kept as a backup and used when the latest one is damaged', () => {
  const st = memStorage();
  const s = createNewState();
  s.coins = 111;
  assert.ok(saveGame(st, s).ok);
  assert.equal(st.getItem(BACKUP_KEY), null, 'nothing to back up on the first save');
  s.coins = 222;
  assert.ok(saveGame(st, s).ok);
  assert.equal(JSON.parse(st.getItem(BACKUP_KEY)).coins, 111);
  assert.equal(loadGame(st).state.coins, 222);
  st.setItem(SAVE_KEY, '{"version": 7, "coins": tru'); // a write cut short
  const r = loadGame(st);
  assert.ok(r.ok && r.recovered, 'the backup is loaded');
  assert.equal(r.state.coins, 111);
  assert.match(r.reason, /damaged/);
  assert.equal(savePreview(st).recovered, true);
  // saving again must not overwrite the good backup with the damaged file
  s.coins = 333;
  assert.ok(saveGame(st, s).ok);
  assert.equal(JSON.parse(st.getItem(BACKUP_KEY)).coins, 111);
  assert.equal(loadGame(st).state.coins, 333);
  // only a backup left: still a game to continue
  st.removeItem(SAVE_KEY);
  assert.ok(hasSave(st));
  assert.equal(loadGame(st).state.coins, 111);
});
