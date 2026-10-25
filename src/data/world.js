// Starter farm layout. All coordinates are in tiles (see config.TILE).
// Objects are anchored at the bottom-centre of their sprite (x, y) and drawn
// `w` tiles wide, preserving aspect ratio. Colliders are [x0, y0, x1, y1]
// offsets from the anchor, in tiles.

export const SPAWN = { x: 17.6, y: 9.4 };

// Walkable area (tiles). Outside this the forest edge / creek bank blocks.
export const BOUNDS = { x0: 1.6, y0: 3.0, x1: 34.3, y1: 26.4 };

// Ground features used by the terrain painter and collision.
export const PATHS = [
  // [x0, y0, x1, y1] in tiles: rounded strokes of dirt path
  { from: [17.9, 8.3], to: [17.9, 23.0], width: 1.5 },
  { from: [4.0, 11.6], to: [33.0, 11.6], width: 1.4 },
  { from: [7.0, 11.6], to: [7.0, 13.4], width: 1.2 },
  { from: [26.0, 9.8], to: [26.0, 11.6], width: 1.1 },
  { from: [33.0, 11.6], to: [36.5, 11.4], width: 1.3 },
];

export const CREEK = { y0: 23.1, y1: 24.7 };
export const BRIDGE = { x0: 16.9, x1: 18.9 };

// Garden plots. `group` ties a plot to an unlock (null = available from start).
export const PLOT_GROUPS = {
  starter: { unlock: null },
  south: { unlock: 'gardenExpansion' },
};

export const PLOTS = [];
for (const [group, rows] of [['starter', [14, 15]], ['south', [17, 18]]]) {
  for (const row of rows) {
    for (let col = 5; col <= 8; col++) {
      PLOTS.push({ id: `${group}_${col}_${row}`, group, tx: col, ty: row });
    }
  }
}
export const PLOTS_BY_ID = Object.fromEntries(PLOTS.map((p) => [p.id, p]));

// Garden fence rectangle (tiles) with a gate gap on the top edge.
export const GARDEN = { x0: 4.4, y0: 13.0, x1: 9.6, y1: 19.9, gate: [6.4, 7.6] };

// Interactive and decorative world objects.
// interact: id resolved by systems/interactions.js
export const OBJECTS = [
  { id: 'house', building: 'house', sprite: 'building.starter_house', x: 17.7, y: 8.4, w: 5.2, collider: [-2.3, -2.6, 2.4, -0.25],
    interact: 'house', interactPoint: [17.55, 8.55] },
  { id: 'mailbox', sprite: 'building.mailbox', x: 15.0, y: 9.1, w: 1.1, collider: [-0.2, -0.3, 0.2, 0], interact: 'mailbox' },
  { id: 'well', building: 'well', sprite: 'building.well_building', x: 12.0, y: 9.6, w: 2.3, collider: [-0.85, -1.0, 0.85, -0.1], interact: 'well' },
  { id: 'water_barrel', sprite: 'building.water_barrel', x: 11.2, y: 14.2, w: 1.15, collider: [-0.35, -0.4, 0.35, 0], interact: 'well' },
  { id: 'workbench', sprite: 'building.workbench', x: 22.4, y: 9.7, w: 2.5, collider: [-1.05, -0.8, 1.05, -0.1], interact: 'workbench' },
  { id: 'tool_shed', building: 'tool_shed', sprite: 'building.tool_shed', x: 26.0, y: 9.9, w: 3.3, collider: [-1.45, -2.2, 1.45, -0.3],
    interact: 'tool_shed', interactPoint: [26.0, 10.1] },
  { id: 'market_stall', building: 'market_stall', sprite: 'building.market_stall', x: 30.4, y: 10.9, w: 4.2, collider: [-1.95, -1.9, 1.95, -0.25],
    interact: 'market', interactPoint: [30.4, 11.2] },
  { id: 'village_sign', sprite: 'building.signpost', x: 32.4, y: 13.2, w: 1.3, collider: [-0.15, -0.3, 0.15, 0], interact: 'village_sign' },
  { id: 'road_block', sprite: 'foliage.fallen_log', x: 34.3, y: 12.3, w: 2.0, collider: [-1, -0.8, 1, 0], interact: 'road_block' },
  { id: 'garden_sign', sprite: 'building.signpost', x: 10.9, y: 17.6, w: 1.2, collider: [-0.15, -0.3, 0.15, 0], interact: 'garden_sign' },
  { id: 'bridge', sprite: 'building.wooden_bridge', x: 17.9, y: 24.95, w: 2.75, ground: true },
];

// Fence pieces are generated from GARDEN by world/layout.js.

// Hand-placed scenery (sprite, x, y, w, collider radius in tiles or 0).
export const SCENERY = [
  // north tree line behind the house
  ['foliage.tree_oak', 3.2, 4.0, 3.2, 0.35], ['foliage.tree_pine', 6.0, 3.6, 2.4, 0.3],
  ['foliage.tree_oak', 9.0, 4.2, 3.0, 0.35], ['foliage.tree_birch', 12.4, 4.4, 2.6, 0.3],
  ['foliage.tree_pine', 22.6, 4.0, 2.4, 0.3], ['foliage.tree_oak', 25.6, 4.6, 3.1, 0.35],
  ['foliage.tree_autumn', 28.8, 4.4, 2.7, 0.3], ['foliage.tree_pine', 31.6, 4.1, 2.4, 0.3],
  ['foliage.tree_oak', 34.4, 5.4, 3.0, 0.35], ['foliage.tree_blossom', 21.0, 6.6, 2.5, 0.3],
  ['foliage.tree_oak', 14.2, 2.4, 3.0, 0.0], ['foliage.tree_pine', 17.0, 2.2, 2.4, 0.0],
  ['foliage.tree_oak', 19.8, 2.6, 3.0, 0.0],
  // west edge
  ['foliage.tree_oak', 1.4, 8.0, 3.0, 0.35], ['foliage.tree_pine', 1.2, 11.2, 2.4, 0.3],
  ['foliage.tree_birch', 1.6, 14.6, 2.6, 0.3], ['foliage.tree_oak', 1.3, 18.2, 3.0, 0.35],
  ['foliage.tree_pine', 1.5, 21.4, 2.4, 0.3],
  // east edge
  ['foliage.tree_pine', 35.0, 8.4, 2.4, 0.3], ['foliage.tree_oak', 35.2, 15.6, 3.0, 0.35],
  ['foliage.tree_autumn', 34.6, 19.0, 2.7, 0.3], ['foliage.tree_pine', 35.2, 22.2, 2.4, 0.3],
  // middle meadow
  ['foliage.tree_oak', 13.6, 17.4, 3.0, 0.35], ['foliage.tree_blossom', 24.2, 16.4, 2.6, 0.3],
  ['foliage.tree_pine', 28.4, 18.6, 2.4, 0.3], ['foliage.tree_oak', 31.4, 16.0, 3.0, 0.35],
  ['foliage.tree_birch', 21.8, 20.6, 2.5, 0.3], ['foliage.tree_autumn', 12.4, 21.6, 2.6, 0.3],
  // south of creek
  ['foliage.tree_pine', 4.0, 27.4, 2.4, 0], ['foliage.tree_oak', 8.0, 27.8, 3.0, 0],
  ['foliage.tree_oak', 13.0, 27.6, 3.0, 0.35], ['foliage.tree_pine', 22.4, 27.4, 2.4, 0.3],
  ['foliage.tree_oak', 27.0, 27.9, 3.0, 0], ['foliage.tree_birch', 31.4, 27.4, 2.5, 0],
  // bushes, rocks and props
  ['foliage.bush_berries', 14.3, 12.9, 1.5, 0.45], ['foliage.bush_flowering', 21.0, 12.9, 1.5, 0.45],
  ['foliage.bush_yellow_flowers', 23.2, 14.6, 1.4, 0.4], ['foliage.bush_white_flowers', 3.0, 12.6, 1.4, 0.4],
  ['foliage.bush_green', 19.6, 18.0, 1.5, 0.45], ['foliage.bush_green', 33.0, 14.8, 1.4, 0.4],
  ['foliage.rock_mossy', 25.4, 21.0, 1.7, 0.5], ['foliage.rock_cluster', 9.4, 22.0, 1.7, 0.5],
  ['foliage.rock_small', 15.2, 21.4, 1.2, 0.35], ['foliage.rock_small', 29.6, 13.6, 1.1, 0.3],
  ['foliage.tree_stump', 11.6, 19.6, 1.3, 0.4], ['foliage.tree_stump', 27.0, 14.4, 1.3, 0.4],
  ['foliage.fallen_log', 31.0, 21.6, 2.1, 0.0],
  ['terrain2.barrel', 20.6, 8.6, 0.9, 0.3], ['terrain2.wooden_crate', 28.0, 10.7, 0.9, 0.3],
  ['terrain2.wooden_crate', 14.4, 8.2, 0.85, 0.3],
];

// Low ground decoration (drawn into the terrain layer, no collision).
export const GROUND_DECOR = [
  ['foliage.flower_patch', 15.6, 14.4, 1.3], ['foliage.flower_yellow', 22.0, 16.8, 1.2],
  ['foliage.mushrooms', 12.9, 19.0, 0.9], ['foliage.fern', 3.2, 16.4, 1.2],
  ['foliage.grass_tall', 25.0, 13.2, 1.1], ['foliage.flower_patch', 28.6, 20.2, 1.2],
  ['foliage.flower_yellow', 10.8, 10.4, 1.1], ['foliage.grass_tall', 20.4, 22.0, 1.1],
  ['foliage.fern', 33.4, 18.0, 1.2], ['foliage.flower_patch', 4.0, 9.6, 1.2],
  ['foliage.grass_tall', 14.6, 15.8, 1.0], ['foliage.flower_yellow', 30.0, 15.0, 1.1],
  ['foliage.mushrooms', 23.2, 7.6, 0.8], ['foliage.flower_patch', 19.6, 14.8, 1.1],
];
