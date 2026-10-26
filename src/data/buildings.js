// Building families with three levels each (Phase 4). Level 1 of the
// original farm buildings uses the high-resolution Phase 1 sprite; levels 2-3
// use Phase 4 panel cut-outs. `w` is the draw width in tiles; the anchor
// (bottom-centre) never moves between levels.
//
// requires: { quest } | { unlock } | { building: [id, level] }
// buildMinutes: game minutes of construction before the new level is ready.

export const BUILDINGS = {
  house: {
    id: 'house',
    name: 'Cottage',
    levels: [
      { sprite: 'building.starter_house', w: 5.2, effect: 'A cosy start. Bag holds 16 items.' },
      { sprite: 'building4.house_l2', w: 5.0, cost: 400, buildMinutes: 300, requires: { quest: 'q_room_to_grow' }, effect: 'Bag holds 24 items.' },
      { sprite: 'building4.house_l3', w: 6.4, cost: 1200, buildMinutes: 480, requires: { building: ['market_stall', 2] }, effect: 'Bag holds 32 items.' },
    ],
  },
  well: {
    id: 'well',
    name: 'Well',
    levels: [
      { sprite: 'building.well_building', w: 2.3, effect: 'Refill your watering can.' },
      { sprite: 'building4.well_l2', w: 2.3, cost: 300, buildMinutes: 240, requires: { quest: 'q_market_day' }, effect: 'A pipe waters the north garden bed every morning.' },
      { sprite: 'building4.well_l3', w: 2.7, cost: 900, buildMinutes: 360, requires: { unlock: 'gardenExpansion' }, effect: 'Waters every garden plot every morning.' },
    ],
  },
  tool_shed: {
    id: 'tool_shed',
    name: 'Workshop',
    levels: [
      { sprite: 'building.tool_shed', w: 3.3, effect: 'Watering can holds 10.' },
      { sprite: 'building4.tool_shed_l2', w: 3.3, cost: 150, buildMinutes: 180, requires: { quest: 'q_first_harvest' }, effect: 'Watering can holds 25.' },
      { sprite: 'building4.tool_shed_l3', w: 4.0, cost: 600, buildMinutes: 360, requires: { building: ['house', 2] }, effect: 'Watering can holds 40 and waters 3 plots in a row.' },
    ],
  },
  market_stall: {
    id: 'market_stall',
    name: 'Market Stall',
    levels: [
      { sprite: 'building.market_stall', w: 4.2, effect: 'Standard prices.' },
      { sprite: 'building4.market_stall_l2', w: 3.8, cost: 350, buildMinutes: 240, requires: { quest: 'q_market_day' }, effect: 'Produce sells for 10% more.' },
      { sprite: 'building4.market_stall_l3', w: 4.6, cost: 1000, buildMinutes: 420, requires: { building: ['house', 2] }, effect: 'Produce sells for 25% more.' },
    ],
  },
  storage_shed: {
    id: 'storage_shed',
    name: 'Storage Shed',
    placeable: true,
    footprint: [2.6, 1.3], // collision size in tiles (w, h) above the anchor
    levels: [
      { sprite: 'building4.storage_shed_l1', w: 2.9, cost: 200, buildMinutes: 360, requires: { quest: 'q_restock' }, effect: 'Stores 12 kinds of items.' },
      { sprite: 'building4.storage_shed_l2', w: 3.0, cost: 250, buildMinutes: 240, requires: { building: ['house', 2] }, effect: 'Stores 24 kinds of items.' },
      { sprite: 'building4.storage_shed_l3', w: 3.6, cost: 600, buildMinutes: 360, requires: { building: ['house', 3] }, effect: 'Stores 36 kinds of items.' },
    ],
  },
  // Livestock buildings (Phase 5). Sprites are Phase 4 panel cut-outs drawn at a
  // scale where the hens baked into the art match the real chicken sprites.
  // footprint = collision [w, h] in tiles above the anchor, per level.
  // pasture = fenced roaming area below the anchor (tiles), with a gate gap.
  chicken_coop: {
    id: 'chicken_coop',
    name: 'Chicken Coop',
    placeable: true,
    livestock: true,
    capacity: [4, 8, 12],
    pasture: { w: 5.4, h: 3.2, gate: 1.4 },
    footprint: [2.2, 2.6],
    levels: [
      { sprite: 'building4.chicken_coop_l1', w: 2.6, footprint: [2.2, 2.6], cost: 350, buildMinutes: 480, requires: { quest: 'q_room_to_grow' }, effect: 'Houses up to 4 chickens.' },
      { sprite: 'building4.chicken_coop_l2', w: 3.9, footprint: [3.4, 3.0], cost: 400, buildMinutes: 360, requires: { quest: 'q_egg_money' }, effect: 'Houses up to 8 chickens.' },
      { sprite: 'building4.chicken_coop_l3', w: 5.4, footprint: [4.6, 3.3], cost: 900, buildMinutes: 480, requires: { building: ['house', 2] }, effect: 'Houses up to 12 chickens.' },
    ],
  },
  barn: {
    id: 'barn',
    name: 'Barn',
    placeable: true,
    livestock: true,
    capacity: [3, 6, 10],
    pasture: { w: 6.0, h: 3.6, gate: 1.6 },
    footprint: [2.6, 2.6],
    levels: [
      { sprite: 'building4.barn_l1', w: 3.0, footprint: [2.6, 2.6], cost: 800, buildMinutes: 600, requires: { quest: 'q_egg_money' }, effect: 'Houses up to 3 cows or sheep.' },
      { sprite: 'building4.barn_l2', w: 4.0, footprint: [3.6, 3.2], cost: 700, buildMinutes: 480, requires: { quest: 'q_fresh_milk' }, effect: 'Houses up to 6 cows or sheep.' },
      { sprite: 'building4.barn_l3', w: 5.5, footprint: [4.8, 3.2], cost: 1500, buildMinutes: 600, requires: { quest: 'q_woolly' }, effect: 'Houses up to 10 cows or sheep.' },
    ],
  },
};

// Purely decorative placeables (instant, no levels).
export const DECORATIONS = {
  scarecrow: { id: 'scarecrow', name: 'Scarecrow', sprite: 'prop.scarecrow', w: 1.1, cost: 40, footprint: [0.4, 0.3] },
  bench: { id: 'bench', name: 'Garden Bench', sprite: 'prop.bench', w: 1.4, cost: 60, footprint: [1.2, 0.45] },
  flower_crate: { id: 'flower_crate', name: 'Flower Crate', sprite: 'prop.flower_crate', w: 1.0, cost: 30, footprint: [0.8, 0.45] },
  berry_crate: { id: 'berry_crate', name: 'Berry Planter', sprite: 'prop.berry_crate', w: 1.0, cost: 30, footprint: [0.8, 0.45] },
  hay_bales: { id: 'hay_bales', name: 'Hay Bales', sprite: 'prop.hay_bales', w: 1.6, cost: 25, footprint: [1.4, 0.5] },
  lantern_post: { id: 'lantern_post', name: 'Lantern Post', sprite: 'prop.lantern_post', w: 0.7, cost: 50, footprint: [0.3, 0.25], light: true },
  trough: { id: 'trough', name: 'Water Trough', sprite: 'prop.trough', w: 1.6, cost: 40, footprint: [1.4, 0.5] },
};

// Construction-stage sprites shown while a job is in progress (foundation,
// frame, roofing, almost complete). Stage 5 of the panel is a finished barn,
// so it is not used for other buildings.
export const CONSTRUCTION_STAGES = [
  'building4.construction_stage1', 'building4.construction_stage2',
  'building4.construction_stage3', 'building4.construction_stage4',
];

export const BAG_SLOTS_BY_HOUSE_LEVEL = [16, 24, 32];
export const CAN_CAPACITY_BY_SHED_LEVEL = [10, 25, 40];
export const SELL_MULTIPLIER_BY_MARKET_LEVEL = [1, 1.1, 1.25];
export const STORAGE_SLOTS_BY_LEVEL = [12, 24, 36];
