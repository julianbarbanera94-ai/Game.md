// Data-driven quest definitions. Objectives advance only from real gameplay
// events emitted on the event bus (see systems/quests.js).
export const QUESTS = [
  {
    id: 'q_breaking_ground',
    title: 'Breaking Ground',
    giver: 'Mailbox letter',
    description: 'Prepare the garden: till the soil, plant carrot seeds and water them.',
    prereqs: [],
    objectives: [
      { type: 'till', count: 3, label: 'Till soil' },
      { type: 'plant', count: 3, label: 'Plant seeds' },
      { type: 'water', count: 3, label: 'Water the crops' },
    ],
    reward: { coins: 15 },
  },
  {
    id: 'q_first_harvest',
    title: 'First Harvest',
    giver: 'Mailbox letter',
    description: 'Crops grow while their soil is moist. Harvest your first crops.',
    prereqs: ['q_breaking_ground'],
    objectives: [{ type: 'harvest', count: 3, label: 'Harvest crops' }],
    reward: { items: { seed_lettuce: 3 } },
  },
  {
    id: 'q_market_day',
    title: 'Market Day',
    giver: 'Market stall',
    description: 'Take your produce to the market stall east of the house and sell it.',
    prereqs: ['q_first_harvest'],
    objectives: [{ type: 'sell', count: 3, label: 'Sell produce at market' }],
    reward: { coins: 25 },
  },
  {
    id: 'q_restock',
    title: 'Restock',
    giver: 'Market stall',
    description: 'Use your earnings to buy more seeds.',
    prereqs: ['q_market_day'],
    objectives: [{ type: 'buy', category: 'seed', count: 5, label: 'Buy seeds' }],
    reward: { coins: 10 },
  },
  {
    id: 'q_room_to_grow',
    title: 'Room to Grow',
    giver: 'Garden sign',
    description: 'Clear the overgrown south garden bed to expand your farm.',
    prereqs: ['q_market_day'],
    objectives: [{ type: 'unlock', id: 'gardenExpansion', count: 1, label: 'Expand the garden' }],
    reward: { items: { seed_pumpkin: 2 } },
  },
  {
    id: 'q_steady_supply',
    title: 'Steady Supply',
    giver: 'Market stall',
    description: 'Become a regular at the market.',
    prereqs: ['q_room_to_grow'],
    objectives: [{ type: 'sell', count: 25, label: 'Sell produce' }],
    reward: { coins: 100 },
  },
];

QUESTS.push(
  {
    id: 'q_storage',
    title: 'Storage Solutions',
    giver: 'Workbench',
    description: 'Use the building planner at the workbench to place a storage shed, then let the builders finish it.',
    prereqs: ['q_restock'],
    objectives: [{ type: 'constructed', id: 'storage_shed', count: 1, label: 'Build a storage shed' }],
    reward: { coins: 40 },
  },
  {
    id: 'q_home_improvements',
    title: 'Home Improvements',
    giver: 'Workbench',
    description: 'Upgrade one of your farm buildings — the cottage, well, workshop or market stall.',
    prereqs: ['q_room_to_grow'],
    objectives: [{ type: 'constructionStarted', count: 1, label: 'Start a building upgrade' }],
    reward: { coins: 60 },
  },
);

QUESTS.push(
  {
    id: 'q_coop',
    title: 'A Home for Hens',
    giver: 'Workbench',
    description: 'Use the building planner to place a chicken coop and let the builders finish it.',
    prereqs: ['q_room_to_grow'],
    objectives: [{ type: 'constructed', id: 'chicken_coop', count: 1, label: 'Build a chicken coop' }],
    reward: { coins: 50 },
  },
  {
    id: 'q_first_hens',
    title: 'First Hens',
    giver: 'Chicken coop',
    description: 'Open the coop, buy two chickens and feed them. Chicken feed is sold at the market.',
    prereqs: ['q_coop'],
    objectives: [
      { type: 'buyAnimal', species: 'chicken', count: 2, label: 'Buy chickens' },
      { type: 'feed', count: 2, label: 'Feed your animals' },
    ],
    reward: { items: { chicken_feed: 6 } },
  },
  {
    id: 'q_egg_money',
    title: 'Egg Money',
    giver: 'Chicken coop',
    description: 'Fed hens lay eggs over time. Collect them from the hens (or the coop menu) and sell them at the market.',
    prereqs: ['q_first_hens'],
    objectives: [
      { type: 'collect', item: 'egg', count: 4, label: 'Collect eggs' },
      { type: 'sell', category: 'animal', count: 4, label: 'Sell animal products' },
    ],
    reward: { coins: 60 },
  },
  {
    id: 'q_barn',
    title: 'Room for Cattle',
    giver: 'Workbench',
    description: 'Cows and sheep live in a barn. Place one with the building planner.',
    prereqs: ['q_egg_money'],
    objectives: [{ type: 'constructed', id: 'barn', count: 1, label: 'Build a barn' }],
    reward: { coins: 100 },
  },
  {
    id: 'q_fresh_milk',
    title: 'Fresh Milk',
    giver: 'Barn',
    description: 'Buy a cow, keep it fed with hay and collect its milk.',
    prereqs: ['q_barn'],
    objectives: [
      { type: 'buyAnimal', species: 'cow', count: 1, label: 'Buy a cow' },
      { type: 'collect', item: 'milk', count: 2, label: 'Collect milk' },
    ],
    reward: { coins: 120 },
  },
  {
    id: 'q_woolly',
    title: 'Something Woolly',
    giver: 'Barn',
    description: 'A sheep needs hay too. Collect some wool.',
    prereqs: ['q_fresh_milk'],
    objectives: [
      { type: 'buyAnimal', species: 'sheep', count: 1, label: 'Buy a sheep' },
      { type: 'collect', item: 'wool', count: 2, label: 'Collect wool' },
    ],
    reward: { coins: 150 },
  },
);

export const QUESTS_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
