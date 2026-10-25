import { getItem } from '../data/items.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import { bagSlots, storageSlots } from './buildings.js';

// Moving items between the bag and a storage shed. Both sides are validated
// before anything moves, so items are never lost or duplicated.

export function findShed(state, uid) {
  const rec = state.placed.find((p) => p.uid === uid && p.type === 'storage_shed');
  return rec && rec.level >= 1 ? rec : null;
}

export function deposit(state, uid, itemId, qty, bus = NULL_BUS) {
  const shed = findShed(state, uid);
  if (!shed) return { ok: false, reason: 'The shed is not finished yet' };
  if (!getItem(itemId)) return { ok: false, reason: 'Unknown item' };
  const out = Inv.canRemove(state.inventory, itemId, qty);
  if (!out.ok) return out;
  const fits = Inv.canAdd(shed.storage, itemId, qty, storageSlots(shed));
  if (!fits.ok) return { ok: false, reason: fits.reason === 'No free space' ? 'The shed is full' : fits.reason };
  Inv.remove(state.inventory, itemId, qty);
  Inv.add(shed.storage, itemId, qty, storageSlots(shed));
  bus.emit('stored', { item: itemId, qty });
  return { ok: true };
}

export function withdraw(state, uid, itemId, qty, bus = NULL_BUS) {
  const shed = findShed(state, uid);
  if (!shed) return { ok: false, reason: 'The shed is not finished yet' };
  const out = Inv.canRemove(shed.storage, itemId, qty);
  if (!out.ok) return out;
  const fits = Inv.canAdd(state.inventory, itemId, qty, bagSlots(state));
  if (!fits.ok) return { ok: false, reason: fits.reason === 'No free space' ? 'Your bag is full' : fits.reason };
  Inv.remove(shed.storage, itemId, qty);
  Inv.add(state.inventory, itemId, qty, bagSlots(state));
  bus.emit('withdrawn', { item: itemId, qty });
  return { ok: true };
}
