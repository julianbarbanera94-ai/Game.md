// Seasons run on the game clock, never on real-world dates. A year is four
// 28-day seasons. Each season has one festival that makes a seasonal quest
// available and gives a small trading bonus while it lasts.

export const DAYS_PER_SEASON = 28;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;

// days are 1-based days within the season (inclusive)
export const SEASONAL_EVENTS = [
  { id: 'spring_festival', name: 'Spring Festival', season: 0, from: 12, to: 14, blurb: 'The village is decorated with blossom. Plant something!', sellBonus: 0.1, tint: [255, 190, 220, 0.05] },
  { id: 'summer_fair', name: 'Summer Fair', season: 1, from: 15, to: 17, blurb: 'Stalls and games in the square. Bring your best produce.', sellBonus: 0.1, tint: [255, 230, 150, 0.05] },
  { id: 'autumn_harvest', name: 'Autumn Harvest Festival', season: 2, from: 12, to: 14, blurb: 'Pumpkins everywhere. Show off your harvest.', sellBonus: 0.1, tint: [255, 150, 60, 0.07] },
  { id: 'winter_market', name: 'Winter Market', season: 3, from: 10, to: 12, blurb: 'Lanterns and warm cider. The villagers want deliveries.', sellBonus: 0.1, tint: [190, 215, 255, 0.1] },
];

// Light colour grade per season (r, g, b, alpha) laid over the world.
export const SEASON_TINT = [null, [255, 230, 150, 0.03], [255, 150, 60, 0.05], [190, 215, 255, 0.09]];
