import { CROPS } from '../data/crops.js';
import { SHOP_STOCK } from '../data/progression.js';
import { getItem } from '../data/items.js';
import { NPCS, NPC_LIST } from '../data/npcs.js';
import { mulberry32 } from '../core/rng.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import { isRequirementMet } from './economy.js';
import { clock } from './time.js';
import { addPoints } from './relations.js';
import { bagSlots } from './buildings.js';

// Delivery requests from villagers.
// state.orders = { day, nextId, list: [{ id, giver, item, qty, coins, rep, deadline, status }] }
// status: open (offered) -> accepted -> done | expired. Progress is read from the
// real inventory when delivering, and an order can only be delivered once.

export const MAX_OFFERS = 4;
export const MAX_ACCEPTED = 3;

// Items the player could plausibly have right now.
export function availableItems(state) {
  const out = new Set();
  for (const e of SHOP_STOCK) {
    const item = getItem(e.item);
    if (item.category === 'seed' && isRequirementMet(state, e.requires)) out.add(item.crop);
  }
  const placedLevel = (type) => state.placed.some((p) => p.type === type && p.level >= 1);
  if (placedLevel('chicken_coop')) out.add('egg');
  if (placedLevel('barn')) {
    out.add('milk');
    out.add('wool');
  }
  return [...out].filter((id) => getItem(id)?.sellPrice != null);
}

const kindOf = (id) => (CROPS[id] ? 'crop' : id);

export function rollover(state, bus = NULL_BUS) {
  const day = clock(state.time).day;
  const o = state.orders;
  if (o.day === day) return false;
  o.day = day;
  for (const ord of o.list) {
    if (['open', 'accepted'].includes(ord.status) && ord.deadline < day) {
      ord.status = 'expired';
      bus.emit('orderExpired', { id: ord.id });
    }
  }
  // keep a short history, then offer fresh requests
  o.list = o.list.filter((x) => ['open', 'accepted'].includes(x.status) || x.deadline >= day - 1).slice(-24);
  const rand = mulberry32(day * 7919 + 13);
  const items = availableItems(state);
  if (!items.length) return true;
  let guard = 0;
  while (o.list.filter((x) => x.status === 'open').length < MAX_OFFERS && guard++ < 30) {
    const giver = NPC_LIST[Math.floor(rand() * NPC_LIST.length)];
    const pool = items.filter((id) => giver.wants.includes(kindOf(id)));
    if (!pool.length) continue;
    const item = pool[Math.floor(rand() * pool.length)];
    if (o.list.some((x) => x.status === 'open' && x.giver === giver.id && x.item === item)) continue;
    const price = getItem(item).sellPrice;
    const qty = Math.max(2, Math.min(10, Math.round(70 / price) + Math.floor(rand() * 4)));
    o.list.push({
      id: `o${o.nextId++}`, giver: giver.id, item, qty,
      coins: Math.round(price * qty * (1.15 + rand() * 0.2)),
      rep: 4 + Math.floor(rand() * 4),
      deadline: day + 2 + Math.floor(rand() * 3),
      status: 'open',
    });
  }
  return true;
}

export const offersFor = (state, giver) => state.orders.list.filter((x) => x.giver === giver && ['open', 'accepted'].includes(x.status));
export const acceptedOrders = (state) => state.orders.list.filter((x) => x.status === 'accepted');
export const openOffers = (state) => state.orders.list.filter((x) => x.status === 'open');
export const daysLeft = (state, ord) => ord.deadline - clock(state.time).day;

export function accept(state, id, bus = NULL_BUS) {
  const ord = state.orders.list.find((x) => x.id === id);
  if (!ord) return { ok: false, reason: 'No such request' };
  if (ord.status !== 'open') return { ok: false, reason: ord.status === 'accepted' ? 'Already accepted' : 'No longer available' };
  if (acceptedOrders(state).length >= MAX_ACCEPTED) return { ok: false, reason: `You can only carry ${MAX_ACCEPTED} requests at a time` };
  if (ord.deadline < clock(state.time).day) return { ok: false, reason: 'That request has expired' };
  ord.status = 'accepted';
  bus.emit('orderAccepted', { id });
  return { ok: true, order: ord };
}

export function have(state, ord) {
  return state.inventory[ord.item] || 0;
}

// Hand the goods to the person who asked. Atomic: nothing changes unless it all fits.
export function deliver(state, id, giver, bus = NULL_BUS) {
  const ord = state.orders.list.find((x) => x.id === id);
  if (!ord) return { ok: false, reason: 'No such request' };
  if (ord.status === 'done') return { ok: false, reason: 'Already delivered' };
  if (ord.status !== 'accepted') return { ok: false, reason: ord.status === 'expired' ? 'That request has expired' : 'Accept the request first' };
  if (giver && ord.giver !== giver) return { ok: false, reason: `That request is for ${NPCS[ord.giver].name}` };
  if (ord.deadline < clock(state.time).day) {
    ord.status = 'expired';
    return { ok: false, reason: 'That request has expired' };
  }
  const can = Inv.canRemove(state.inventory, ord.item, ord.qty);
  if (!can.ok) return { ok: false, reason: `You need ${ord.qty} ${getItem(ord.item).name} (you have ${have(state, ord)})` };
  Inv.remove(state.inventory, ord.item, ord.qty);
  ord.status = 'done';
  state.coins += ord.coins;
  state.stats.earned += ord.coins;
  addPoints(state, ord.giver, ord.rep);
  bus.emit('deliver', { id, giver: ord.giver, item: ord.item, qty: ord.qty, coins: ord.coins, rep: ord.rep });
  return { ok: true, order: ord };
}

export function describe(ord) {
  const item = getItem(ord.item);
  return `${ord.qty} × ${item.name}`;
}
