import { plotStage } from '../systems/farming.js';

// Mapping from gameplay state to sprite keys. Only frames that exist in the
// supplied packs are referenced; missing ones are mirrored or reused (noted).

const IDLE = { down: 'player.idle_front', up: 'player.idle_back', right: 'player.idle_right', left: 'player.idle_right' };
const WALK = {
  down: ['player.walk_front_1', 'player.idle_front', 'player.walk_front_2', 'player.idle_front'],
  up: ['player.walk_back_1', 'player.idle_back', 'player.walk_back_2', 'player.idle_back'],
  right: ['player.walk_right_1', 'player.idle_right', 'player.walk_right_2', 'player.idle_right'],
  // No idle_left frame exists: idle_right is mirrored between left steps.
  left: ['player.walk_left_1', 'player.idle_right', 'player.walk_left_2', 'player.idle_right'],
};
// Action poses are single frames drawn facing left; mirrored for right.
// Planting reuses the kneeling harvest pose (no dedicated plant frame supplied).
// Collecting eggs, milk and wool uses the carry pose.
const ACTION = { till: 'player.hoe_action', water: 'player.water_action', harvest: 'player.harvest_action', plant: 'player.harvest_action', carry: 'player.carry_action' };

export const PLAYER_KEYS = [...new Set([...Object.values(IDLE), ...Object.values(WALK).flat(), ...Object.values(ACTION)])];

export function playerFrame(facing, moving, animTime, action) {
  if (action) return { key: ACTION[action], flip: facing === 'right' };
  if (moving) {
    const frames = WALK[facing];
    const key = frames[Math.floor(animTime * 8) % frames.length];
    return { key, flip: facing === 'left' && key === 'player.idle_right' };
  }
  return { key: IDLE[facing], flip: facing === 'left' };
}

export function plotSpriteKey(plot) {
  const stage = plotStage(plot);
  if (stage === 'untilled') return 'plot.soil_dry';
  if (stage === 'tilled') return 'plot.soil_tilled';
  if (stage === 'ready') return `plot.${plot.crop}_${plot.variant ? 'ready_alt' : 'ready'}`;
  return `plot.${plot.crop}_${stage}`;
}

export function plotSpriteKeys(crops) {
  const keys = ['plot.soil_dry', 'plot.soil_tilled'];
  for (const c of crops) for (const s of ['planted', 'sprout', 'growing1', 'growing2', 'mature', 'ready', 'ready_alt']) keys.push(`plot.${c}_${s}`);
  return keys;
}

// Pale, dry "untilled ground" variant: desaturated and lightened so it reads
// clearly differently from freshly tilled soil.
const dryCache = new Map();
export function untilledVariant(key, img) {
  if (dryCache.has(key)) return dryCache.get(key);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    d[i] = Math.min(255, (d[i] * 0.45 + l * 0.55) * 1.25 + 18);
    d[i + 1] = Math.min(255, (d[i + 1] * 0.45 + l * 0.55) * 1.22 + 14);
    d[i + 2] = Math.min(255, (d[i + 2] * 0.45 + l * 0.55) * 1.1 + 4);
  }
  g.putImageData(data, 0, 0);
  dryCache.set(key, c);
  return c;
}

// Darkened "wet soil" variant of a plot sprite: only soil-coloured pixels are
// darkened so leaves and produce keep their colour.
const wetCache = new Map();
export function wetVariant(key, img) {
  if (wetCache.has(key)) return wetCache.get(key);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gr = d[i + 1], b = d[i + 2];
    if (r > gr && gr >= b - 6 && r - b > 18 && r < 200) {
      d[i] = r * 0.62;
      d[i + 1] = gr * 0.6;
      d[i + 2] = Math.min(255, b * 0.66 + 8);
    }
  }
  g.putImageData(data, 0, 0);
  wetCache.set(key, c);
  return c;
}
