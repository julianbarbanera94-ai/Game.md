import { DAYS_PER_SEASON, DAYS_PER_YEAR, SEASONS, SEASONAL_EVENTS } from '../data/seasons.js';
import { clock } from './time.js';

// Calendar derived from the shared game clock.
export function calendar(time) {
  const { day } = clock(time);
  const zero = day - 1;
  const year = Math.floor(zero / DAYS_PER_YEAR) + 1;
  const inYear = zero % DAYS_PER_YEAR;
  const seasonIndex = Math.floor(inYear / DAYS_PER_SEASON);
  return { day, year, seasonIndex, season: SEASONS[seasonIndex], dayOfSeason: (inYear % DAYS_PER_SEASON) + 1 };
}

export function activeEvent(time) {
  const c = calendar(time);
  return SEASONAL_EVENTS.find((e) => e.season === c.seasonIndex && c.dayOfSeason >= e.from && c.dayOfSeason <= e.to) || null;
}

// Days until the next event starts (0 if one is on), for the journal.
export function nextEvent(time) {
  const c = calendar(time);
  const now = activeEvent(time);
  if (now) return { event: now, inDays: 0 };
  let best = null;
  for (let ahead = 1; ahead <= DAYS_PER_YEAR; ahead++) {
    const t = time + ahead * 1440;
    const ev = activeEvent(t);
    if (ev) {
      best = { event: ev, inDays: ahead };
      break;
    }
  }
  return best || { event: null, inDays: 0, year: c.year };
}

// Extra pay at the village trader while a festival is on.
export const eventSellBonus = (time) => activeEvent(time)?.sellBonus || 0;
