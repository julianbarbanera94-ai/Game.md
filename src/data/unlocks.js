// The progression tree: what the player can unlock, grouped by track, and what
// it takes. `requires` uses the same shape as shop and building requirements
// (systems/economy.js isRequirementMet), plus { flag } and { level }.

export const TRACKS = ['Farming', 'Livestock', 'Buildings', 'Exploration', 'Community'];

export const UNLOCKS = [
  { id: 'crop_carrot', track: 'Farming', name: 'Carrots and lettuce', requires: null },
  { id: 'crop_potato', track: 'Farming', name: 'Potatoes and tomatoes', requires: { quest: 'q_market_day' } },
  { id: 'crop_berry', track: 'Farming', name: 'Strawberries and pumpkins', requires: { unlock: 'gardenExpansion' } },
  { id: 'land_south', track: 'Farming', name: 'South garden bed (+8 plots)', requires: { unlock: 'gardenExpansion' } },
  { id: 'land_north', track: 'Farming', name: 'North field (+8 plots)', requires: { unlock: 'northField' } },
  { id: 'can_upgrade', track: 'Farming', name: 'Bigger watering can (workshop level 2)', requires: { building: ['tool_shed', 2] } },
  { id: 'auto_water', track: 'Farming', name: 'Automatic watering (well level 2)', requires: { building: ['well', 2] } },
  { id: 'sprinklers', track: 'Farming', name: 'Sprinklers (farm level 2)', requires: { level: 2 } },
  { id: 'chickens', track: 'Livestock', name: 'Chickens and eggs (chicken coop)', requires: { placed: 'chicken_coop' } },
  { id: 'cattle', track: 'Livestock', name: 'Cows, sheep, milk and wool (barn)', requires: { placed: 'barn' } },
  { id: 'storage', track: 'Buildings', name: 'Storage shed', requires: { placed: 'storage_shed' } },
  { id: 'bag24', track: 'Buildings', name: 'Bigger bag (cottage level 2)', requires: { building: ['house', 2] } },
  { id: 'market2', track: 'Buildings', name: 'Better market prices (stall level 2)', requires: { building: ['market_stall', 2] } },
  { id: 'cottage3', track: 'Buildings', name: 'Cottage level 3', requires: { building: ['house', 3] } },
  { id: 'road', track: 'Exploration', name: 'The road east', requires: { flag: 'roadOpen' } },
  { id: 'village', track: 'Exploration', name: 'Willowmere village', requires: { flag: 'visitedVillage' } },
  { id: 'shops', track: 'Community', name: 'General Store and trader', requires: { flag: 'visitedVillage' } },
  { id: 'friend', track: 'Community', name: 'A friend in the village', requires: { quest: 'q_good_neighbour' } },
  { id: 'level3', track: 'Community', name: 'Farm level 3', requires: { level: 3 } },
  { id: 'level5', track: 'Community', name: 'Farm level 5', requires: { level: 5 } },
  { id: 'garage', track: 'Buildings', name: 'Garage (farm level 3)', requires: { placed: 'garage' } },
  { id: 'machinery', track: 'Farming', name: 'Tractor and machinery', requires: { vehicle: true } },
];
