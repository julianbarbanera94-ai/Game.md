// Milestones. Progress comes from state.counters (event totals), state.stats,
// friendships and flags; each can be claimed once for coins and XP.
// counter: a key of state.counters, or one of the computed sources below.

export const ACHIEVEMENTS = [
  { id: 'first_harvest', track: 'Farming', name: 'First Fruits', text: 'Harvest your first crop.', counter: 'harvest', target: 1, reward: { coins: 10, xp: 10 } },
  { id: 'green_thumb', track: 'Farming', name: 'Green Thumb', text: 'Harvest 50 crops.', counter: 'harvest', target: 50, reward: { coins: 60, xp: 40 } },
  { id: 'bountiful', track: 'Farming', name: 'Bountiful', text: 'Harvest 250 crops.', counter: 'harvest', target: 250, reward: { coins: 250, xp: 120 } },
  { id: 'busy_bee', track: 'Farming', name: 'Busy Bee', text: 'Water 100 times.', counter: 'water', target: 100, reward: { coins: 50, xp: 30 } },
  { id: 'merchant', track: 'Community', name: 'Merchant', text: 'Earn 1,000 coins in total.', counter: 'earned', target: 1000, reward: { coins: 100, xp: 50 } },
  { id: 'tycoon', track: 'Community', name: 'Tycoon', text: 'Earn 10,000 coins in total.', counter: 'earned', target: 10000, reward: { coins: 500, xp: 200 } },
  { id: 'animal_lover', track: 'Livestock', name: 'Animal Lover', text: 'Buy 5 animals.', counter: 'buyAnimal', target: 5, reward: { coins: 80, xp: 40 } },
  { id: 'egg_collector', track: 'Livestock', name: 'Farm Fresh', text: 'Collect 25 animal products.', counter: 'collect', target: 25, reward: { coins: 90, xp: 50 } },
  { id: 'builder', track: 'Buildings', name: 'Master Builder', text: 'Finish or upgrade 5 buildings.', counter: 'constructed', target: 5, reward: { coins: 150, xp: 80 } },
  { id: 'explorer', track: 'Exploration', name: 'Explorer', text: 'Visit Willowmere village.', counter: 'visit', target: 1, reward: { coins: 40, xp: 30 } },
  { id: 'chatterbox', track: 'Community', name: 'Chatterbox', text: 'Talk to villagers 10 times.', counter: 'talk', target: 10, reward: { coins: 40, xp: 30 } },
  { id: 'courier', track: 'Community', name: 'Reliable Courier', text: 'Complete 5 delivery requests.', counter: 'deliver', target: 5, reward: { coins: 120, xp: 70 } },
  { id: 'well_known', track: 'Community', name: 'Well Known', text: 'Reach 100 village reputation.', counter: 'reputation', target: 100, reward: { coins: 200, xp: 100 } },
  { id: 'quest_keeper', track: 'Farming', name: 'Quest Keeper', text: 'Claim 10 quest rewards.', counter: 'questsClaimed', target: 10, reward: { coins: 100, xp: 60 } },
];
export const ACHIEVEMENTS_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// Farm level from experience. Index = level - 1; value = total XP needed.
export const LEVEL_XP = [0, 40, 110, 210, 350, 540, 790, 1100, 1500, 2000];
export const LEVEL_UP_COINS = 25; // per level reached
