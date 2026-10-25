import { CROPS } from './crops.js';

// Single item model shared by inventory, shop, quests and save data.
// category: seed | crop | tool
export const ITEMS = {};

for (const crop of Object.values(CROPS)) {
  ITEMS[`seed_${crop.id}`] = {
    id: `seed_${crop.id}`,
    name: `${crop.name} Seeds`,
    category: 'seed',
    crop: crop.id,
    buyPrice: crop.seedPrice,
    sellPrice: null,
    maxStack: 99,
    icon: `icon.seed_${crop.id}`,
  };
  ITEMS[crop.id] = {
    id: crop.id,
    name: crop.name,
    category: 'crop',
    buyPrice: null,
    sellPrice: crop.sellPrice,
    maxStack: 99,
    icon: `icon.produce_${crop.id}`,
  };
}

export const INVENTORY_SLOTS = 16;

export function getItem(id) {
  return ITEMS[id] || null;
}
