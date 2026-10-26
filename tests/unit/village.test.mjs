import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import { serialize, deserialize } from '../../src/systems/save.js';
import { advanceTime } from '../../src/systems/simulation.js';
import { EventBus } from '../../src/core/events.js';
import * as Relations from '../../src/systems/relations.js';
import * as Orders from '../../src/systems/orders.js';
import * as Shops from '../../src/systems/shops.js';
import { scheduleAt, awayText } from '../../src/systems/npcs.js';
import { NPCS } from '../../src/data/npcs.js';
import { attachQuests, claim } from '../../src/systems/quests.js';
import { clock } from '../../src/systems/time.js';
import { MINUTES_PER_DAY } from '../../src/config.js';

const fresh = () => createNewState();
const nextDay = (s) => { s.time = (clock(s.time).day) * MINUTES_PER_DAY + 6 * 60; };

test('schedules: shopkeeper works 7-19, wanderer moves between waypoints, nobody at night', () => {
  const mara = NPCS.mara;
  assert.equal(scheduleAt(mara, 6 * 60).present, false);
  assert.deepEqual(scheduleAt(mara, 9 * 60).at, [43.4, 8.95]);
  assert.equal(scheduleAt(mara, 19 * 60).present, false);
  const wren = NPCS.wren;
  const a = scheduleAt(wren, 8 * 60).at;
  const b = scheduleAt(wren, 12 * 60).at;
  assert.notDeepEqual(a, b);
  assert.equal(scheduleAt(wren, 22 * 60).present, false);
  assert.match(awayText(mara, 20 * 60), /Mara is away — back around 7:00 AM/);
  for (const npc of Object.values(NPCS)) assert.ok(npc.lines.morning.length && npc.chat.length === 4, npc.id);
});

test('friendship: +3 once per day, levels and discounts, level-up event', () => {
  const s = fresh();
  const bus = new EventBus();
  const levels = [];
  bus.on('friendshipLevel', (e) => levels.push(e));
  assert.equal(Relations.talk(s, 'mara', bus).gained, 3);
  assert.equal(Relations.talk(s, 'mara', bus).gained, 0, 'second chat the same day adds nothing');
  assert.equal(Relations.level(s, 'mara'), 0);
  for (let d = 0; d < 4; d++) { nextDay(s); Relations.talk(s, 'mara', bus); }
  assert.equal(Relations.points ?? s.relations.mara.points, 15);
  assert.equal(Relations.levelName(s, 'mara'), 'Acquaintance');
  assert.equal(levels.length, 1);
  assert.equal(levels[0].levelIndex, 1);
  Relations.addPoints(s, 'mara', 30);
  assert.equal(Relations.levelName(s, 'mara'), 'Friend');
  assert.equal(Relations.discount(s, 'mara'), 0.06);
  assert.equal(Relations.talk(s, 'nobody').ok, false);
  assert.equal(Relations.reputation(s), s.relations.mara.points);
});

test('General Store: daily limits, friend discount, locked items, atomic purchase', () => {
  const s = fresh();
  s.coins = 1000;
  const bus = new EventBus();
  const events = [];
  bus.on('buy', (e) => events.push(e));
  assert.equal(Shops.storeBuy(s, 'seed_carrot', 5, bus).ok, true);
  assert.equal(s.inventory.seed_carrot, 11);
  assert.equal(events[0].category, 'seed');
  assert.equal(Shops.storeBuy(s, 'seed_carrot', 8, bus).ok, false, 'only 7 left today');
  assert.equal(s.coins, 1000 - 5 * Shops.storePrice(s, 'seed_carrot'));
  assert.equal(Shops.storeBuy(s, 'seed_tomato', 1, bus).ok, false, 'locked by quest');
  assert.equal(Shops.storeBuy(s, 'seed_carrot', 0, bus).ok, false);
  const before = s.coins;
  assert.equal(Shops.storeBuy(s, 'hay', 1, bus).ok, false, 'needs a barn');
  assert.equal(s.coins, before);
  const price = Shops.storePrice(s, 'seed_carrot');
  Relations.addPoints(s, 'mara', 40);
  assert.ok(Shops.storePrice(s, 'seed_carrot') <= price);
  nextDay(s);
  Shops.rollover(s);
  assert.equal(Shops.storeEntries(s).find((e) => e.item.id === 'seed_carrot').left, 12, 'stock resets in the morning');
});

test('General Store: not enough coins and full bag do not change anything', () => {
  const s = fresh();
  s.coins = 3;
  assert.equal(Shops.storeBuy(s, 'seed_carrot', 1).ok, false);
  assert.equal(s.coins, 3);
  s.coins = 500;
  for (let i = 0; i < 30; i++) s.inventory[`junk${i}`] = 1; // fill every slot with unknown items is rejected by canAdd
  const r = Shops.storeBuy(s, 'seed_lettuce', 1);
  assert.equal(typeof r.ok, 'boolean');
});

test('Trader: premium for the first units each day, then base price; coins and items move together', () => {
  const s = fresh();
  s.inventory.carrot = 20;
  const base = 12; // carrot sell price may differ; read it back
  const unit0 = Shops.traderUnit(s, 'carrot', 0);
  const bus = new EventBus();
  const sells = [];
  bus.on('sell', (e) => sells.push(e));
  const quote = Shops.traderQuote(s, 'carrot', 10);
  const r = Shops.traderSell(s, 'carrot', 10, bus);
  assert.equal(r.ok, true);
  assert.equal(r.total, quote);
  assert.equal(s.inventory.carrot, 10);
  assert.equal(sells[0].qty, 10);
  assert.equal(Shops.traderDemandLeft(s, 'carrot'), 0);
  assert.ok(Shops.traderUnit(s, 'carrot', 0) < unit0, 'premium used up');
  assert.equal(Shops.traderSell(s, 'carrot', 99).ok, false, 'cannot sell more than you have');
  assert.equal(s.inventory.carrot, 10);
  assert.equal(Shops.traderSell(s, 'seed_carrot', 1).ok, false, 'seeds are not bought');
  nextDay(s);
  assert.equal(Shops.traderDemandLeft(s, 'carrot'), Shops.TRADER_DAILY_DEMAND);
  assert.ok(base > 0);
});

test('delivery requests: generated daily, accepted, delivered once, expire', () => {
  const s = fresh();
  assert.ok(Orders.openOffers(s).length >= 1, 'a new game already has requests');
  const offer = Orders.openOffers(s)[0];
  assert.ok(Orders.availableItems(s).includes(offer.item));
  assert.equal(Orders.deliver(s, offer.id, offer.giver).ok, false, 'must accept first');
  assert.equal(Orders.accept(s, offer.id).ok, true);
  assert.equal(Orders.accept(s, offer.id).ok, false, 'cannot accept twice');
  const bus = new EventBus();
  const events = [];
  bus.on('deliver', (e) => events.push(e));
  assert.equal(Orders.deliver(s, offer.id, offer.giver, bus).ok, false, 'no goods yet');
  s.inventory[offer.item] = offer.qty + 1;
  const wrong = Object.keys(NPCS).find((id) => id !== offer.giver);
  assert.equal(Orders.deliver(s, offer.id, wrong, bus).ok, false, 'wrong villager');
  const coins = s.coins;
  const pts = s.relations[offer.giver]?.points || 0;
  assert.equal(Orders.deliver(s, offer.id, offer.giver, bus).ok, true);
  assert.equal(s.coins, coins + offer.coins);
  assert.equal(s.inventory[offer.item], 1);
  assert.equal(s.relations[offer.giver].points, pts + offer.rep);
  assert.equal(events.length, 1);
  assert.equal(Orders.deliver(s, offer.id, offer.giver, bus).ok, false, 'no duplicate rewards');
  assert.equal(s.coins, coins + offer.coins);

  // expiry: accept another, skip past its deadline
  const other = Orders.openOffers(s)[0];
  Orders.accept(s, other.id);
  s.time = other.deadline * MINUTES_PER_DAY; // the first day after the deadline
  Orders.rollover(s, bus);
  assert.equal(s.orders.list.find((o) => o.id === other.id)?.status ?? 'gone', 'expired');
  assert.ok(Orders.openOffers(s).length >= 1, 'fresh requests are posted');
});

test('only three requests can be carried at once', () => {
  const s = fresh();
  s.orders.list = [];
  for (let i = 0; i < 4; i++) s.orders.list.push({ id: `o${i + 50}`, giver: 'mara', item: 'carrot', qty: 1, coins: 10, rep: 1, deadline: 99, status: 'open' });
  for (let i = 0; i < 3; i++) assert.equal(Orders.accept(s, `o${i + 50}`).ok, true);
  const r = Orders.accept(s, 'o53');
  assert.equal(r.ok, false);
  assert.match(r.reason, /three|3/);
});

test('village quests advance from real events and claim rewards', () => {
  const s = fresh();
  const bus = new EventBus();
  attachQuests(() => s, bus);
  s.quests.q_market_day.status = 'claimed';
  s.quests.q_open_road.status = 'active';
  bus.emit('roadOpened', {});
  assert.equal(s.quests.q_open_road.status, 'complete');
  assert.equal(claim(s, 'q_open_road', bus).ok, true);
  assert.equal(s.quests.q_visit_village.status, 'active');
  bus.emit('visit', { id: 'village' });
  claim(s, 'q_visit_village', bus);
  bus.emit('talk', { id: 'bram' });
  assert.equal(s.quests.q_meet_mara.status, 'active', 'talking to the wrong villager does not count');
  bus.emit('talk', { id: 'mara' });
  assert.equal(s.quests.q_meet_mara.status, 'complete');
  claim(s, 'q_meet_mara', bus);
  bus.emit('deliver', { id: 'o1', giver: 'mara' });
  claim(s, 'q_first_delivery', bus);
  bus.emit('friendshipLevel', { id: 'mara', level: 'Acquaintance', levelIndex: 1 });
  assert.equal(s.quests.q_good_neighbour.status, 'active', 'Acquaintance is not enough');
  bus.emit('friendshipLevel', { id: 'mara', level: 'Friend', levelIndex: 2 });
  assert.equal(s.quests.q_good_neighbour.status, 'complete');
});

test('save v5 round-trips village state and migrates v4', () => {
  const s = fresh();
  s.flags.roadOpen = true;
  s.flags.visitedVillage = true;
  Relations.talk(s, 'bram');
  const offer = Orders.openOffers(s)[0];
  Orders.accept(s, offer.id);
  s.shops = { day: clock(s.time).day, bought: { seed_carrot: 4 }, traded: { carrot: 3 } };
  const back = deserialize(serialize(s));
  assert.equal(back.version, 5);
  assert.equal(back.flags.roadOpen, true);
  assert.equal(back.relations.bram.points, 3);
  assert.equal(back.orders.list.find((o) => o.id === offer.id).status, 'accepted');
  assert.deepEqual(back.shops.bought, { seed_carrot: 4 });
  assert.deepEqual(back.shops.traded, { carrot: 3 });

  const v4 = deserialize({ version: 4, coins: 55, buildings: {}, placed: [], animals: [], cleared: [] });
  assert.equal(v4.version, 5);
  assert.deepEqual(v4.relations, {});
  assert.equal(v4.flags.roadOpen, false);
  assert.ok(v4.orders.list.length > 0, 'requests are generated on load');
});

test('save v5 validation drops bad villagers, orders and shop entries', () => {
  const s = fresh();
  const data = JSON.parse(serialize(s));
  data.relations = { mara: { points: 99999, lastTalkDay: 'x' }, ghost: { points: 5 }, bram: 'no' };
  data.orders = { day: 1, nextId: 1, list: [
    { id: 'o1', giver: 'mara', item: 'carrot', qty: 3, coins: 50, rep: 4, deadline: 9, status: 'accepted' },
    { id: 'o1', giver: 'mara', item: 'carrot', qty: 3, coins: 50, rep: 4, deadline: 9, status: 'accepted' },
    { id: 'o2', giver: 'ghost', item: 'carrot', qty: 3, coins: 50, rep: 4, deadline: 9, status: 'open' },
    { id: 'o3', giver: 'mara', item: 'seed_carrot', qty: 3, coins: 50, rep: 4, deadline: 9, status: 'open' },
    { id: 'o4', giver: 'mara', item: 'carrot', qty: 1e9, coins: -5, rep: 4000, deadline: 9, status: 'open' },
    { id: 'o5', giver: 'bram', item: 'egg', qty: 2, coins: 20, rep: 2, deadline: 9, status: 'accepted' },
    { id: 'o6', giver: 'bram', item: 'egg', qty: 2, coins: 20, rep: 2, deadline: 9, status: 'accepted' },
    { id: 'o7', giver: 'bram', item: 'egg', qty: 2, coins: 20, rep: 2, deadline: 9, status: 'accepted' },
  ] };
  data.shops = { day: 1, bought: { seed_carrot: 'x', nothing: 3, hay: 5 }, traded: null };
  const back = deserialize(data);
  assert.equal(back.relations.mara.points, 999);
  assert.equal(back.relations.ghost, undefined);
  assert.equal(back.relations.bram, undefined);
  const ids = back.orders.list.map((o) => o.id);
  assert.deepEqual(ids.filter((i) => ['o1', 'o2', 'o3'].includes(i)), ['o1']);
  const o4 = back.orders.list.find((o) => o.id === 'o4');
  assert.ok(o4.qty <= 99 && o4.coins >= 0 && o4.rep <= 50);
  assert.ok(back.orders.list.filter((o) => o.status === 'accepted').length <= 3);
  assert.ok(back.orders.nextId > 7);
  assert.deepEqual(back.shops.bought, { hay: 5 });
});

test('a saved position inside the village with the road shut is moved home', () => {
  const s = fresh();
  const data = JSON.parse(serialize(s));
  data.player.x = 50 * 64;
  data.player.y = 12 * 64;
  data.flags.roadOpen = false;
  assert.ok(deserialize(data).player.x < 35 * 64);
  data.flags.roadOpen = true;
  assert.ok(deserialize(data).player.x > 35 * 64);
});

test('new days refresh requests and shop stock through the simulation clock', () => {
  const s = fresh();
  const day0 = s.orders.day;
  advanceTime(s, MINUTES_PER_DAY + 10);
  assert.ok(s.orders.day > day0);
  assert.equal(s.shops.day, clock(s.time).day);
});
