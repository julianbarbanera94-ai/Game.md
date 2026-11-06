import { CROPS, GROWTH_STAGES, WATER_DURATION } from '../data/crops.js';
import { getItem } from '../data/items.js';
import { PLOTS_BY_ID, PLOT_GROUPS } from '../data/world.js';
import { UPGRADES } from '../data/progression.js';
import { NULL_BUS } from '../core/events.js';
import * as Inv from './inventory.js';
import { bagSlots, hasSprinklerCan } from './buildings.js';

// Plot lifecycle: untilled -> tilled -> planted/growing (needs moisture) ->
// ready -> harvested (back to tilled). All state lives in state.plots.

export function createPlot() {
  return { tilled: false, crop: null, growth: 0, moistUntil: 0, variant: 0 };
}

export function isPlotAvailable(state, plotId) {
  const def = PLOTS_BY_ID[plotId];
  if (!def) return false;
  const unlock = PLOT_GROUPS[def.group].unlock;
  return !unlock || !!state.unlocks[unlock];
}

export function isWet(state, plot) {
  return plot.moistUntil > state.time;
}

export function isReady(plot) {
  return !!plot.crop && plot.growth >= CROPS[plot.crop].growMinutes;
}

// Visual stage for rendering: 'untilled' | 'tilled' | GROWTH_STAGES[i] | 'ready'
export function plotStage(plot) {
  if (!plot.tilled) return 'untilled';
  if (!plot.crop) return 'tilled';
  if (isReady(plot)) return 'ready';
  const frac = plot.growth / CROPS[plot.crop].growMinutes;
  return GROWTH_STAGES[Math.min(GROWTH_STAGES.length - 1, Math.floor(frac * GROWTH_STAGES.length))];
}

export function growthPercent(plot) {
  if (!plot.crop) return 0;
  return Math.min(100, Math.floor((plot.growth / CROPS[plot.crop].growMinutes) * 100));
}

// Pick which seed to plant: the selected one if owned, else any owned seed.
export function seedToPlant(state) {
  if (state.selectedSeed && Inv.count(state.inventory, state.selectedSeed) > 0) return state.selectedSeed;
  return Object.keys(state.inventory).find((id) => getItem(id)?.category === 'seed' && state.inventory[id] > 0) || null;
}

// Describe the contextual action for a plot without changing anything.
export function getPlotAction(state, plotId) {
  if (!isPlotAvailable(state, plotId)) {
    const up = UPGRADES[PLOT_GROUPS[PLOTS_BY_ID[plotId].group].unlock];
    return { action: 'locked', label: `Overgrown — ${up.name.toLowerCase()} (${up.cost} coins)`, ok: false, unlock: up.id };
  }
  const plot = state.plots[plotId];
  if (!plot.tilled) return { action: 'till', label: 'Till soil', ok: true, tool: 'hoe' };
  if (!plot.crop) {
    const seed = seedToPlant(state);
    if (!seed) return { action: 'plant', label: 'No seeds — buy some at the market', ok: false, tool: 'seed' };
    return { action: 'plant', label: `Plant ${getItem(seed).name}`, ok: true, seed, tool: 'seed' };
  }
  if (isReady(plot)) return { action: 'harvest', label: `Harvest ${CROPS[plot.crop].name}`, ok: true, tool: 'hand' };
  if (!isWet(state, plot)) {
    if (state.can.water <= 0) return { action: 'water', label: 'Watering can empty — refill at the well', ok: false, tool: 'can' };
    return { action: 'water', label: `Water ${CROPS[plot.crop].name} (${state.can.water}/${state.can.capacity})`, ok: true, tool: 'can' };
  }
  return { action: 'none', label: `${CROPS[plot.crop].name} growing — ${growthPercent(plot)}%`, ok: false };
}

export function till(state, plotId, bus = NULL_BUS) {
  const a = getPlotAction(state, plotId);
  if (a.action !== 'till') return { ok: false, reason: a.label };
  state.plots[plotId].tilled = true;
  bus.emit('till', { plotId });
  return { ok: true };
}

export function plant(state, plotId, bus = NULL_BUS) {
  const a = getPlotAction(state, plotId);
  if (a.action !== 'plant' || !a.ok) return { ok: false, reason: a.label };
  const seed = getItem(a.seed);
  const removed = Inv.remove(state.inventory, seed.id, 1);
  if (!removed.ok) return removed;
  const plot = state.plots[plotId];
  plot.crop = seed.crop;
  plot.growth = 0;
  plot.variant = Math.floor(Math.random() * 2);
  bus.emit('plant', { plotId, crop: seed.crop });
  return { ok: true, crop: seed.crop };
}

export function water(state, plotId, bus = NULL_BUS) {
  const a = getPlotAction(state, plotId);
  if (a.action !== 'water' || !a.ok) return { ok: false, reason: a.label };
  state.can.water -= 1;
  const watered = [plotId];
  if (hasSprinklerCan(state)) {
    // Level-3 workshop can: also waters dry, planted neighbours in the same row.
    const def = PLOTS_BY_ID[plotId];
    for (const dx of [-1, 1]) {
      const n = Object.values(PLOTS_BY_ID).find((p) => p.ty === def.ty && p.tx === def.tx + dx);
      const np = n && state.plots[n.id];
      if (np && isPlotAvailable(state, n.id) && np.crop && !isReady(np) && !isWet(state, np)) watered.push(n.id);
    }
  }
  for (const id of watered) {
    state.plots[id].moistUntil = state.time + WATER_DURATION;
    bus.emit('water', { plotId: id, crop: state.plots[id].crop });
  }
  return { ok: true, watered };
}

export function harvest(state, plotId, bus = NULL_BUS) {
  const a = getPlotAction(state, plotId);
  if (a.action !== 'harvest') return { ok: false, reason: a.label };
  const plot = state.plots[plotId];
  const crop = CROPS[plot.crop];
  const added = Inv.add(state.inventory, crop.id, crop.yield, bagSlots(state));
  if (!added.ok) return { ok: false, reason: added.reason === 'No free space' ? 'Your bag is full' : added.reason }; // crop stays in the ground
  plot.crop = null;
  plot.growth = 0;
  bus.emit('harvest', { plotId, crop: crop.id, qty: crop.yield });
  return { ok: true, crop: crop.id, qty: crop.yield };
}

// Perform whichever action the plot currently offers.
export function interactPlot(state, plotId, bus = NULL_BUS) {
  const a = getPlotAction(state, plotId);
  if (!a.ok) return { ok: false, reason: a.label, action: a.action };
  const fn = { till, plant, water, harvest }[a.action];
  return { ...fn(state, plotId, bus), action: a.action };
}

// Advance crop growth from state.time by `minutes`. Crops only grow while
// their soil is moist, so growth = overlap of [now, now+minutes] with moisture.
export function tickGrowth(state, minutes) {
  const t0 = state.time;
  for (const plot of Object.values(state.plots)) {
    if (!plot.crop || isReady(plot)) continue;
    const wet = Math.max(0, Math.min(minutes, plot.moistUntil - t0));
    if (wet > 0) plot.growth = Math.min(CROPS[plot.crop].growMinutes, plot.growth + wet);
  }
}

export function refillCan(state, bus = NULL_BUS) {
  if (state.can.water >= state.can.capacity) return { ok: false, reason: 'Watering can is already full' };
  state.can.water = state.can.capacity;
  bus.emit('refill', {});
  return { ok: true };
}
