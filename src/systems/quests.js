import { QUESTS, QUESTS_BY_ID } from '../data/quests.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import { getItem } from '../data/items.js';
import { bagSlots } from './buildings.js';
import { addXp } from './progress.js';
import { activeEvent, calendar } from './seasons.js';

// Quest state per id: { status: locked|available|active|complete|claimed, progress: [n],
//   readyDay (repeatables), cycle (seasonal: the year it was started) }
//   locked    - prerequisites (or the festival) not met yet
//   available - optional quest offered in the journal; the player accepts it
//   active    - being tracked; complete - objectives done, reward waiting

export function createQuestState() {
  const out = {};
  for (const q of QUESTS) out[q.id] = { status: 'locked', progress: q.objectives.map(() => 0), readyDay: 0, cycle: 0 };
  return out;
}

const reset = (q, qs) => {
  qs.progress = q.objectives.map(() => 0);
};

// Open up quests whose prerequisites are claimed, start or end seasonal quests
// with their festival, and bring repeatable quests back after their cooldown.
export function refreshAvailability(state, bus = NULL_BUS) {
  const cal = calendar(state.time);
  const event = activeEvent(state.time);
  for (const q of QUESTS) {
    const qs = state.quests[q.id];
    if (q.event) {
      const on = event?.id === q.event;
      if (on && (qs.status === 'locked' || (qs.status === 'claimed' && qs.cycle < cal.year))) {
        reset(q, qs);
        qs.status = 'active';
        qs.cycle = cal.year;
        bus.emit('questStarted', { id: q.id });
      } else if (!on && ['active', 'available'].includes(qs.status)) {
        reset(q, qs); // the festival is over before it was finished
        qs.status = 'locked';
        bus.emit('questMissed', { id: q.id });
      }
      continue;
    }
    const open = q.prereqs.every((p) => state.quests[p]?.status === 'claimed');
    if (qs.status === 'locked' && open) {
      qs.status = q.optional ? 'available' : 'active';
      bus.emit('questStarted', { id: q.id, optional: q.optional });
    } else if (qs.status === 'claimed' && q.repeatDays && cal.day >= qs.readyDay) {
      reset(q, qs);
      qs.status = q.optional ? 'available' : 'active';
      bus.emit('questStarted', { id: q.id, optional: q.optional, again: true });
    }
  }
}

export function accept(state, id, bus = NULL_BUS) {
  const q = QUESTS_BY_ID[id];
  const qs = state.quests[id];
  if (!q || !qs) return { ok: false, reason: 'Unknown quest' };
  if (qs.status !== 'available') return { ok: false, reason: qs.status === 'locked' ? 'Not available yet' : 'Already accepted' };
  qs.status = 'active';
  bus.emit('questAccepted', { id });
  return { ok: true };
}

// Optional quests can be put down again; progress restarts if picked up later.
export function abandon(state, id, bus = NULL_BUS) {
  const q = QUESTS_BY_ID[id];
  const qs = state.quests[id];
  if (!q || !qs) return { ok: false, reason: 'Unknown quest' };
  if (!q.optional) return { ok: false, reason: 'Story quests cannot be abandoned' };
  if (qs.status !== 'active') return { ok: false, reason: qs.status === 'complete' ? 'Claim the reward instead' : 'Not in progress' };
  reset(q, qs);
  qs.status = 'available';
  bus.emit('questAbandoned', { id });
  return { ok: true };
}

function matches(obj, type, payload) {
  if (obj.type !== type) return false;
  if (obj.crop && payload.crop !== obj.crop) return false;
  if (obj.category && payload.category !== obj.category) return false;
  if (obj.id && payload.id !== obj.id) return false;
  if (obj.item && payload.item !== obj.item) return false;
  if (obj.species && payload.species !== obj.species) return false;
  if (obj.action && payload.action !== obj.action) return false;
  if (obj.minLevel && !(payload.levelIndex >= obj.minLevel)) return false;
  return true;
}

// Feed a gameplay event into quest progress.
export function handleEvent(state, type, payload = {}, bus = NULL_BUS) {
  const amount = ['sell', 'buy', 'harvest', 'collect', 'feed', 'drive', 'machineWork'].includes(type) ? payload.qty || 1 : 1;
  for (const q of QUESTS) {
    const qs = state.quests[q.id];
    if (qs.status !== 'active') continue;
    let changed = false;
    q.objectives.forEach((obj, i) => {
      if (qs.progress[i] < obj.count && matches(obj, type, payload)) {
        qs.progress[i] = Math.min(obj.count, qs.progress[i] + amount);
        changed = true;
        bus.emit('questProgress', { id: q.id, index: i, label: obj.label, progress: qs.progress[i], count: obj.count });
      }
    });
    if (changed && q.objectives.every((o, i) => qs.progress[i] >= o.count)) {
      qs.status = 'complete';
      bus.emit('questComplete', { id: q.id });
    }
  }
}

export function claim(state, id, bus = NULL_BUS) {
  const q = QUESTS_BY_ID[id];
  const qs = state.quests[id];
  if (!q || !qs) return { ok: false, reason: 'Unknown quest' };
  if (qs.status === 'claimed') return { ok: false, reason: 'Reward already claimed' };
  if (qs.status !== 'complete') return { ok: false, reason: 'Quest not complete yet' };
  const items = q.reward.items || {};
  const fits = Inv.canAddAll(state.inventory, items, bagSlots(state));
  if (!fits.ok) return { ok: false, reason: `${fits.reason === 'No free space' ? 'Your bag is full' : fits.reason} — make room to claim` };
  for (const [item, qty] of Object.entries(items)) Inv.add(state.inventory, item, qty, bagSlots(state));
  state.coins += q.reward.coins || 0;
  qs.status = 'claimed';
  if (q.repeatDays) qs.readyDay = calendar(state.time).day + q.repeatDays;
  const xp = addXp(state, q.xp, bus);
  bus.emit('questClaimed', { id, reward: q.reward, xp: xp.gained });
  refreshAvailability(state, bus);
  return { ok: true, reward: q.reward, xp: xp.gained, levelUp: xp.levelUp };
}

export function trackedQuests(state) {
  // active and finished quests, the ones shown in the tracker
  return QUESTS.filter((q) => ['active', 'complete'].includes(state.quests[q.id].status)).map((q) => ({
    def: q,
    state: state.quests[q.id],
  }));
}

export function rewardText(reward) {
  const parts = [];
  if (reward.coins) parts.push(`${reward.coins} coins`);
  for (const [id, qty] of Object.entries(reward.items || {})) parts.push(`${qty}× ${getItem(id)?.name || id}`);
  return parts.join(', ');
}

// Wire quest progress to the gameplay event bus.
export function attachQuests(getState, bus) {
  for (const type of ['till', 'plant', 'water', 'harvest', 'sell', 'buy', 'unlock', 'talk', 'visit', 'constructed', 'constructionStarted', 'buyAnimal', 'collect', 'feed', 'pet', 'roadOpened', 'deliver', 'friendshipLevel', 'buyVehicle', 'drive', 'machineWork']) {
    bus.on(type, (payload) => handleEvent(getState(), type, payload, bus));
  }
}
