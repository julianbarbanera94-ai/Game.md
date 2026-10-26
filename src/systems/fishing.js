import { FISH_LIST, BITE_WAIT, HOOK_WINDOW } from '../data/fish.js';
import { calendar } from './seasons.js';
import { clock } from './time.js';
import { CREEK } from '../data/world.js';

// Fishing: cast from the creek bank with the rod selected, wait for a bite,
// press Action while the float is dipping. What bites depends on the season
// and the time of day. Pure functions so the rules can be tested without a game.

// Early morning and evening are the best times to fish.
export function biteWeight(fish, time) {
  const m = clock(time).minuteOfDay;
  let w = fish.weight;
  if (m < 9 * 60) w *= fish.dawn || 1;
  if (m >= 17 * 60) w *= fish.dusk || 1;
  return w;
}

// The fish that bite now, or null if the season has none for this rod.
export function pickFish(time, rand = Math.random) {
  const season = calendar(time).seasonIndex;
  const pool = FISH_LIST.filter((f) => f.seasons.includes(season)).map((f) => [f, biteWeight(f, time)]);
  const total = pool.reduce((n, [, w]) => n + w, 0);
  if (!total) return null;
  let r = rand() * total;
  for (const [f, w] of pool) {
    r -= w;
    if (r <= 0) return f;
  }
  return pool[pool.length - 1][0];
}

export const waitSeconds = (rand = Math.random) => BITE_WAIT[0] + rand() * (BITE_WAIT[1] - BITE_WAIT[0]);

// Where a line can be cast from: standing on either bank, facing the water.
export function castSpot(player, facing) {
  const TILE = 64;
  const y = player.y / TILE;
  const north = y >= CREEK.y0 - 1.1 && y <= CREEK.y0 - 0.2;
  const south = y >= CREEK.y1 + 0.2 && y <= CREEK.y1 + 1.1;
  if (facing === 'down' && north) return { x: player.x, y: (CREEK.y0 + CREEK.y1) / 2 * TILE };
  if (facing === 'up' && south) return { x: player.x, y: (CREEK.y0 + CREEK.y1) / 2 * TILE };
  return null;
}

export { HOOK_WINDOW };
