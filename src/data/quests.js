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

export const QUESTS_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
