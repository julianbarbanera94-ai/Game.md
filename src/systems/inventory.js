import { getItem, INVENTORY_SLOTS } from '../data/items.js';

// Inventory is a plain { itemId: quantity } map stored in game state.
// All mutations validate first so quantities never go negative and items are
// never silently lost.

export function count(inv, id) {
  return inv[id] || 0;
}

export function slotsUsed(inv) {
  return Object.values(inv).filter((q) => q > 0).length;
}

export function canAdd(inv, id, qty) {
  const item = getItem(id);
  if (!item) return { ok: false, reason: 'Unknown item' };
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'Invalid quantity' };
  const have = count(inv, id);
  if (have === 0 && slotsUsed(inv) >= INVENTORY_SLOTS) return { ok: false, reason: 'Your bag is full' };
  if (have + qty > item.maxStack) return { ok: false, reason: `You can't carry more ${item.name}` };
  return { ok: true };
}

export function add(inv, id, qty) {
  const check = canAdd(inv, id, qty);
  if (!check.ok) return check;
  inv[id] = count(inv, id) + qty;
  return { ok: true };
}

export function canRemove(inv, id, qty) {
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'Invalid quantity' };
  if (count(inv, id) < qty) return { ok: false, reason: 'Not enough items' };
  return { ok: true };
}

export function remove(inv, id, qty) {
  const check = canRemove(inv, id, qty);
  if (!check.ok) return check;
  inv[id] -= qty;
  if (inv[id] === 0) delete inv[id];
  return { ok: true };
}

// Check that a whole bundle of items fits before granting any of it.
export function canAddAll(inv, items) {
  const trial = { ...inv };
  for (const [id, qty] of Object.entries(items)) {
    const r = add(trial, id, qty);
    if (!r.ok) return r;
  }
  return { ok: true };
}
