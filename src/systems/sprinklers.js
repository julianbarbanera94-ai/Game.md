import { PLOTS } from '../data/world.js';
import { CROPS, WATER_DURATION } from '../data/crops.js';
import { DECORATIONS } from '../data/buildings.js';
import { isPlotAvailable, isWet } from './farming.js';
import { NULL_BUS } from '../core/events.js';

// Sprinklers keep every planted, growing plot within range moist, as the
// clock runs (systems/simulation.js). A sprinkler's centre is a little above
// its anchor (the bottom of the sprite); range is in tiles each way.

export const sprinklers = (state) => state.placed.filter((p) => p.type === 'sprinkler');

export function covers(rec, def) {
  const range = DECORATIONS.sprinkler.range;
  const cx = rec.x, cy = rec.y - 0.15;
  return Math.abs(def.tx + 0.5 - cx) <= range && Math.abs(def.ty + 0.5 - cy) <= range;
}

// Plot ids a sprinkler at (x, y) would reach (for the placement preview too).
export function plotsInRange(state, x, y) {
  return PLOTS.filter((d) => covers({ x, y }, d) && isPlotAvailable(state, d.id)).map((d) => d.id);
}

export function sprinklerTick(state, bus = NULL_BUS) {
  const list = sprinklers(state);
  if (!list.length) return 0;
  let n = 0;
  for (const rec of list) {
    let mine = 0;
    for (const def of PLOTS) {
      if (!covers(rec, def) || !isPlotAvailable(state, def.id)) continue;
      const plot = state.plots[def.id];
      if (!plot.tilled || !plot.crop || plot.growth >= CROPS[plot.crop].growMinutes || isWet(state, plot)) continue;
      plot.moistUntil = state.time + WATER_DURATION;
      mine++;
    }
    if (mine) bus.emit('sprinklerWatered', { uid: rec.uid, count: mine });
    n += mine;
  }
  return n;
}
