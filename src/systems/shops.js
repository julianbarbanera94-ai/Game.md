import { SHOP_STOCK } from '../data/progression.js';
import { getItem } from '../data/items.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import { bagSlots, sellMultiplier } from './buildings.js';
import { isRequirementMet, requirementText } from './economy.js';
import { clock } from './time.js';
import { discount } from './relations.js';
import { eventSellBonus } from './seasons.js';

// Village commerce. Stock and demand reset every morning.
//   General Store (Mara): limited daily stock of seeds and feed, friendship discount.
//   Trader (Tobias):      pays a premium for the first few units of each product per day.
// state.shops = { day, bought: { item: n }, traded: { item: n } }

export const STORE_DAILY_LIMIT = { seed: 12, feed: 20 };
export const TRADER_PREMIUM = 1.15;
export const TRADER_DAILY_DEMAND = 8; // units per item per day at the premium price

export function rollover(state) {
  const day = clock(state.time).day;
  if (state.shops.day !== day) state.shops = { day, bought: {}, traded: {} };
  return state.shops;
}

export function dailyLimit(itemId) {
  return STORE_DAILY_LIMIT[getItem(itemId).category] ?? 10;
}

export function storePrice(state, itemId) {
  const item = getItem(itemId);
  return Math.max(1, Math.round(item.buyPrice * (1 - discount(state, 'mara'))));
}

export function storeEntries(state) {
  rollover(state);
  return SHOP_STOCK.map((e) => {
    const item = getItem(e.item);
    const bought = state.shops.bought[e.item] || 0;
    return {
      item,
      price: storePrice(state, e.item),
      unlocked: isRequirementMet(state, e.requires),
      lockedText: requirementText(e.requires),
      left: Math.max(0, dailyLimit(e.item) - bought),
    };
  });
}

export function storeBuy(state, itemId, qty, bus = NULL_BUS) {
  rollover(state);
  const entry = SHOP_STOCK.find((e) => e.item === itemId);
  const item = getItem(itemId);
  if (!entry || !item || item.buyPrice == null) return { ok: false, reason: 'Not sold here' };
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'Invalid quantity' };
  if (!isRequirementMet(state, entry.requires)) return { ok: false, reason: `Locked: ${requirementText(entry.requires)}` };
  const left = dailyLimit(itemId) - (state.shops.bought[itemId] || 0);
  if (left <= 0) return { ok: false, reason: `Sold out of ${item.name} for today — back tomorrow` };
  if (qty > left) return { ok: false, reason: `Only ${left} ${item.name} left today` };
  const cost = storePrice(state, itemId) * qty;
  if (state.coins < cost) return { ok: false, reason: 'Not enough coins' };
  const fits = Inv.canAdd(state.inventory, itemId, qty, bagSlots(state));
  if (!fits.ok) return fits.reason === 'No free space' ? { ok: false, reason: 'Your bag is full' } : fits;
  state.coins -= cost;
  Inv.add(state.inventory, itemId, qty, bagSlots(state));
  state.shops.bought[itemId] = (state.shops.bought[itemId] || 0) + qty;
  bus.emit('buy', { item: itemId, category: item.category, qty, cost });
  return { ok: true, cost };
}

// Price per unit the trader pays now (premium while today's demand lasts).
export function traderUnit(state, itemId, nth = 0) {
  const item = getItem(itemId);
  if (!item || item.sellPrice == null) return null;
  rollover(state);
  const done = (state.shops.traded[itemId] || 0) + nth;
  const base = item.sellPrice * sellMultiplier(state);
  const bonus = 1 + discount(state, 'tobias') * 0.5 + eventSellBonus(state.time); // friends and festivals add a little
  return Math.round(done < TRADER_DAILY_DEMAND ? base * TRADER_PREMIUM * bonus : base * bonus);
}

export function traderDemandLeft(state, itemId) {
  rollover(state);
  return Math.max(0, TRADER_DAILY_DEMAND - (state.shops.traded[itemId] || 0));
}

export function traderQuote(state, itemId, qty) {
  let total = 0;
  for (let i = 0; i < qty; i++) total += traderUnit(state, itemId, i) || 0;
  return total;
}

export function traderSell(state, itemId, qty, bus = NULL_BUS) {
  const item = getItem(itemId);
  if (!item || item.sellPrice == null) return { ok: false, reason: "Tobias doesn't buy that" };
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'Invalid quantity' };
  const can = Inv.canRemove(state.inventory, itemId, qty);
  if (!can.ok) return can;
  const total = traderQuote(state, itemId, qty);
  Inv.remove(state.inventory, itemId, qty);
  state.coins += total;
  state.stats.earned += total;
  state.shops.traded[itemId] = (state.shops.traded[itemId] || 0) + qty;
  bus.emit('sell', { item: itemId, category: item.category, qty, total });
  return { ok: true, total };
}
