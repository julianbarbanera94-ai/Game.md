import { BUILDINGS } from '../data/buildings.js';

// Geometry of the fenced pasture below a livestock building. All values are in
// tiles; (x, y) is the building's bottom-centre anchor.
export function pastureOf(type, x, y) {
  const def = BUILDINGS[type];
  if (!def?.pasture) return null;
  const { w, h, gate = 1.4 } = def.pasture;
  const rect = { x0: x - w / 2, y0: y + 0.2, x1: x + w / 2, y1: y + 0.2 + h };
  const inset = 0.5;
  return {
    rect,
    // where animals may wander (feet positions)
    bounds: { x0: rect.x0 + inset, y0: rect.y0 + inset, x1: rect.x1 - inset, y1: rect.y1 - 0.25 },
    gate: [x - gate / 2, x + gate / 2],
  };
}

// Fence collision: both sides and the bottom edge except the gate gap.
export function pastureColliders(type, x, y) {
  const g = pastureOf(type, x, y);
  if (!g) return [];
  const t = 0.16;
  const { rect, gate } = g;
  return [
    { x0: rect.x0 - t, y0: rect.y0, x1: rect.x0 + t, y1: rect.y1 + t },
    { x0: rect.x1 - t, y0: rect.y0, x1: rect.x1 + t, y1: rect.y1 + t },
    { x0: rect.x0, y0: rect.y1 - t, x1: gate[0], y1: rect.y1 + t },
    { x0: gate[1], y0: rect.y1 - t, x1: rect.x1, y1: rect.y1 + t },
  ];
}
