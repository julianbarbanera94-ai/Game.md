import { NPCS, NPC_LIST } from '../data/npcs.js';
import { clock } from './time.js';

// Where a villager should be at a given time. Pure functions so schedules are
// easy to test; the walking itself lives in world/npcActors.js.

export function scheduleAt(def, minuteOfDay) {
  if (def.wander) {
    const w = def.wander;
    if (minuteOfDay < w.from || minuteOfDay >= w.to) return { present: false };
    const idx = Math.floor((minuteOfDay - w.from) / w.every) % w.points.length;
    return { present: true, at: w.points[idx], facing: 'down', idle: false };
  }
  for (const slot of def.schedule) {
    if (minuteOfDay >= slot.from && minuteOfDay < slot.to) return { present: true, at: slot.at, facing: slot.facing, idle: true };
  }
  return { present: false };
}

export const presentNow = (def, time) => scheduleAt(def, clock(time).minuteOfDay).present;

// "Closed — back at 8:00 AM" style text for a villager who is away.
export function awayText(def, time) {
  const m = clock(time).minuteOfDay;
  const opens = def.wander ? def.wander.from : def.schedule.map((s) => s.from).sort((a, b) => a - b).find((f) => f > m) ?? def.schedule[0].from;
  const hr = Math.floor(opens / 60);
  const min = opens % 60;
  const h12 = ((hr + 11) % 12) + 1;
  return `${def.name} is away — back around ${h12}:${String(min).padStart(2, '0')} ${hr < 12 ? 'AM' : 'PM'}`;
}

export function npcById(id) {
  return NPCS[id] || null;
}

export { NPC_LIST };
