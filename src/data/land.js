import { mulberry32 } from '../core/rng.js';

// The wider farm beyond the starter map (tiles). The starter map (64 x 28, top-left)
// is unchanged; the rest of the 128 x 56 world is wild forest with open meadows
// (the parcels) that will be bought one by one. Geometry only lives here; the
// forest fill is deterministic and is appended to SCENERY, so saved indices stay valid.

export const CORE = { cols: 64, rows: 28 };

// Where the creek (and, past x 64, its extension) meets the east river.
export const CREEK_END_X = 107;

// The east river: centreline (tiles) and width, flowing from the north-east corner to the south.
export const RIVER = {
  width: 2.8,
  line: [[128, 0], [122, 8], [119, 14], [112, 20], [107, 25], [104, 34], [99, 40], [92, 44], [84, 48], [76, 52], [70, 56]],
};

// Open meadows inside the forest: the land a player can buy. Different sizes and shapes,
// following the river and the forest edge.
export const PARCEL_SHAPES = {
  riverside_paddock: { name: 'Riverside Paddock', poly: [[70, 4], [88, 6], [96, 16], [90, 23], [74, 21], [68, 14]] },
  northern_meadow: { name: 'Northern Meadow', poly: [[98, 5], [121, 5], [123, 16], [116, 22], [102, 20]] },
  hillside_pasture: { name: 'Hillside Pasture', poly: [[6, 31], [30, 33], [58, 38], [68, 46], [60, 51], [30, 52], [9, 51], [4, 42]] },
  orchard_woods: { name: 'Orchard Woods', poly: [[112, 31], [123, 31], [124, 50], [112, 51], [106, 44]] },
};

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Distance (tiles) from a point to a polyline.
export function distToLine(x, y, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

// Distance (tiles) from a point to the edge of a polygon (for a soft forest edge).
const nearEdge = (x, y, poly) => distToLine(x, y, [...poly, poly[0]]);

const TREES = [
  ['foliage.tree_oak', 3.1, 0.35], ['foliage.tree_pine', 2.4, 0.3], ['foliage.tree_birch', 2.6, 0.3],
  ['foliage.tree_autumn', 2.7, 0.3], ['foliage.tree_oak', 3.3, 0.35], ['foliage.tree_pine', 2.7, 0.3], ['foliage.tree_blossom', 2.5, 0.3],
];

// Forest everywhere outside the starter map except meadows, the river and the creek extension.
export function forestScenery(worldCols, worldRows) {
  const rand = mulberry32(20260726);
  const out = [];
  const polys = Object.values(PARCEL_SHAPES).map((p) => p.poly);
  for (let y = 0.8; y < worldRows; y += 1.5) {
    for (let x = 0.8; x < worldCols; x += 1.5) {
      const px = x + (rand() - 0.5) * 1.3, py = y + (rand() - 0.5) * 1.3;
      const t = TREES[Math.floor(rand() * TREES.length)];
      const keepRoll = rand();
      if (px < CORE.cols + 0.5 && py < CORE.rows + 0.5) continue; // the starter map has its own scenery
      if (distToLine(px, py, RIVER.line) < RIVER.width / 2 + 1.4) continue;
      if (px > CORE.cols && px < CREEK_END_X && py > 21.4 && py < 26.8) continue; // the creek running east
      let inMeadow = false;
      for (const poly of polys) {
        if (pointInPoly(px, py, poly)) { inMeadow = true; break; }
      }
      if (inMeadow) continue;
      // thin out right at a meadow edge so the forest edge is ragged, not a wall
      if (polys.some((poly) => nearEdge(px, py, poly) < 1.1) && keepRoll < 0.35) continue;
      out.push([t[0], Math.round(px * 100) / 100, Math.round(py * 100) / 100, t[1], 0]); // no collider: unreachable until a parcel is bought
    }
  }
  return out;
}
