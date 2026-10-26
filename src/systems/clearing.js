import { SCENERY } from '../data/world.js';
import { VILLAGE_X0 } from '../data/village.js';
import { NULL_BUS } from '../core/events.js';

// Clearing scenery (trees, bushes, rocks...) to make room for buildings.
// state.cleared holds indices into SCENERY. The outer ring of trees frames the
// map and stays; everything inside can be cleared for coins.

const KINDS = [
  { match: 'tree_stump', name: 'tree stump', cost: 25 },
  { match: 'fallen_log', name: 'fallen log', cost: 30 },
  { match: 'tree_', name: 'tree', cost: 60 },
  { match: 'bush_', name: 'bush', cost: 20 },
  { match: 'rock_', name: 'boulder', cost: 40 },
  { match: 'barrel', name: 'old barrel', cost: 10 },
  { match: 'crate', name: 'old crate', cost: 10 },
];

const BORDER = { x0: 2.6, x1: 34.4, y0: 3.4, y1: 27.0 };

export function clearInfo(index) {
  const e = SCENERY[index];
  if (!e) return null;
  const [sprite, x, y] = e;
  const kind = KINDS.find((k) => sprite.includes(k.match));
  if (!kind || x >= VILLAGE_X0) return null; // the village is not for clearing
  if (sprite.includes('tree_') && !sprite.includes('stump') && (x < BORDER.x0 || x > BORDER.x1 || y < BORDER.y0 || y > BORDER.y1)) return null;
  return { index, name: kind.name, cost: kind.cost, x, y };
}

export const isCleared = (state, index) => state.cleared.includes(index);

export function clearables(state) {
  const out = [];
  for (let i = 0; i < SCENERY.length; i++) {
    if (isCleared(state, i)) continue;
    const info = clearInfo(i);
    if (info) out.push(info);
  }
  return out;
}

export function clear(state, index, bus = NULL_BUS) {
  const info = clearInfo(index);
  if (!info) return { ok: false, reason: "That can't be cleared" };
  if (isCleared(state, index)) return { ok: false, reason: 'Already cleared' };
  if (state.coins < info.cost) return { ok: false, reason: `Clearing the ${info.name} costs ${info.cost} coins` };
  state.coins -= info.cost;
  state.cleared.push(index);
  bus.emit('cleared', { index, name: info.name, cost: info.cost });
  return { ok: true, info };
}
