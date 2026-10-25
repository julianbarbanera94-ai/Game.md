import { tickGrowth } from './farming.js';
import { minutesUntilMorning } from './time.js';

// Advance the shared world clock. Everything time-based hangs off this.
export function advanceTime(state, minutes) {
  if (minutes <= 0) return;
  tickGrowth(state, minutes);
  state.time += minutes;
}

// Sleep until 6:00 AM. Crops keep growing overnight while their soil is moist.
export function sleep(state) {
  const minutes = minutesUntilMorning(state.time);
  advanceTime(state, minutes);
  return minutes;
}
