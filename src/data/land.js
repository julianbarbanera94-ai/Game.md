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

// Land you can buy, one entry per parcel: adding a parcel is one entry here.
//   poly     the fenced meadow (tiles)           field  the plot grid inside it (tiles)
//   requires what must be true before it can be bought
//   sign     where its for-sale signpost stands (in land you already own)
//   road     { line, width } the track in from owned land; the gate stands at gate
// The starter-map East Paddock (core: true) has no road or fence: it is open meadow.
export const PARCELS = [
  {
    id: 'eastPaddock', group: 'paddock', name: 'East Paddock', price: 1200, core: true,
    requires: { unlock: 'northField', placed: 'garage' },
    blurb: 'A long meadow east of the road: 40 crop plots that tractors can plough, seed and harvest in passes.',
    poly: [[22.9, 13.9], [31.1, 13.9], [31.1, 19.1], [22.9, 19.1]], field: { x0: 23, y0: 14, cols: 8, rows: 5 }, sign: [22.3, 16.4],
  },
  {
    id: 'riversidePaddock', group: 'riversidePaddock', name: 'Riverside Paddock', price: 900,
    requires: { flag: 'roadOpen' },
    blurb: 'A small paddock past the village: 108 plots in a meadow by the river.',
    poly: [[70, 4], [88, 6], [96, 16], [90, 23], [74, 21], [68, 14]], field: { x0: 75, y0: 9, cols: 12, rows: 9 },
    sign: [60.6, 12.9], gate: [61.7, 11.9], road: { line: [[61.2, 11.6], [66, 12.4], [70.5, 13.2]], width: 3.4 },
  },
  {
    id: 'northernMeadow', group: 'northernMeadow', name: 'Northern Meadow', price: 4800,
    requires: { unlock: 'riversidePaddock' },
    blurb: 'A broad meadow beside the river: 70 plots and room for animals.',
    poly: [[98, 5], [121, 5], [123, 16], [116, 22], [102, 20]], field: { x0: 104, y0: 7, cols: 10, rows: 7 },
    sign: [93.4, 15.6], gate: [95.0, 15.0], road: { line: [[94.5, 15], [99, 14], [101.5, 13]], width: 3.4 },
  },
  {
    id: 'woodlandGlade', group: 'woodlandGlade', name: 'Woodland Glade', price: 2100,
    requires: { unlock: 'northernMeadow' },
    blurb: 'A sheltered clearing in the eastern woods: 90 plots.',
    poly: [[112, 31], [123, 31], [124, 50], [112, 51], [106, 44]], field: { x0: 112, y0: 36, cols: 9, rows: 10 },
    sign: [108.2, 17.3], gate: [117.0, 24.0], bridge: { at: [112, 20.1], rot: -Math.PI / 4, w: 3.2 },
    road: { line: [[107.6, 18.2], [110.2, 19.2], [112, 20.1], [116, 21.6], [117, 24], [116.5, 31.5]], width: 3.4 },
  },
  {
    id: 'hillsidePasture', group: 'hillsidePasture', name: 'Hillside Pasture', price: 3600,
    requires: { unlock: 'northField' },
    blurb: 'A large pasture south of the creek, past the bridge: 192 plots and plenty of room to graze.',
    poly: [[6, 31], [30, 33], [58, 38], [68, 46], [60, 51], [30, 52], [9, 51], [4, 42]], field: { x0: 14, y0: 40, cols: 24, rows: 8 },
    sign: [19.7, 26.1], gate: [17.9, 26.7], road: { line: [[17.9, 25.6], [17.9, 31.5], [17.5, 35]], width: 3.4 },
  },
];
export const PARCEL_BY_ID = Object.fromEntries(PARCELS.map((p) => [p.id, p]));
export const PARCEL_BY_GROUP = Object.fromEntries(PARCELS.map((p) => [p.group, p]));

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
  const polys = PARCELS.filter((p) => !p.core).map((p) => p.poly);
  const roads = PARCELS.filter((p) => p.road).map((p) => p.road);
  for (let y = 0.8; y < worldRows; y += 1.5) {
    for (let x = 0.8; x < worldCols; x += 1.5) {
      const px = x + (rand() - 0.5) * 1.3, py = y + (rand() - 0.5) * 1.3;
      const t = TREES[Math.floor(rand() * TREES.length)];
      const keepRoll = rand();
      if (px < CORE.cols + 0.5 && py < CORE.rows + 0.5) continue; // the starter map has its own scenery
      if (distToLine(px, py, RIVER.line) < RIVER.width / 2 + 1.4) continue;
      if (px > CORE.cols && px < CREEK_END_X && py > 21.4 && py < 26.8) continue; // the creek running east
      if (roads.some((r) => distToLine(px, py, r.line) < r.width / 2 + 1.3)) continue; // keep the tracks open
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

// Landmarks and the orchard, placed on the bought land and in the village.
// Same shape as the objects in world.js: sprite anchored bottom-centre, w in tiles,
// collider [x0, y0, x1, y1] in tiles from the anchor. frames/fps animate a sprite.
export const LANDMARKS = [
  { id: 'lm_windmill', sprite: 'prop.windmill_f0', frames: ['prop.windmill_f0', 'prop.windmill_f1', 'prop.windmill_f2', 'prop.windmill_f3'], fps: 3, x: 72.2, y: 13.0, w: 6.0, collider: [-1.3, -1.4, 1.3, -0.2] },
  { id: 'lm_greenhouse', sprite: 'prop.greenhouse_planted', x: 82.0, y: 21.6, w: 5.0, collider: [-2.3, -1.1, 2.3, -0.2] },
  { id: 'lm_waterfall', sprite: 'prop.waterfall_f0', frames: ['prop.waterfall_f0', 'prop.waterfall_f1', 'prop.waterfall_f2', 'prop.waterfall_f3'], fps: 6, x: 125.4, y: 7.0, w: 6.0 },
  { id: 'lm_silo', sprite: 'prop.silo', x: 44.5, y: 46.4, w: 2.5, collider: [-0.9, -1.0, 0.9, -0.1] },
  { id: 'lm_apple', sprite: 'foliage.tree_apple', x: 113.0, y: 34.6, w: 2.9, collider: [-0.35, -0.3, 0.35, 0] },
  { id: 'lm_pear', sprite: 'foliage.tree_pear', x: 115.6, y: 34.6, w: 2.9, collider: [-0.35, -0.3, 0.35, 0] },
  { id: 'lm_orange', sprite: 'foliage.tree_orange', x: 118.2, y: 34.6, w: 2.9, collider: [-0.35, -0.3, 0.35, 0] },
  { id: 'lm_cherry', sprite: 'foliage.tree_cherry', x: 120.8, y: 34.6, w: 2.9, collider: [-0.35, -0.3, 0.35, 0] },
];
