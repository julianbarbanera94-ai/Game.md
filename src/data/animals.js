// Livestock species (Phase 5). Sprites are keyed `animal.<species>_d0..d4`
// (facing the camera) and `_u0..u3` (facing away); see render/animals.js.
//
// cycleMinutes   game minutes of *fed* time needed for one product
// fedMinutes     how long one feeding lasts
// maxStock       finished products an animal holds before it stops producing
export const SPECIES = {
  chicken: {
    id: 'chicken', name: 'Chicken', home: 'chicken_coop', cost: 60,
    product: 'egg', productName: 'egg', productPlural: 'eggs', feed: 'chicken_feed', cycleMinutes: 360, fedMinutes: 1440, maxStock: 3,
    drawHeight: 40, speed: 26, names: ['Henrietta', 'Clucky', 'Goldie', 'Pepper', 'Daisy', 'Nugget', 'Biscuit', 'Peaches', 'Maple', 'Wren', 'Pebble', 'Sunny'],
    side: { right: 'd2', left: 'd2' },
  },
  cow: {
    id: 'cow', name: 'Cow', home: 'barn', cost: 400,
    product: 'milk', productName: 'milk', productPlural: 'milk', feed: 'hay', cycleMinutes: 600, fedMinutes: 1440, maxStock: 3,
    drawHeight: 78, speed: 16, names: ['Bella', 'Clover', 'Mabel', 'Buttercup', 'Rosie', 'Hazel', 'Ginger', 'Poppy'],
    side: { right: 'd2', left: 'd0' },
  },
  sheep: {
    id: 'sheep', name: 'Sheep', home: 'barn', cost: 250,
    product: 'wool', productName: 'wool', productPlural: 'wool', feed: 'hay', cycleMinutes: 840, fedMinutes: 1440, maxStock: 3,
    drawHeight: 58, speed: 18, names: ['Woolly', 'Cloud', 'Fleece', 'Cotton', 'Biscuit', 'Marshmallow', 'Dumpling', 'Snowy'],
    side: { right: 'd2', left: 'd3' },
  },
};

// "1 egg", "3 eggs", "2 milk"
export function productLabel(speciesId, qty) {
  const sp = SPECIES[speciesId];
  return `${qty} ${qty === 1 ? sp.productName : sp.productPlural}`;
}

export const SELL_BACK_RATIO = 0.5; // selling an animal returns half its price
export const PET_COOLDOWN_MINUTES = 240;
export const PET_HAPPINESS = 15;
export const NEW_ANIMAL_FED_MINUTES = 240; // newly bought animals arrive fed for a while
export const HAPPY_THRESHOLD = 60; // happy animals produce 25% faster
export const HAPPY_SPEEDUP = 1.25;
// Per game minute: happiness rises while fed and falls while hungry.
export const HAPPY_GAIN_PER_MIN = 0.05;
export const HAPPY_LOSS_PER_MIN = 0.08;
