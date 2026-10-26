import { DAY_START_MINUTE, SAVE_VERSION, TILE } from '../config.js';
import { PLOTS, SPAWN } from '../data/world.js';
import { STARTING_STATE, UPGRADES } from '../data/progression.js';
import { createPlot } from './farming.js';
import { createQuestState, refreshAvailability } from './quests.js';
import { createBuildingState } from './buildings.js';
import { rollover as rolloverOrders } from './orders.js';
import { seedSeenUnlocks } from './progress.js';

// Camera distances offered in Settings (see world/camera.js).
export const ZOOMS = ['near', 'normal', 'far'];

// The complete persistent game state. Rendering-only data never lives here.
export function createNewState() {
  const state = {
    version: SAVE_VERSION,
    time: DAY_START_MINUTE, // game minutes since day 1, 00:00
    player: { x: SPAWN.x * TILE, y: SPAWN.y * TILE, facing: 'down', scene: 'farm' },
    coins: STARTING_STATE.coins,
    inventory: { ...STARTING_STATE.inventory },
    selectedSeed: 'seed_carrot',
    can: { water: STARTING_STATE.canCapacity, capacity: STARTING_STATE.canCapacity },
    plots: Object.fromEntries(PLOTS.map((p) => [p.id, createPlot()])),
    unlocks: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, false])),
    buildings: createBuildingState(),
    placed: [],
    animals: [],
    cleared: [], // SCENERY indices removed by the player
    relations: {}, // villager friendship: { npcId: { points, lastTalkDay } }
    orders: { day: 0, nextId: 1, list: [] }, // delivery requests
    shops: { day: 0, bought: {}, traded: {} }, // today's village stock and demand
    counters: {}, // lifetime event totals (harvests, sales...) for achievements
    achievements: {}, // { id: { notified, claimed } }
    xp: 0, // experience; the farm level is derived from it
    seenUnlocks: [], // progression-tree entries already announced
    vehicles: [], // tractors in the garage or the fields (systems/vehicles.js)
    owned: { implements: [] }, // bought implements and trailers (ids)
    driving: null, // uid of the vehicle the player is in
    nextUid: 1,
    quests: createQuestState(),
    stats: { earned: 0 },
    flags: { introSeen: false, roadOpen: false, visitedVillage: false },
    settings: { muted: false, volume: 0.55, zoom: 'normal', bigControls: false },
  };
  refreshAvailability(state);
  rolloverOrders(state);
  seedSeenUnlocks(state); // what is already open at the start is not news
  return state;
}
