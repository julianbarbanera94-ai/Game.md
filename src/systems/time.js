import { DAY_START_MINUTE, MINUTES_PER_DAY } from '../config.js';

// World time is a single counter of game minutes since the start of day 1.
export function clock(total) {
  const day = Math.floor(total / MINUTES_PER_DAY) + 1;
  const minuteOfDay = Math.floor(total % MINUTES_PER_DAY);
  return { day, minuteOfDay, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 };
}

export function formatClock(total) {
  const { hour, minute } = clock(total);
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const mm = String(Math.floor(minute / 10) * 10).padStart(2, '0');
  return `${String(h12).padStart(2, '0')}:${mm} ${ampm}`;
}

// Minutes from `total` until the next 6:00 AM (sleeping skips to it).
export function minutesUntilMorning(total) {
  const { minuteOfDay } = clock(total);
  if (minuteOfDay < DAY_START_MINUTE) return DAY_START_MINUTE - minuteOfDay;
  return MINUTES_PER_DAY - minuteOfDay + DAY_START_MINUTE;
}

// 0 = full daylight, 1 = deepest night. Used for the lighting overlay.
export function darkness(total) {
  const m = clock(total).minuteOfDay;
  const h = m / 60;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return ((h - 18) / 3) * 0.85;
  if (h >= 21 || h < 4.5) return 0.85;
  return 0.85 * (1 - (h - 4.5) / 2.5);
}
