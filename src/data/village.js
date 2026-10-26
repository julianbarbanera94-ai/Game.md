// Willowmere village (east of the farm). Coordinates are tiles, anchored at the
// bottom-centre like src/data/world.js. The buildings reuse existing building
// sprites as stand-ins until dedicated village art is supplied.

export const VILLAGE_X0 = 35.8; // everything east of this is the village
export const ROAD_GATE = { x0: 33.6, y0: 10.5, x1: 35.4, y1: 12.9 }; // blocked until the fallen tree is cleared
export const FOREST_WALL_X = [34.7, 35.9]; // invisible wall behind the forest-edge trees
export const ROAD_Y = [10.6, 12.7]; // the gap in that wall

export const PLAZA = { x0: 44.2, y0: 8.7, x1: 53.4, y1: 15.3 }; // cobbled square (tiles)

export const VILLAGE_PATHS = [
  { from: [36.5, 11.5], to: [60.5, 11.5], width: 1.5 },
  { from: [48.8, 8.4], to: [48.8, 15.6], width: 1.3 },
  { from: [54.6, 11.5], to: [54.6, 16.8], width: 1.1 },
];

export const VILLAGE_OBJECTS = [
  { id: 'v_general_store', sprite: 'building4.house_l3', x: 43.4, y: 8.1, w: 5.4, collider: [-2.4, -2.5, 2.4, -0.3] },
  { id: 'v_blacksmith', sprite: 'building.small_barn', x: 48.8, y: 7.9, w: 3.8, collider: [-1.6, -2.2, 1.6, -0.3] },
  { id: 'v_carpenter', sprite: 'building4.storage_shed_l3', x: 54.0, y: 8.1, w: 4.0, collider: [-1.7, -1.9, 1.7, -0.3] },
  { id: 'v_inn', sprite: 'building4.house_l2', x: 55.4, y: 16.9, w: 5.0, collider: [-2.2, -2.4, 2.2, -0.3] },
  { id: 'v_stall_trader', sprite: 'building.market_stall', x: 45.2, y: 14.9, w: 3.4, collider: [-1.55, -1.5, 1.55, -0.25] },
  { id: 'v_stall_flowers', sprite: 'building.market_stall', x: 52.2, y: 14.9, w: 3.4, collider: [-1.55, -1.5, 1.55, -0.25] },
  { id: 'v_well', sprite: 'building.well_building', x: 48.8, y: 12.3, w: 1.9, collider: [-0.7, -0.8, 0.7, -0.1] },
  { id: 'v_notice_board', sprite: 'building.signpost', x: 46.4, y: 10.4, w: 1.2, collider: [-0.15, -0.3, 0.15, 0], interact: 'notice_board' },
  { id: 'v_lantern_1', sprite: 'prop.lantern_post', x: 45.4, y: 9.6, w: 0.7, collider: [-0.15, -0.2, 0.15, 0], light: true },
  { id: 'v_lantern_2', sprite: 'prop.lantern_post', x: 52.4, y: 9.6, w: 0.7, collider: [-0.15, -0.2, 0.15, 0], light: true },
  { id: 'v_lantern_3', sprite: 'prop.lantern_post', x: 46.6, y: 13.6, w: 0.7, collider: [-0.15, -0.2, 0.15, 0], light: true },
  { id: 'v_lantern_4', sprite: 'prop.lantern_post', x: 51.0, y: 13.6, w: 0.7, collider: [-0.15, -0.2, 0.15, 0], light: true },
  { id: 'v_bench', sprite: 'prop.bench', x: 50.8, y: 10.3, w: 1.4, collider: [-0.6, -0.4, 0.6, 0] },
  { id: 'v_barrel', sprite: 'terrain2.barrel', x: 41.0, y: 8.2, w: 0.9, collider: [-0.3, -0.3, 0.3, 0] },
  { id: 'v_hay', sprite: 'prop.hay_bales', x: 50.8, y: 8.1, w: 1.5, collider: [-0.6, -0.4, 0.6, 0] },
];

// [sprite, x, y, width, collider radius] — appended to SCENERY so saved indices stay valid.
// Everything east of x 61 and the north row frames the village and cannot be cleared.
export const VILLAGE_SCENERY = [
  // forest edge between the farm and the village (leaves the road open)
  ['foliage.tree_pine', 35.0, 4.8, 2.4, 0.3], ['foliage.tree_oak', 35.2, 6.6, 3.0, 0.35],
  ['foliage.tree_pine', 35.0, 10.0, 2.4, 0.3], ['foliage.tree_oak', 35.1, 13.6, 3.0, 0.35],
  ['foliage.tree_pine', 35.0, 17.6, 2.4, 0.3], ['foliage.tree_birch', 35.1, 20.6, 2.6, 0.3],
  ['foliage.tree_oak', 35.2, 25.2, 3.0, 0.35],
  // north tree line behind the shops
  ['foliage.tree_oak', 38.4, 4.4, 3.0, 0.35], ['foliage.tree_pine', 41.4, 4.2, 2.4, 0.3],
  ['foliage.tree_birch', 44.6, 4.6, 2.6, 0.3], ['foliage.tree_oak', 47.6, 4.3, 3.0, 0.35],
  ['foliage.tree_blossom', 51.0, 4.5, 2.5, 0.3], ['foliage.tree_pine', 54.4, 4.2, 2.4, 0.3],
  ['foliage.tree_oak', 57.4, 4.5, 3.0, 0.35], ['foliage.tree_autumn', 60.4, 4.6, 2.7, 0.3],
  // east edge
  ['foliage.tree_pine', 62.0, 8.0, 2.4, 0.3], ['foliage.tree_oak', 62.2, 13.0, 3.0, 0.35],
  ['foliage.tree_pine', 62.0, 18.0, 2.4, 0.3], ['foliage.tree_oak', 62.1, 22.0, 3.0, 0.35],
  // south side of the village
  ['foliage.tree_oak', 38.0, 21.5, 3.0, 0.35], ['foliage.tree_birch', 42.4, 21.8, 2.6, 0.3],
  ['foliage.tree_pine', 47.0, 21.6, 2.4, 0.3], ['foliage.tree_oak', 61.0, 21.8, 3.0, 0.35],
  // village greenery
  ['foliage.bush_flowering', 41.2, 10.6, 1.4, 0.4], ['foliage.bush_white_flowers', 57.6, 10.2, 1.4, 0.4],
  ['foliage.bush_green', 40.0, 15.4, 1.5, 0.45], ['foliage.bush_berries', 58.6, 14.4, 1.5, 0.45],
  ['foliage.bush_yellow_flowers', 37.8, 17.6, 1.4, 0.4], ['foliage.bush_green', 49.0, 19.4, 1.5, 0.45],
  ['foliage.rock_cluster', 40.6, 19.0, 1.7, 0.5], ['foliage.rock_small', 59.0, 19.6, 1.2, 0.35],
];

export const VILLAGE_DECOR = [
  ['foliage.flower_patch', 43.0, 17.4, 1.3], ['foliage.flower_yellow', 57.4, 13.6, 1.2],
  ['foliage.flower_patch', 38.8, 13.4, 1.2], ['foliage.fern', 59.2, 8.2, 1.2],
  ['foliage.mushrooms', 41.6, 6.4, 0.9], ['foliage.grass_tall', 53.0, 19.2, 1.1],
];
