// Shop stock, purchasable upgrades and land. Requirements are data so the UI
// can explain why something is locked.
//
// requires: { quest: id } -> quest must be claimed
//           { unlock: id } -> unlock flag must be set

export const SHOP_STOCK = [
  { item: 'seed_carrot', requires: null },
  { item: 'seed_lettuce', requires: null },
  { item: 'seed_potato', requires: { quest: 'q_market_day' } },
  { item: 'seed_tomato', requires: { quest: 'q_market_day' } },
  { item: 'seed_strawberry', requires: { unlock: 'gardenExpansion' } },
  { item: 'seed_pumpkin', requires: { unlock: 'gardenExpansion' } },
];

export const UPGRADES = {
  gardenExpansion: {
    id: 'gardenExpansion',
    name: 'South Garden Bed',
    description: 'Clear the overgrown south bed: +8 crop plots and new seed varieties at the market.',
    cost: 250,
    requires: { quest: 'q_market_day' },
    kind: 'land',
  },
};

export const STARTING_STATE = {
  coins: 60,
  inventory: { seed_carrot: 6 },
  canCapacity: 10,
};
