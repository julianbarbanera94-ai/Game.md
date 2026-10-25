import { QUESTS, QUESTS_BY_ID } from '../data/quests.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import { getItem } from '../data/items.js';

// Quest state per id: { status: locked|active|complete|claimed, progress: [n] }

export function createQuestState() {
  const out = {};
  for (const q of QUESTS) out[q.id] = { status: 'locked', progress: q.objectives.map(() => 0) };
  return out;
}

// Activate every locked quest whose prerequisites are all claimed.
export function refreshAvailability(state, bus = NULL_BUS) {
  for (const q of QUESTS) {
    const qs = state.quests[q.id];
    if (qs.status !== 'locked') continue;
    if (q.prereqs.every((p) => state.quests[p]?.status === 'claimed')) {
      qs.status = 'active';
      bus.emit('questStarted', { id: q.id });
    }
  }
}

function matches(obj, type, payload) {
  if (obj.type !== type) return false;
  if (obj.crop && payload.crop !== obj.crop) return false;
  if (obj.category && payload.category !== obj.category) return false;
  if (obj.id && payload.id !== obj.id) return false;
  return true;
}

// Feed a gameplay event into quest progress.
export function handleEvent(state, type, payload = {}, bus = NULL_BUS) {
  const amount = type === 'sell' || type === 'buy' || type === 'harvest' ? payload.qty || 1 : 1;
  for (const q of QUESTS) {
    const qs = state.quests[q.id];
    if (qs.status !== 'active') continue;
    let changed = false;
    q.objectives.forEach((obj, i) => {
      if (qs.progress[i] < obj.count && matches(obj, type, payload)) {
        qs.progress[i] = Math.min(obj.count, qs.progress[i] + amount);
        changed = true;
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
  const fits = Inv.canAddAll(state.inventory, items);
  if (!fits.ok) return { ok: false, reason: `${fits.reason} — make room to claim` };
  for (const [item, qty] of Object.entries(items)) Inv.add(state.inventory, item, qty);
  state.coins += q.reward.coins || 0;
  qs.status = 'claimed';
  bus.emit('questClaimed', { id, reward: q.reward });
  refreshAvailability(state, bus);
  return { ok: true, reward: q.reward };
}

export function trackedQuests(state) {
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
  for (const type of ['till', 'plant', 'water', 'harvest', 'sell', 'buy', 'unlock', 'talk', 'visit']) {
    bus.on(type, (payload) => handleEvent(getState(), type, payload, bus));
  }
}
