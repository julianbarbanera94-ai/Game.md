import { BUILDINGS } from '../data/buildings.js';
import {
  SPECIES, SELL_BACK_RATIO, PET_COOLDOWN_MINUTES, PET_HAPPINESS, NEW_ANIMAL_FED_MINUTES,
  HAPPY_THRESHOLD, HAPPY_SPEEDUP, HAPPY_GAIN_PER_MIN, HAPPY_LOSS_PER_MIN,
} from '../data/animals.js';
import { getItem } from '../data/items.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import { bagSlots } from './buildings.js';

// Livestock live in state.animals:
//   { uid, species, home (placed building uid), name, fedUntil, happiness 0-100,
//     progress (fed minutes toward the next product), stock (finished products
//     waiting to be collected), petAt }
// Time-based values use the shared world clock (state.time, game minutes).

export function homeRecord(state, uid) {
  return state.placed.find((p) => p.uid === uid && BUILDINGS[p.type]?.livestock) || null;
}

export function animalsAt(state, homeUid) {
  return state.animals.filter((a) => a.home === homeUid);
}

export function capacity(rec) {
  return BUILDINGS[rec.type].capacity[Math.max(0, rec.level - 1)] || 0;
}

export const isHungry = (state, a) => a.fedUntil <= state.time;
export const isHappy = (a) => a.happiness >= HAPPY_THRESHOLD;
export const canPet = (state, a) => state.time - a.petAt >= PET_COOLDOWN_MINUTES;
export const hoursFed = (state, a) => Math.max(0, Math.ceil((a.fedUntil - state.time) / 60));

export function buy(state, speciesId, homeUid, bus = NULL_BUS) {
  const sp = SPECIES[speciesId];
  const rec = homeRecord(state, homeUid);
  if (!sp || !rec) return { ok: false, reason: 'Unknown animal or building' };
  if (rec.level < 1) return { ok: false, reason: 'The building is not finished yet' };
  if (sp.home !== rec.type) return { ok: false, reason: `${sp.name}s live in a ${BUILDINGS[sp.home].name.toLowerCase()}` };
  if (animalsAt(state, homeUid).length >= capacity(rec)) return { ok: false, reason: `The ${BUILDINGS[rec.type].name.toLowerCase()} is full — upgrade it for more room` };
  if (state.coins < sp.cost) return { ok: false, reason: 'Not enough coins' };
  state.coins -= sp.cost;
  state.nextUid = (state.nextUid || 1) + 1;
  const used = new Set(state.animals.filter((a) => a.species === sp.id).map((a) => a.name));
  const name = sp.names.find((n) => !used.has(n)) || `${sp.name} ${state.nextUid}`;
  const animal = {
    uid: `a${state.nextUid}`, species: sp.id, home: homeUid, name,
    fedUntil: state.time + NEW_ANIMAL_FED_MINUTES, happiness: 50, progress: 0, stock: 0, petAt: -1e9,
  };
  state.animals.push(animal);
  bus.emit('buyAnimal', { species: sp.id, uid: animal.uid, cost: sp.cost });
  return { ok: true, animal };
}

export function sellValue(a) {
  return Math.floor(SPECIES[a.species].cost * SELL_BACK_RATIO);
}

export function sell(state, uid, bus = NULL_BUS) {
  const i = state.animals.findIndex((a) => a.uid === uid);
  if (i < 0) return { ok: false, reason: 'No such animal' };
  const a = state.animals[i];
  const value = sellValue(a);
  state.animals.splice(i, 1);
  state.coins += value;
  bus.emit('sellAnimal', { species: a.species, value });
  return { ok: true, value, animal: a };
}

// Feed every hungry animal in one building, one feed item each. Stops when the
// right feed runs out and reports what was missing.
export function feedYard(state, homeUid, bus = NULL_BUS) {
  let fed = 0;
  const missing = {};
  for (const a of animalsAt(state, homeUid)) {
    if (!isHungry(state, a)) continue;
    const sp = SPECIES[a.species];
    if (Inv.remove(state.inventory, sp.feed, 1).ok) {
      a.fedUntil = state.time + sp.fedMinutes;
      fed += 1;
    } else {
      missing[sp.feed] = (missing[sp.feed] || 0) + 1;
    }
  }
  if (fed) bus.emit('feed', { qty: fed });
  const lacking = Object.entries(missing).map(([id, n]) => `${n} ${getItem(id).name}`).join(', ');
  if (!fed && lacking) return { ok: false, fed, reason: `Out of feed — buy ${getItem(Object.keys(missing)[0]).name} at the market` };
  if (!fed) return { ok: false, fed, reason: 'Nobody is hungry' };
  return { ok: true, fed, short: lacking };
}

export function pet(state, uid, bus = NULL_BUS) {
  const a = state.animals.find((x) => x.uid === uid);
  if (!a) return { ok: false, reason: 'No such animal' };
  if (!canPet(state, a)) return { ok: false, reason: `${a.name} has had enough attention for now` };
  a.petAt = state.time;
  a.happiness = Math.min(100, a.happiness + PET_HAPPINESS);
  bus.emit('pet', { species: a.species });
  return { ok: true };
}

// Hand the product to the player's bag; the animal keeps it if the bag is full.
export function collect(state, uid, bus = NULL_BUS) {
  const a = state.animals.find((x) => x.uid === uid);
  if (!a) return { ok: false, reason: 'No such animal' };
  if (a.stock <= 0) return { ok: false, reason: `${a.name} has nothing to collect yet` };
  const item = SPECIES[a.species].product;
  const added = Inv.add(state.inventory, item, a.stock, bagSlots(state));
  if (!added.ok) return { ok: false, reason: added.reason === 'No free space' ? 'Your bag is full' : added.reason };
  const qty = a.stock;
  a.stock = 0;
  bus.emit('collect', { item, qty });
  return { ok: true, item, qty };
}

export function collectYard(state, homeUid, bus = NULL_BUS) {
  const got = {};
  let blocked = null;
  for (const a of animalsAt(state, homeUid)) {
    if (a.stock <= 0) continue;
    const r = collect(state, a.uid, bus);
    if (r.ok) got[r.item] = (got[r.item] || 0) + r.qty;
    else blocked = r.reason;
  }
  const total = Object.values(got).reduce((n, q) => n + q, 0);
  if (!total) return { ok: false, reason: blocked || 'Nothing to collect yet' };
  return { ok: true, got, blocked };
}

export function readyCount(state, homeUid) {
  return animalsAt(state, homeUid).reduce((n, a) => n + a.stock, 0);
}

// Advance livestock by `minutes` from state.time. Production only accrues while
// fed (like crops only grow while moist); happy animals produce 25% faster.
export function tickAnimals(state, minutes) {
  const t0 = state.time;
  for (const a of state.animals) {
    const sp = SPECIES[a.species];
    const fedMin = Math.max(0, Math.min(minutes, a.fedUntil - t0));
    const hungryMin = minutes - fedMin;
    a.happiness = Math.max(0, Math.min(100, a.happiness + fedMin * HAPPY_GAIN_PER_MIN - hungryMin * HAPPY_LOSS_PER_MIN));
    if (a.stock >= sp.maxStock) {
      a.progress = 0;
      continue;
    }
    a.progress += fedMin * (isHappy(a) ? HAPPY_SPEEDUP : 1);
    while (a.progress >= sp.cycleMinutes && a.stock < sp.maxStock) {
      a.progress -= sp.cycleMinutes;
      a.stock += 1;
    }
    if (a.stock >= sp.maxStock) a.progress = 0;
  }
}

// One-line status for UI and prompts.
export function statusText(state, a) {
  if (isHungry(state, a)) return 'Hungry';
  return `Fed for ${hoursFed(state, a)}h`;
}

export function moodText(a) {
  if (a.happiness >= 80) return 'Delighted';
  if (a.happiness >= HAPPY_THRESHOLD) return 'Happy';
  if (a.happiness >= 30) return 'Content';
  return 'Unhappy';
}
