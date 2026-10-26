import { getItem } from '../data/items.js';
import { SHOP_STOCK, UPGRADES } from '../data/progression.js';
import { QUESTS_BY_ID } from '../data/quests.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import { BUILDINGS } from '../data/buildings.js';
import { bagSlots, buildingLevel, sellMultiplier } from './buildings.js';
import { levelOf } from './level.js';

// Transactions validate everything first, then apply atomically.

export function isRequirementMet(state, req) {
  if (!req) return true;
  if (req.quest && state.quests[req.quest]?.status !== 'claimed') return false;
  if (req.unlock && !state.unlocks[req.unlock]) return false;
  if (req.building && buildingLevel(state, req.building[0]) < req.building[1]) return false;
  if (req.placed && !state.placed.some((p) => p.type === req.placed && p.level >= 1)) return false;
  if (req.flag && !state.flags[req.flag]) return false;
  if (req.level && levelOf(state) < req.level) return false;
  if (req.comingSoon) return false;
  return true;
}

export function requirementText(req) {
  if (!req) return '';
  if (req.quest) return `Complete "${QUESTS_BY_ID[req.quest].title}"`;
  if (req.unlock === 'gardenExpansion') return 'Expand your garden';
  if (req.unlock && UPGRADES[req.unlock]) return `Buy the ${UPGRADES[req.unlock].name} (${UPGRADES[req.unlock].cost} coins)`;
  if (req.building) return `${BUILDINGS[req.building[0]].name} level ${req.building[1]}`;
  if (req.placed) return `Build a ${BUILDINGS[req.placed].name.toLowerCase()}`;
  if (req.flag === 'roadOpen') return 'Open the road east';
  if (req.flag === 'visitedVillage') return 'Visit Willowmere village';
  if (req.level) return `Reach farm level ${req.level}`;
  if (req.comingSoon) return 'Coming in a later update';
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
  const fits = Inv.canAdd(state.inventory, itemId, qty, bagSlots(state));
  if (!fits.ok) return fits.reason === 'No free space' ? { ok: false, reason: 'Your bag is full' } : fits;
  state.coins -= cost;
  Inv.add(state.inventory, itemId, qty, bagSlots(state));
  bus.emit('buy', { item: itemId, category: item.category, qty, cost });
  return { ok: true, cost };
}

// Unit sell price including the market stall's level bonus.
export function sellPrice(state, itemId) {
  const item = getItem(itemId);
  if (!item || item.sellPrice == null) return null;
  return Math.round(item.sellPrice * sellMultiplier(state));
}

export function sell(state, itemId, qty, bus = NULL_BUS) {
  const item = getItem(itemId);
  if (!item || item.sellPrice == null) return { ok: false, reason: "The market doesn't buy that" };
  const can = Inv.canRemove(state.inventory, itemId, qty);
  if (!can.ok) return can;
  const total = sellPrice(state, itemId) * qty;
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

// Effects that change other state when an unlock is gained (none yet; land
// unlocks are read directly by the farming system).
export function applyUpgradeEffects() {}
