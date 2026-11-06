import { PARCEL_BY_ID } from '../data/land.js';
import { BUILDINGS, DECORATIONS } from '../data/buildings.js';
import { areaRect } from './buildings.js';
import { TILE } from '../config.js';

// Land inside the starter map (the East Paddock) is only free to buy when nothing
// stands on it. Saves made before it existed may have a building or a parked
// tractor inside; the purchase then says what to move. Parcels in the forest
// beyond the starter map can't have anything on them yet.

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const bounds = (poly) => ({ x0: Math.min(...poly.map((p) => p[0])), y0: Math.min(...poly.map((p) => p[1])), x1: Math.max(...poly.map((p) => p[0])), y1: Math.max(...poly.map((p) => p[1])) });

// The first thing in the way of a parcel, as a sentence the player can act on, or null.
export function parcelBlocker(state, id) {
  const parcel = PARCEL_BY_ID[id];
  if (!parcel?.core) return null;
  const P = bounds(parcel.poly);
  for (const rec of state.placed) {
    if (!rec.type) continue;
    const r = areaRect(rec.type, rec.x, rec.y);
    if (overlaps(r, P)) {
      const name = BUILDINGS[rec.type]?.name || DECORATIONS[rec.type]?.name || 'building';
      return `Move your ${name} out of the paddock first`;
    }
  }
  for (const v of state.vehicles) {
    const x = v.x / TILE, y = v.y / TILE;
    if (x > P.x0 - 0.5 && x < P.x1 + 0.5 && y > P.y0 - 0.5 && y < P.y1 + 0.5) return 'Drive your tractor out of the paddock first';
  }
  return null;
}

export const paddockBlocker = (state) => parcelBlocker(state, 'eastPaddock');
