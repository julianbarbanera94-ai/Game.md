import { NPCS } from '../data/npcs.js';
import { getItem } from '../data/items.js';
import * as Inv from './inventory.js';
import { clock } from './time.js';
import { NULL_BUS } from '../core/events.js';

// Friendship with villagers. state.relations[npcId] = { points, lastTalkDay }.
// Friendship is optional: it improves prices and unlocks warmer dialogue but
// never blocks basic farming progress.

export const LEVELS = [
  { name: 'Stranger', min: 0, discount: 0 },
  { name: 'Acquaintance', min: 12, discount: 0.03 },
  { name: 'Friend', min: 35, discount: 0.06 },
  { name: 'Close friend', min: 80, discount: 0.1 },
];
export const TALK_POINTS = 3;
export const GIFT_POINTS = { liked: 8, other: 3 }; // one gift per villager per day

export function rec(state, id) {
  return (state.relations[id] ||= { points: 0, lastTalkDay: 0, lastGiftDay: 0 });
}

export function levelIndex(points) {
  let idx = 0;
  LEVELS.forEach((l, i) => { if (points >= l.min) idx = i; });
  return idx;
}

export const level = (state, id) => levelIndex(state.relations[id]?.points || 0);
export const levelName = (state, id) => LEVELS[level(state, id)].name;
export const discount = (state, id) => LEVELS[level(state, id)].discount;

export function nextLevel(state, id) {
  const pts = state.relations[id]?.points || 0;
  const i = levelIndex(pts);
  return i + 1 < LEVELS.length ? { name: LEVELS[i + 1].name, needed: LEVELS[i + 1].min - pts } : null;
}

export function addPoints(state, id, amount) {
  if (!NPCS[id] || !(amount > 0)) return 0;
  const r = rec(state, id);
  r.points = Math.min(999, r.points + Math.floor(amount));
  return amount;
}

// Chat with a villager: friendship grows once per day. Always emits 'talk' (for quests).
export function talk(state, id, bus = NULL_BUS) {
  if (!NPCS[id]) return { ok: false, gained: 0 };
  const r = rec(state, id);
  const day = clock(state.time).day;
  let gained = 0;
  const before = levelIndex(r.points);
  if (r.lastTalkDay !== day) {
    r.lastTalkDay = day;
    gained = addPoints(state, id, TALK_POINTS);
  }
  const after = levelIndex(r.points);
  bus.emit('talk', { id });
  if (after > before) bus.emit('friendshipLevel', { id, level: LEVELS[after].name, levelIndex: after });
  return { ok: true, gained, levelUp: after > before ? LEVELS[after].name : null };
}

// Total village reputation = every villager's friendship points.
export function reputation(state) {
  return Object.values(state.relations).reduce((n, r) => n + (r.points || 0), 0);
}

// Things a villager would accept as a present: produce and animal goods.
export const giftable = (item) => !!item && (item.category === 'crop' || item.category === 'animal');

export function canGift(state, id) {
  return !!NPCS[id] && (state.relations[id]?.lastGiftDay || 0) !== clock(state.time).day;
}

// Give one item from the bag. Favourite gifts are worth more. The item leaves
// the bag only if the gift is accepted (one per villager per day).
export function gift(state, id, itemId, bus = NULL_BUS) {
  const def = NPCS[id];
  const item = getItem(itemId);
  if (!def) return { ok: false, reason: 'Nobody to give it to' };
  if (!giftable(item)) return { ok: false, reason: 'That is not something to give as a present' };
  if (!canGift(state, id)) return { ok: false, reason: `You already gave ${def.name} a present today` };
  if (!((state.inventory[itemId] || 0) >= 1)) return { ok: false, reason: `You have no ${item.name}` };
  const r = rec(state, id);
  const before = levelIndex(r.points);
  Inv.remove(state.inventory, itemId, 1);
  r.lastGiftDay = clock(state.time).day;
  const liked = (def.likes || []).includes(itemId);
  const gained = addPoints(state, id, liked ? GIFT_POINTS.liked : GIFT_POINTS.other);
  const after = levelIndex(r.points);
  bus.emit('gift', { id, item: itemId, liked });
  if (after > before) bus.emit('friendshipLevel', { id, level: LEVELS[after].name, levelIndex: after });
  return { ok: true, liked, gained, levelUp: after > before ? LEVELS[after].name : null };
}
