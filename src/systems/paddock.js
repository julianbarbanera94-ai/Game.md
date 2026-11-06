import { PADDOCK } from '../data/world.js';
import { BUILDINGS, DECORATIONS } from '../data/buildings.js';
import { areaRect } from './buildings.js';
import { TILE } from '../config.js';

// The East Paddock is bought with land: it is only free to buy when nothing
// stands in it. Saves made before it existed may have a building or a parked
// tractor inside the paddock; the purchase then says what to move.

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

// The first thing in the way, as a sentence the player can act on, or null.
export function paddockBlocker(state) {
  for (const rec of state.placed) {
    if (!rec.type) continue;
    const r = areaRect(rec.type, rec.x, rec.y);
    if (overlaps(r, PADDOCK)) {
      const name = BUILDINGS[rec.type]?.name || DECORATIONS[rec.type]?.name || 'building';
      return `Move your ${name} out of the paddock first`;
    }
  }
  for (const v of state.vehicles) {
    const x = v.x / TILE, y = v.y / TILE;
    if (x > PADDOCK.x0 - 0.5 && x < PADDOCK.x1 + 0.5 && y > PADDOCK.y0 - 0.5 && y < PADDOCK.y1 + 0.5) {
      return 'Drive your tractor out of the paddock first';
    }
  }
  return null;
}
