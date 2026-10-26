import { DAY_START_MINUTE, SAVE_VERSION, TILE } from '../config.js';
import { PLOTS, SPAWN } from '../data/world.js';
import { STARTING_STATE, UPGRADES } from '../data/progression.js';
import { createPlot } from './farming.js';
import { createQuestState, refreshAvailability } from './quests.js';
import { createBuildingState } from './buildings.js';

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
    nextUid: 1,
    quests: createQuestState(),
    stats: { earned: 0 },
    flags: { introSeen: false },
    settings: { muted: false },
  };
  refreshAvailability(state);
  return state;
}
