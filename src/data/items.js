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

// Animal products and feed (Phase 5).
Object.assign(ITEMS, {
  egg: { id: 'egg', name: 'Egg', category: 'animal', buyPrice: null, sellPrice: 12, maxStack: 99, icon: 'icon.product_egg' },
  milk: { id: 'milk', name: 'Milk', category: 'animal', buyPrice: null, sellPrice: 34, maxStack: 99, icon: 'icon.product_milk' },
  wool: { id: 'wool', name: 'Wool', category: 'animal', buyPrice: null, sellPrice: 48, maxStack: 99, icon: 'icon.product_wool' },
  chicken_feed: { id: 'chicken_feed', name: 'Chicken Feed', category: 'feed', buyPrice: 4, sellPrice: null, maxStack: 99, icon: 'icon.feed_chicken' },
  hay: { id: 'hay', name: 'Hay', category: 'feed', buyPrice: 6, sellPrice: null, maxStack: 99, icon: 'icon.feed_hay' },
});

export const INVENTORY_SLOTS = 16;

export function getItem(id) {
  return ITEMS[id] || null;
}
