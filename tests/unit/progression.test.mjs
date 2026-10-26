import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import { serialize, deserialize } from '../../src/systems/save.js';
import { advanceTime } from '../../src/systems/simulation.js';
import { EventBus } from '../../src/core/events.js';
import * as Q from '../../src/systems/quests.js';
import * as P from '../../src/systems/progress.js';
import * as Seasons from '../../src/systems/seasons.js';
import * as F from '../../src/systems/farming.js';
import { levelFor, levelInfo } from '../../src/systems/level.js';
import { isRequirementMet } from '../../src/systems/economy.js';
import { purchaseUpgrade } from '../../src/systems/economy.js';
import { ACHIEVEMENTS, LEVEL_XP } from '../../src/data/achievements.js';
import { QUESTS, QUESTS_BY_ID } from '../../src/data/quests.js';
import { UNLOCKS } from '../../src/data/unlocks.js';
import { SEASONAL_EVENTS, DAYS_PER_SEASON } from '../../src/data/seasons.js';
import { PLOTS } from '../../src/data/world.js';
import { MINUTES_PER_DAY } from '../../src/config.js';

function game() {
  const s = createNewState();
  const bus = new EventBus();
  Q.attachQuests(() => s, bus);
  P.attachProgress(() => s, bus);
  return { s, bus };
}
const atDay = (s, day, hour = 8) => { s.time = (day - 1) * MINUTES_PER_DAY + hour * 60; };

test('every quest has a kind, experience and a valid prerequisite; ids are unique', () => {
  const ids = new Set();
  for (const q of QUESTS) {
    assert.ok(!ids.has(q.id), q.id);
    ids.add(q.id);
    assert.ok(q.kind && q.xp > 0, q.id);
    for (const p of q.prereqs) assert.ok(QUESTS_BY_ID[p], `${q.id} needs ${p}`);
    assert.ok(q.objectives.length && q.reward, q.id);
    if (q.event) assert.ok(SEASONAL_EVENTS.some((e) => e.id === q.event), q.id);
  }
  assert.ok(QUESTS.filter((q) => q.optional).length >= 4);
  assert.ok(QUESTS.some((q) => q.repeatDays));
});

test('optional quests are offered, accepted, abandoned and claimed', () => {
  const { s, bus } = game();
  assert.equal(s.quests.sq_green_thumb.status, 'locked');
  s.quests.q_first_harvest.status = 'claimed';
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.sq_green_thumb.status, 'available', 'offered, not started');
  assert.equal(s.quests.q_market_day.status, 'active', 'story quests start by themselves');
  bus.emit('harvest', { crop: 'carrot', qty: 3 });
  assert.equal(s.quests.sq_green_thumb.progress[0], 0, 'progress only counts after accepting');
  assert.equal(Q.accept(s, 'sq_green_thumb', bus).ok, true);
  assert.equal(Q.accept(s, 'sq_green_thumb', bus).ok, false, 'cannot accept twice');
  bus.emit('harvest', { crop: 'carrot', qty: 5 });
  assert.equal(s.quests.sq_green_thumb.progress[0], 5);
  assert.equal(Q.abandon(s, 'sq_green_thumb', bus).ok, true);
  assert.equal(s.quests.sq_green_thumb.status, 'available');
  assert.equal(s.quests.sq_green_thumb.progress[0], 0, 'progress restarts');
  assert.equal(Q.abandon(s, 'q_market_day', bus).ok, false, 'story quests cannot be abandoned');
  Q.accept(s, 'sq_green_thumb', bus);
  bus.emit('harvest', { crop: 'carrot', qty: 15 });
  assert.equal(s.quests.sq_green_thumb.status, 'complete');
  assert.equal(Q.abandon(s, 'sq_green_thumb', bus).ok, false, 'finished quests are claimed, not abandoned');
  const coins = s.coins;
  const xp = s.xp;
  const r = Q.claim(s, 'sq_green_thumb', bus);
  assert.equal(r.ok, true);
  assert.equal(s.coins, coins + 45 + (r.levelUp?.coins || 0));
  assert.equal(s.xp, xp + 20);
  assert.equal(Q.claim(s, 'sq_green_thumb', bus).ok, false, 'no second payout');
  assert.equal(s.xp, xp + 20);
});

test('quest objectives with a crop only count that crop', () => {
  const { s, bus } = game();
  s.quests.q_first_harvest.status = 'claimed';
  Q.refreshAvailability(s, bus);
  Q.accept(s, 'sq_carrot_king', bus);
  bus.emit('harvest', { crop: 'lettuce', qty: 4 });
  assert.equal(s.quests.sq_carrot_king.progress[0], 0);
  bus.emit('harvest', { crop: 'carrot', qty: 4 });
  assert.equal(s.quests.sq_carrot_king.progress[0], 4);
});

test('repeatable quests come back after their cooldown', () => {
  const { s, bus } = game();
  s.quests.q_market_day.status = 'claimed';
  atDay(s, 2);
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.sq_market_regular.status, 'active');
  bus.emit('sell', { qty: 15, item: 'carrot' });
  assert.equal(Q.claim(s, 'sq_market_regular', bus).ok, true);
  assert.equal(s.quests.sq_market_regular.status, 'claimed');
  atDay(s, 3);
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.sq_market_regular.status, 'claimed', 'still cooling down');
  atDay(s, 5);
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.sq_market_regular.status, 'active');
  assert.equal(s.quests.sq_market_regular.progress[0], 0);
});

test('seasons follow the game clock and have exactly one festival each', () => {
  assert.equal(Seasons.calendar(0).season, 'Spring');
  assert.equal(Seasons.calendar((DAYS_PER_SEASON) * MINUTES_PER_DAY).season, 'Summer');
  assert.equal(Seasons.calendar((DAYS_PER_SEASON * 4) * MINUTES_PER_DAY).year, 2);
  assert.equal(SEASONAL_EVENTS.length, 4);
  const spring = SEASONAL_EVENTS[0];
  assert.equal(Seasons.activeEvent((spring.from - 1) * MINUTES_PER_DAY)?.id, 'spring_festival');
  assert.equal(Seasons.activeEvent((spring.from - 2) * MINUTES_PER_DAY), null);
  assert.equal(Seasons.activeEvent(spring.to * MINUTES_PER_DAY), null);
  const next = Seasons.nextEvent(0);
  assert.equal(next.event.id, 'spring_festival');
  assert.equal(next.inDays, spring.from - 1);
  assert.ok(Seasons.eventSellBonus((spring.from - 1) * MINUTES_PER_DAY) > 0);
  assert.equal(Seasons.eventSellBonus(0), 0);
});

test('seasonal quests start with the festival, end with it and return next year', () => {
  const { s, bus } = game();
  const ev = SEASONAL_EVENTS[0];
  atDay(s, ev.from - 3);
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.qe_spring_festival.status, 'locked');
  atDay(s, ev.from);
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.qe_spring_festival.status, 'active');
  bus.emit('plant', {});
  assert.equal(s.quests.qe_spring_festival.progress[0], 1);
  // the festival ends before it is finished
  atDay(s, ev.to + 1);
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.qe_spring_festival.status, 'locked');
  assert.equal(s.quests.qe_spring_festival.progress[0], 0);
  // finished and claimed during year one; it is not offered again that year
  atDay(s, ev.from);
  Q.refreshAvailability(s, bus);
  for (let i = 0; i < 15; i++) bus.emit('plant', {});
  assert.equal(Q.claim(s, 'qe_spring_festival', bus).ok, true);
  atDay(s, ev.from + 1);
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.qe_spring_festival.status, 'claimed');
  atDay(s, 112 + ev.from);
  Q.refreshAvailability(s, bus);
  assert.equal(s.quests.qe_spring_festival.status, 'active', 'next year it is back');
  assert.equal(s.quests.qe_spring_festival.progress[0], 0);
});

test('advancing the clock through the morning starts festivals', () => {
  const s = createNewState();
  atDay(s, SEASONAL_EVENTS[0].from - 1, 20);
  advanceTime(s, 12 * 60);
  assert.equal(s.quests.qe_spring_festival.status, 'active');
});

test('experience and levels: thresholds, level-up coins, no negative gains', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(LEVEL_XP[1] - 1), 1);
  assert.equal(levelFor(LEVEL_XP[1]), 2);
  assert.equal(levelFor(1e9), LEVEL_XP.length);
  const s = createNewState();
  const bus = new EventBus();
  const ups = [];
  bus.on('levelUp', (e) => ups.push(e));
  const coins = s.coins;
  const r = P.addXp(s, LEVEL_XP[2], bus);
  assert.equal(r.levelUp.level, 3);
  assert.equal(s.coins, coins + 25 * 2 + 25 * 3, 'every level passed pays out');
  assert.equal(ups.length, 1);
  assert.equal(P.addXp(s, -5, bus).gained, 0);
  assert.equal(P.addXp(s, 0, bus).gained, 0);
  assert.equal(levelInfo(s).level, 3);
  assert.equal(isRequirementMet(s, { level: 3 }), true);
  assert.equal(isRequirementMet(s, { level: 4 }), false);
});

test('achievements: ready from real counters, claimed once, notified once', () => {
  const { s, bus } = game();
  const ready = [];
  bus.on('achievementReady', (e) => ready.push(e.id));
  bus.emit('harvest', { crop: 'carrot', qty: 1 });
  assert.deepEqual(ready, ['first_harvest']);
  bus.emit('harvest', { crop: 'carrot', qty: 1 });
  assert.deepEqual(ready, ['first_harvest'], 'announced once');
  const a = ACHIEVEMENTS.find((x) => x.id === 'first_harvest');
  assert.equal(P.achievementStatus(s, a), 'ready');
  const coins = s.coins;
  assert.equal(P.claimAchievement(s, 'first_harvest', bus).ok, true);
  assert.equal(s.coins, coins + a.reward.coins);
  assert.equal(P.claimAchievement(s, 'first_harvest', bus).ok, false);
  assert.equal(s.coins, coins + a.reward.coins, 'no duplicate reward');
  assert.equal(P.claimAchievement(s, 'tycoon', bus).ok, false, 'not earned');
  assert.equal(P.claimAchievement(s, 'nope', bus).ok, false);
  s.stats.earned = 1500;
  P.checkAchievements(s, bus);
  assert.ok(ready.includes('merchant'), 'money earned counts');
  bus.emit('constructed', { id: 'scarecrow' });
  assert.equal(s.counters.constructed || 0, 0, 'decorations are not construction');
  bus.emit('constructed', { id: 'chicken_coop' });
  assert.equal(s.counters.constructed, 1);
});

test('the progression tree announces new unlocks once and stays quiet for what is already open', () => {
  const { s, bus } = game();
  assert.ok(s.seenUnlocks.includes('crop_carrot'), 'start-of-game unlocks are not news');
  const news = [];
  bus.on('unlocked', (e) => news.push(e.id));
  assert.deepEqual(P.checkUnlocks(s, bus), []);
  s.quests.q_market_day.status = 'claimed';
  P.checkUnlocks(s, bus);
  P.checkUnlocks(s, bus);
  assert.deepEqual(news, ['crop_potato']);
  s.flags.roadOpen = true;
  P.checkUnlocks(s, bus);
  assert.deepEqual(news, ['crop_potato', 'road']);
  const locked = UNLOCKS.find((u) => u.id === 'machinery');
  assert.equal(P.unlockMet(s, locked), false, 'coming-soon entries stay locked');
});

test('north field: a second land unlock with its own plots', () => {
  const { s, bus } = game();
  const north = PLOTS.filter((p) => p.group === 'north');
  assert.equal(north.length, 8);
  assert.equal(F.getPlotAction(s, north[0].id).action, 'locked');
  assert.equal(F.getPlotAction(s, north[0].id).unlock, 'northField');
  assert.equal(F.till(s, north[0].id).ok, false);
  s.coins = 5000;
  assert.equal(purchaseUpgrade(s, 'northField', bus).ok, false, 'needs the south bed first');
  s.unlocks.gardenExpansion = true;
  const before = s.coins;
  assert.equal(purchaseUpgrade(s, 'northField', bus).ok, true);
  assert.equal(s.coins, before - 600);
  assert.equal(F.till(s, north[0].id).ok, true);
  assert.equal(purchaseUpgrade(s, 'northField', bus).ok, false, 'only once');
  assert.equal(s.counters.landUnlocks, 1);
});

test('save v6 keeps progression and migrates v5 without announcing old unlocks', () => {
  const { s, bus } = game();
  s.quests.q_first_harvest.status = 'claimed';
  Q.refreshAvailability(s, bus);
  Q.accept(s, 'sq_green_thumb', bus);
  bus.emit('harvest', { crop: 'carrot', qty: 7 });
  P.addXp(s, 60, bus);
  P.claimAchievement(s, 'first_harvest', bus);
  const back = deserialize(serialize(s));
  assert.equal(back.version, 6);
  assert.equal(back.xp, s.xp);
  assert.equal(back.counters.harvest, 7);
  assert.equal(back.achievements.first_harvest.claimed, true);
  assert.equal(back.quests.sq_green_thumb.status, 'active');
  assert.equal(back.quests.sq_green_thumb.progress[0], 7);
  assert.deepEqual(back.seenUnlocks.sort(), s.seenUnlocks.slice().sort());

  const v5 = deserialize({ version: 5, coins: 90, buildings: {}, placed: [], animals: [], cleared: [], relations: {}, orders: { day: 0, nextId: 1, list: [] }, shops: { day: 0, bought: {}, traded: {} },
    quests: { q_breaking_ground: { status: 'claimed', progress: [3, 3, 3] }, q_first_harvest: { status: 'claimed', progress: [3] }, q_market_day: { status: 'claimed', progress: [3] } } });
  assert.equal(v5.version, 6);
  assert.equal(v5.xp, 0);
  assert.ok(v5.seenUnlocks.includes('crop_potato'), 'already open, so not announced again');
  assert.equal(v5.quests.sq_green_thumb.status, 'available');
});

test('save v6 validation: bad counters, achievements, xp, quest states and unlock ids', () => {
  const s = createNewState();
  const data = JSON.parse(serialize(s));
  data.xp = -50;
  data.counters = { harvest: 'x', 'bad key!': 5, sell: 1e15, till: 4.7 };
  data.achievements = { first_harvest: { claimed: 'yes' }, ghost: { claimed: true }, merchant: 5 };
  data.seenUnlocks = ['crop_carrot', 'made_up', 7];
  data.quests.sq_green_thumb = { status: 'available', progress: [999] };
  data.quests.q_breaking_ground = { status: 'available', progress: [0, 0, 0] }; // story quests are never 'available'
  data.quests.sq_carrot_king = { status: 'nonsense', progress: [1] };
  const back = deserialize(data);
  assert.equal(back.xp, 0);
  assert.equal(back.counters.harvest, 0, 'junk counts become zero');
  assert.equal(back.counters['bad key!'], undefined);
  assert.equal(back.counters.sell, 1e9);
  assert.equal(back.counters.till, 4);
  assert.equal(back.achievements.first_harvest.claimed, true);
  assert.equal(back.achievements.ghost, undefined);
  assert.equal(back.achievements.merchant, undefined);
  assert.deepEqual(back.seenUnlocks, ['crop_carrot']);
  assert.ok(back.quests.sq_green_thumb.progress[0] <= 15, 'progress is capped at the objective');
  assert.equal(back.quests.q_breaking_ground.status, 'active');
  assert.notEqual(back.quests.sq_carrot_king.status, 'nonsense');
});
