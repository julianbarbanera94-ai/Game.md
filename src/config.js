// Global tuning constants. Gameplay numbers that designers tune live in
// src/data/*; this file holds engine/world constants.
export const TILE = 64;
export const MAP_COLS = 64;
export const MAP_ROWS = 28;
export const WORLD_W = TILE * MAP_COLS;
export const WORLD_H = TILE * MAP_ROWS;

export const PLAYER_SPEED = 230; // world px per second
export const PLAYER_HEIGHT = 84; // on-screen height of the character in world px
export const INTERACT_RANGE = TILE * 1.05;

// One shared clock drives crops, shops and quests.
export const GAME_MINUTES_PER_SECOND = 4;
export const DAY_START_MINUTE = 6 * 60;
export const MINUTES_PER_DAY = 24 * 60;

export const SAVE_KEY = 'farmstead.save';
export const SAVE_VERSION = 7;
