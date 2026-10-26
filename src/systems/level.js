import { LEVEL_XP } from '../data/achievements.js';

// Farm level from total experience (pure; shared by requirements and UI).
export function levelFor(xp) {
  let level = 1;
  LEVEL_XP.forEach((need, i) => { if (xp >= need) level = i + 1; });
  return level;
}

export const levelOf = (state) => levelFor(state.xp || 0);
export const MAX_LEVEL = LEVEL_XP.length;

export function levelInfo(state) {
  const xp = state.xp || 0;
  const level = levelFor(xp);
  const base = LEVEL_XP[level - 1];
  const next = LEVEL_XP[level]; // undefined at the top
  return { level, xp, base, next: next ?? null, into: xp - base, span: next != null ? next - base : 0 };
}
