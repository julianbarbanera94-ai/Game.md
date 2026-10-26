import { PATHS } from '../data/world.js';
import { PLAZA } from '../data/village.js';
import { TILE } from '../config.js';

// How fast wheels can roll over the ground at world position (x, y) px:
// 1 on dirt roads, the village square and the bridge, less on grass.

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const GRASS_FACTOR = 0.72;
export const FIELD_FACTOR = 0.6;

export function onRoad(x, y) {
  for (const p of PATHS) {
    const d = distToSegment(x, y, p.from[0] * TILE, p.from[1] * TILE, p.to[0] * TILE, p.to[1] * TILE);
    if (d <= (p.width / 2) * TILE) return true;
  }
  return x > PLAZA.x0 * TILE && x < PLAZA.x1 * TILE && y > PLAZA.y0 * TILE && y < PLAZA.y1 * TILE;
}

// `soft` is true over worked plots (soft soil).
export function groundFactor(x, y, soft = false) {
  if (onRoad(x, y)) return 1;
  return soft ? FIELD_FACTOR : GRASS_FACTOR;
}
