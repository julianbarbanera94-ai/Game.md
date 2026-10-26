import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, LEVEL_UP_COINS } from '../data/achievements.js';
import { UNLOCKS } from '../data/unlocks.js';
import { DECORATIONS } from '../data/buildings.js';
import { NULL_BUS } from '../core/events.js';
import { isRequirementMet } from './economy.js';
import { levelFor } from './level.js';
import { reputation } from './relations.js';

// Counters, experience, achievements and the unlock tree. Everything here is
// driven by real gameplay events on the bus; nothing is simulated by the UI.

const COUNT_EVENTS = {
  till: 'till', plant: 'plant', water: 'water', harvest: 'harvest', sell: 'sell', buy: 'buy',
  constructed: 'constructed', constructionStarted: 'upgrades', buyAnimal: 'buyAnimal', collect: 'collect',
  feed: 'feed', pet: 'pet', deliver: 'deliver', talk: 'talk', gift: 'gifts', catch: 'fish', visit: 'visit', roadOpened: 'roadOpened',
  unlock: 'landUnlocks', questClaimed: 'questsClaimed', buyVehicle: 'vehiclesBought', drive: 'driven', machineWork: 'machineWork',
};
const BY_QTY = new Set(['harvest', 'sell', 'buy', 'collect', 'feed', 'drive', 'machineWork']);

export function attachProgress(getState, bus) {
  for (const [type, counter] of Object.entries(COUNT_EVENTS)) {
    bus.on(type, (payload = {}) => {
      const s = getState();
      if (!s) return;
      if (type === 'constructed' && DECORATIONS[payload.id]) return; // scarecrows aren't construction
      s.counters[counter] = (s.counters[counter] || 0) + (BY_QTY.has(type) ? payload.qty || 1 : 1);
      checkAchievements(s, bus);
    });
  }
}

// ---------------------------------------------------------------- experience
export function addXp(state, amount, bus = NULL_BUS) {
  amount = Math.floor(amount);
  if (!(amount > 0)) return { gained: 0, levelUp: null };
  const before = levelFor(state.xp || 0);
  state.xp = (state.xp || 0) + amount;
  const after = levelFor(state.xp);
  bus.emit('xp', { amount });
  let levelUp = null;
  if (after > before) {
    let coins = 0;
    for (let l = before + 1; l <= after; l++) coins += LEVEL_UP_COINS * l;
    state.coins += coins;
    levelUp = { level: after, coins };
    bus.emit('levelUp', levelUp);
  }
  return { gained: amount, levelUp };
}

// ---------------------------------------------------------------- achievements
export function achievementValue(state, a) {
  if (a.counter === 'earned') return state.stats.earned || 0;
  if (a.counter === 'reputation') return reputation(state);
  return state.counters[a.counter] || 0;
}

export function achievementStatus(state, a) {
  if (state.achievements[a.id]?.claimed) return 'claimed';
  return achievementValue(state, a) >= a.target ? 'ready' : 'locked';
}

export function checkAchievements(state, bus = NULL_BUS) {
  for (const a of ACHIEVEMENTS) {
    if (achievementStatus(state, a) !== 'ready') continue;
    const rec = (state.achievements[a.id] ||= { notified: false, claimed: false });
    if (!rec.notified) {
      rec.notified = true;
      bus.emit('achievementReady', { id: a.id, name: a.name });
    }
  }
}

export function claimAchievement(state, id, bus = NULL_BUS) {
  const a = ACHIEVEMENTS_BY_ID[id];
  if (!a) return { ok: false, reason: 'Unknown achievement' };
  const status = achievementStatus(state, a);
  if (status === 'claimed') return { ok: false, reason: 'Reward already claimed' };
  if (status !== 'ready') return { ok: false, reason: 'Not achieved yet' };
  const rec = (state.achievements[id] ||= { notified: true, claimed: false });
  rec.claimed = true;
  state.coins += a.reward.coins || 0;
  bus.emit('achievementClaimed', { id, reward: a.reward });
  const xp = addXp(state, a.reward.xp || 0, bus);
  return { ok: true, reward: a.reward, levelUp: xp.levelUp };
}

// ---------------------------------------------------------------- unlock tree
export function unlockMet(state, entry) {
  return isRequirementMet(state, entry.requires);
}

// Mark everything already unlocked as seen without announcing it.
export function seedSeenUnlocks(state) {
  state.seenUnlocks = UNLOCKS.filter((u) => unlockMet(state, u)).map((u) => u.id);
}

export function checkUnlocks(state, bus = NULL_BUS) {
  const fresh = [];
  for (const u of UNLOCKS) {
    if (state.seenUnlocks.includes(u.id) || !unlockMet(state, u)) continue;
    state.seenUnlocks.push(u.id);
    fresh.push(u);
    bus.emit('unlocked', { id: u.id, name: u.name, track: u.track });
  }
  return fresh;
}
