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

// Phase 7: the village.
QUESTS.push(
  {
    id: 'q_open_road',
    title: 'The Road East',
    giver: 'Fallen tree',
    description: 'A storm-felled tree blocks the road to Willowmere village. Hire it cleared (150 coins) — walk up to it at the east end of the road.',
    prereqs: ['q_market_day'],
    objectives: [{ type: 'roadOpened', count: 1, label: 'Clear the fallen tree on the east road' }],
    reward: { coins: 40 },
  },
  {
    id: 'q_visit_village',
    title: 'Willowmere',
    giver: 'Village sign',
    description: 'The road is open. Walk east and visit the village square.',
    prereqs: ['q_open_road'],
    objectives: [{ type: 'visit', id: 'village', count: 1, label: 'Walk to the village square' }],
    reward: { coins: 30 },
  },
  {
    id: 'q_meet_mara',
    title: 'Meet the Shopkeeper',
    giver: 'Mara',
    description: 'Mara runs the General Store, north-west of the square. Say hello.',
    prereqs: ['q_visit_village'],
    objectives: [{ type: 'talk', id: 'mara', count: 1, label: 'Talk to Mara' }],
    reward: { items: { seed_lettuce: 4 } },
  },
  {
    id: 'q_first_delivery',
    title: 'Special Delivery',
    giver: 'Notice board',
    description: 'Read the notice board in the square, accept a request, bring the goods to the villager who asked, and talk to them to hand them over.',
    prereqs: ['q_meet_mara'],
    objectives: [{ type: 'deliver', count: 1, label: 'Deliver a request' }],
    reward: { coins: 60 },
  },
  {
    id: 'q_good_neighbour',
    title: 'Good Neighbour',
    giver: 'Willowmere',
    description: 'Chat with villagers and help them out until one of them counts you as a friend.',
    prereqs: ['q_first_delivery'],
    objectives: [{ type: 'friendshipLevel', minLevel: 2, count: 1, label: 'Become friends with a villager' }],
    reward: { coins: 150 },
  },
);

// Phase 8: kinds, optional side quests, a repeatable quest and seasonal quests.
// optional: offered in the journal and started by the player (can be abandoned).
// repeatDays: after claiming, offered again that many days later.
// event: only available while that seasonal event (data/seasons.js) is on.
QUESTS.push(
  {
    id: 'sq_green_thumb',
    title: 'Green Thumb',
    giver: 'Garden sign',
    description: 'Practice makes perfect: harvest 15 crops.',
    prereqs: ['q_first_harvest'],
    optional: true,
    objectives: [{ type: 'harvest', count: 15, label: 'Harvest crops' }],
    reward: { coins: 45 },
  },
  {
    id: 'sq_carrot_king',
    title: 'Carrot King',
    giver: 'Garden sign',
    description: 'Show the valley what a carrot can be. Harvest 12 carrots.',
    prereqs: ['q_first_harvest'],
    optional: true,
    objectives: [{ type: 'harvest', crop: 'carrot', count: 12, label: 'Harvest carrots' }],
    reward: { items: { seed_pumpkin: 2 } },
  },
  {
    id: 'sq_market_regular',
    title: 'Market Regular',
    giver: 'Market stall',
    description: 'Keep the stalls stocked. Sell 15 pieces of produce. Offered again every few days.',
    prereqs: ['q_market_day'],
    repeatDays: 3,
    objectives: [{ type: 'sell', count: 15, label: 'Sell produce' }],
    reward: { coins: 60 },
  },
  {
    id: 'sq_busy_builder',
    title: 'Busy Builder',
    giver: 'Workbench',
    description: 'A growing farm never stops building. Finish or upgrade three buildings.',
    prereqs: ['q_storage'],
    optional: true,
    objectives: [{ type: 'constructed', count: 3, label: 'Finish buildings' }],
    reward: { coins: 100 },
  },
  {
    id: 'sq_meet_villagers',
    title: 'Meet the Neighbours',
    giver: 'Willowmere',
    description: 'Say hello to Bram, Odette and Wren as well.',
    prereqs: ['q_meet_mara'],
    optional: true,
    objectives: [
      { type: 'talk', id: 'bram', count: 1, label: 'Talk to Bram' },
      { type: 'talk', id: 'odette', count: 1, label: 'Talk to Odette' },
      { type: 'talk', id: 'wren', count: 1, label: 'Talk to Wren' },
    ],
    reward: { coins: 50 },
  },
  {
    id: 'sq_couriers_pride',
    title: "Courier's Pride",
    giver: 'Notice board',
    description: 'Complete three delivery requests from the notice board.',
    prereqs: ['q_first_delivery'],
    optional: true,
    objectives: [{ type: 'deliver', count: 3, label: 'Deliver requests' }],
    reward: { coins: 90 },
  },
  {
    id: 'qe_spring_festival',
    title: 'Spring Festival: Fresh Starts',
    giver: 'Spring Festival',
    description: 'The village is celebrating. Plant 15 seeds while the festival lasts.',
    prereqs: [],
    event: 'spring_festival',
    objectives: [{ type: 'plant', count: 15, label: 'Plant seeds' }],
    reward: { coins: 100 },
  },
  {
    id: 'qe_summer_fair',
    title: 'Summer Fair: Best of the Farm',
    giver: 'Summer Fair',
    description: 'Sell 20 pieces of produce at the fair.',
    prereqs: [],
    event: 'summer_fair',
    objectives: [{ type: 'sell', count: 20, label: 'Sell produce' }],
    reward: { coins: 120 },
  },
  {
    id: 'qe_autumn_harvest',
    title: 'Harvest Festival: Full Baskets',
    giver: 'Harvest Festival',
    description: 'Harvest 25 crops for the festival feast.',
    prereqs: [],
    event: 'autumn_harvest',
    objectives: [{ type: 'harvest', count: 25, label: 'Harvest crops' }],
    reward: { coins: 150 },
  },
  {
    id: 'qe_winter_market',
    title: 'Winter Market: Warm Deliveries',
    giver: 'Winter Market',
    description: 'The villagers need supplies. Complete two delivery requests.',
    prereqs: [],
    event: 'winter_market',
    objectives: [{ type: 'deliver', count: 2, label: 'Deliver requests' }],
    reward: { coins: 120 },
  },
);

// Story and category labels for the journal, and experience for claiming.
const KIND = {
  main: ['q_breaking_ground', 'q_first_harvest', 'q_market_day', 'q_room_to_grow', 'q_open_road', 'q_visit_village'],
  farming: ['q_restock', 'q_steady_supply', 'sq_green_thumb', 'sq_carrot_king', 'sq_market_regular'],
  building: ['q_storage', 'q_home_improvements', 'q_coop', 'q_barn', 'sq_busy_builder'],
  livestock: ['q_first_hens', 'q_egg_money', 'q_fresh_milk', 'q_woolly'],
  relationship: ['q_meet_mara', 'q_good_neighbour', 'sq_meet_villagers'],
  delivery: ['q_first_delivery', 'sq_couriers_pride'],
  seasonal: ['qe_spring_festival', 'qe_summer_fair', 'qe_autumn_harvest', 'qe_winter_market'],
};
export const QUEST_KINDS = {
  main: 'Main story', farming: 'Farming', building: 'Building', livestock: 'Livestock',
  relationship: 'Neighbours', delivery: 'Delivery', exploration: 'Exploration', seasonal: 'Seasonal',
};
for (const q of QUESTS) {
  q.kind = Object.entries(KIND).find(([, ids]) => ids.includes(q.id))?.[0] || 'main';
  q.optional = !!q.optional;
  q.xp = q.xp ?? (q.kind === 'main' ? 30 : q.kind === 'seasonal' ? 40 : 20);
}
// the walk to the village is exploration, not just story
QUESTS.find((q) => q.id === 'q_visit_village').kind = 'exploration';

export const QUESTS_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
