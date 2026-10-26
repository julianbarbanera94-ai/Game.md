import { tickGrowth } from './farming.js';
import { minutesUntilMorning } from './time.js';
import { morning, tickConstruction } from './buildings.js';
import { tickAnimals } from './animals.js';
import { NULL_BUS } from '../core/events.js';

// Advance the shared world clock. Everything time-based hangs off this.
// The advance is split at each 6:00 AM so morning events (auto-watering)
// happen at the right moment, even when sleeping skips the whole night.
export function advanceTime(state, minutes, bus = NULL_BUS) {
  while (minutes > 0) {
    const toMorning = minutesUntilMorning(state.time);
    const step = Math.min(minutes, toMorning);
    tickGrowth(state, step);
    tickAnimals(state, step);
    state.time += step;
    minutes -= step;
    tickConstruction(state, bus);
    if (step === toMorning) morning(state, bus);
  }
}

// Sleep until 6:00 AM. Crops keep growing overnight while their soil is moist.
export function sleep(state, bus = NULL_BUS) {
  const minutes = minutesUntilMorning(state.time);
  advanceTime(state, minutes, bus);
  return minutes;
}
