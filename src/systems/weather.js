import { PLOTS } from '../data/world.js';
import { CROPS, WATER_DURATION } from '../data/crops.js';
import { calendar } from './seasons.js';
import { isPlotAvailable, isWet } from './farming.js';
import { NULL_BUS } from '../core/events.js';

// Weather is derived from the day number (no saved state): the same day is
// always rainy or dry, on every device and after every reload. Rain waters
// every planted plot, so a rainy day is a day off from the watering can.

// chance of a rainy day per season (spring, summer, autumn, winter)
export const RAIN_CHANCE = [0.25, 0.12, 0.3, 0];
const DRY_START_DAYS = 2; // the tutorial days are always dry

// mulberry32 step: a well-mixed number in [0, 1) for each day
function hash01(n) {
  let x = (n * 0x6d2b79f5 + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

export function weatherOn(time) {
  const c = calendar(time);
  if (c.day <= DRY_START_DAYS) return 'clear';
  return hash01(c.day) < RAIN_CHANCE[c.seasonIndex] ? 'rain' : 'clear';
}

export const isRaining = (time) => weatherOn(time) === 'rain';

// Winter has no rain; some winter days have light snow (only a look, crops are unaffected).
export function isSnowing(time) {
  const c = calendar(time);
  return c.seasonIndex === 3 && hash01(c.day + 7919) < 0.4;
}

// Water every planted, growing plot that is dry. Called as the clock runs.
export function rainTick(state, bus = NULL_BUS) {
  if (!isRaining(state.time)) return 0;
  let n = 0;
  for (const def of PLOTS) {
    if (!isPlotAvailable(state, def.id)) continue;
    const plot = state.plots[def.id];
    if (!plot.tilled || !plot.crop || plot.growth >= CROPS[plot.crop].growMinutes || isWet(state, plot)) continue;
    plot.moistUntil = state.time + WATER_DURATION;
    n++;
  }
  if (n) bus.emit('rainWatered', { count: n });
  return n;
}
