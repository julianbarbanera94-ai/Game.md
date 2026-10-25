import { getItem } from '../data/items.js';
import { SHOP_STOCK, UPGRADES } from '../data/progression.js';
import { QUESTS_BY_ID } from '../data/quests.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';

// Transactions validate everything first, then apply atomically.

export function isRequirementMet(state, req) {
  if (!req) return true;
  if (req.quest && state.quests[req.quest]?.status !== 'claimed') return false;
  if (req.unlock && !state.unlocks[req.unlock]) return false;
  return true;
}

export function requirementText(req) {
  if (!req) return '';
  if (req.quest) return `Complete "${QUESTS_BY_ID[req.quest].title}"`;
  if (req.unlock === 'gardenExpansion') return 'Expand your garden';
  return 'Locked';
}

export function shopEntries(state) {
  return SHOP_STOCK.map((entry) => ({
    item: getItem(entry.item),
    unlocked: isRequirementMet(state, entry.requires),
    lockedText: requirementText(entry.requires),
  }));
}

export function buy(state, itemId, qty, bus = NULL_BUS) {
  const entry = SHOP_STOCK.find((e) => e.item === itemId);
  const item = getItem(itemId);
  if (!entry || !item || item.buyPrice == null) return { ok: false, reason: 'Not sold here' };
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'Invalid quantity' };
  if (!isRequirementMet(state, entry.requires)) return { ok: false, reason: `Locked: ${requirementText(entry.requires)}` };
  const cost = item.buyPrice * qty;
  if (state.coins < cost) return { ok: false, reason: 'Not enough coins' };
  const fits = Inv.canAdd(state.inventory, itemId, qty);
  if (!fits.ok) return fits;
  state.coins -= cost;
  Inv.add(state.inventory, itemId, qty);
  bus.emit('buy', { item: itemId, category: item.category, qty, cost });
  return { ok: true, cost };
}

export function sell(state, itemId, qty, bus = NULL_BUS) {
  const item = getItem(itemId);
  if (!item || item.sellPrice == null) return { ok: false, reason: "The market doesn't buy that" };
  const can = Inv.canRemove(state.inventory, itemId, qty);
  if (!can.ok) return can;
  const total = item.sellPrice * qty;
  Inv.remove(state.inventory, itemId, qty);
  state.coins += total;
  state.stats.earned += total;
  bus.emit('sell', { item: itemId, category: item.category, qty, total });
  return { ok: true, total };
}

export function upgradeStatus(state, id) {
  const up = UPGRADES[id];
  if (state.unlocks[id]) return { state: 'owned', up };
  if (!isRequirementMet(state, up.requires)) return { state: 'locked', up, reason: requirementText(up.requires) };
  if (state.coins < up.cost) return { state: 'unaffordable', up, reason: `Needs ${up.cost} coins` };
  return { state: 'available', up };
}

export function purchaseUpgrade(state, id, bus = NULL_BUS) {
  const s = upgradeStatus(state, id);
  if (s.state === 'owned') return { ok: false, reason: 'Already owned' };
  if (s.state !== 'available') return { ok: false, reason: s.reason };
  state.coins -= s.up.cost;
  state.unlocks[id] = true;
  applyUpgradeEffects(state, id);
  bus.emit('unlock', { id, cost: s.up.cost });
  return { ok: true };
}

// Effects that change other state when an unlock is gained.
export function applyUpgradeEffects(state, id) {
  if (id === 'wateringCan2') {
    state.can.capacity = 25;
    state.can.water = state.can.capacity;
  }
}
