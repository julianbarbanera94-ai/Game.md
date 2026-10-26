import { SAVE_KEY, SAVE_VERSION, WORLD_W, WORLD_H } from '../config.js';
import { CROPS } from '../data/crops.js';
import { getItem } from '../data/items.js';
import { createNewState } from './state.js';
import { refreshAvailability } from './quests.js';
import { applyUpgradeEffects } from './economy.js';
import { BUILDINGS, DECORATIONS } from '../data/buildings.js';
import { SPECIES } from '../data/animals.js';
import { applyLevelEffects, FIXED_BUILDINGS } from './buildings.js';

// Versioned save model. Loading never trusts stored data: every field is
// validated against a fresh state and unknown/invalid values are dropped.

// MIGRATIONS[v] upgrades a version-v save to version v+1.
const MIGRATIONS = {
  // v1 -> v2: buildings gained levels; the old "Large Watering Can" unlock
  // becomes workshop (tool shed) level 2.
  1: (data) => {
    const out = { ...data, version: 2 };
    out.buildings = { tool_shed: { level: data.unlocks?.wateringCan2 ? 2 : 1, job: null } };
    out.placed = [];
    if (out.unlocks) {
      out.unlocks = { ...out.unlocks };
      delete out.unlocks.wateringCan2;
    }
    return out;
  },
};

// v2 -> v3: livestock arrived; old saves simply have no animals.
MIGRATIONS[2] = (data) => ({ ...data, version: 3, animals: [] });

function validJob(job, maxLevel) {
  if (!job || typeof job !== 'object') return null;
  const toLevel = Math.floor(num(job.toLevel, 0));
  const start = num(job.start, 0);
  const end = num(job.end, 0);
  if (toLevel < 1 || toLevel > maxLevel || end < start) return null;
  return { toLevel, start, end };
}

function num(v, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function serialize(state) {
  return JSON.stringify({ ...state, version: SAVE_VERSION, savedAt: Date.now() });
}

export function deserialize(json) {
  let data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object') throw new Error('Save data is not an object');
  let v = num(data.version, 0);
  if (v > SAVE_VERSION) throw new Error(`Save is from a newer version (${v})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from save version ${v}`);
    data = m(data);
    v += 1;
  }

  const s = createNewState();
  s.time = num(data.time, s.time);
  if (data.player) {
    s.player.x = num(data.player.x, s.player.x, 0, WORLD_W);
    s.player.y = num(data.player.y, s.player.y, 0, WORLD_H);
    if (['up', 'down', 'left', 'right'].includes(data.player.facing)) s.player.facing = data.player.facing;
    if (data.player.scene === 'house') s.player.scene = 'house';
  }
  s.coins = Math.floor(num(data.coins, s.coins));
  if (data.inventory && typeof data.inventory === 'object') {
    s.inventory = {};
    for (const [id, q] of Object.entries(data.inventory)) {
      const item = getItem(id);
      const qty = Math.floor(num(q, 0, 0, item?.maxStack ?? 0));
      if (item && qty > 0) s.inventory[id] = qty;
    }
  }
  if (getItem(data.selectedSeed)?.category === 'seed') s.selectedSeed = data.selectedSeed;
  if (data.unlocks) for (const k of Object.keys(s.unlocks)) s.unlocks[k] = !!data.unlocks[k];
  for (const k of Object.keys(s.unlocks)) if (s.unlocks[k]) applyUpgradeEffects(s, k);
  for (const id of FIXED_BUILDINGS) {
    const b = data.buildings?.[id];
    if (!b) continue;
    const max = BUILDINGS[id].levels.length;
    s.buildings[id].level = Math.floor(num(b.level, 1, 1, max));
    s.buildings[id].job = validJob(b.job, max);
    if (s.buildings[id].job && s.buildings[id].job.toLevel !== s.buildings[id].level + 1) s.buildings[id].job = null;
  }
  if (Array.isArray(data.placed)) {
    for (const p of data.placed.slice(0, 200)) {
      if (!p || typeof p !== 'object' || typeof p.uid !== 'string') continue;
      const deco = DECORATIONS[p.type];
      const bdef = BUILDINGS[p.type];
      if (!deco && !bdef?.placeable) continue;
      const rec = { uid: p.uid, kind: deco ? 'decor' : 'building', type: p.type, x: num(p.x, -1, 0, 1000), y: num(p.y, -1, 0, 1000) };
      if (rec.x < 0 || rec.y < 0) continue;
      if (deco) {
        rec.level = 1;
        rec.job = null;
      } else {
        const max = bdef.levels.length;
        rec.level = Math.floor(num(p.level, 0, 0, max));
        rec.job = validJob(p.job, max);
        if (rec.level === 0 && !rec.job) continue;
        rec.storage = {};
        for (const [id, q] of Object.entries(p.storage || {})) {
          const item = getItem(id);
          const qty = Math.floor(num(q, 0, 0, item?.maxStack ?? 0));
          if (item && qty > 0) rec.storage[id] = qty;
        }
      }
      s.placed.push(rec);
    }
  }
  // Livestock: drop anything whose species or home building no longer exists.
  if (Array.isArray(data.animals)) {
    const used = new Set();
    const perHome = {};
    for (const a of data.animals.slice(0, 200)) {
      if (!a || typeof a !== 'object' || typeof a.uid !== 'string' || used.has(a.uid)) continue;
      const sp = SPECIES[a.species];
      const home = s.placed.find((p) => p.uid === a.home && BUILDINGS[p.type]?.livestock);
      if (!sp || !home || home.type !== sp.home || home.level < 1) continue;
      const cap = BUILDINGS[home.type].capacity[home.level - 1];
      if ((perHome[home.uid] = (perHome[home.uid] || 0) + 1) > cap) continue;
      used.add(a.uid);
      s.animals.push({
        uid: a.uid, species: sp.id, home: home.uid,
        name: typeof a.name === 'string' ? a.name.slice(0, 24) : sp.name,
        fedUntil: num(a.fedUntil, 0, -1e9, 1e12),
        happiness: num(a.happiness, 50, 0, 100),
        progress: num(a.progress, 0, 0, sp.cycleMinutes),
        stock: Math.floor(num(a.stock, 0, 0, sp.maxStock)),
        petAt: num(a.petAt, -1e9, -1e12, 1e12),
      });
    }
  }
  s.nextUid = Math.floor(num(data.nextUid, s.placed.length + s.animals.length + 1));
  applyLevelEffects(s);
  if (data.can) s.can.water = Math.floor(num(data.can.water, s.can.water, 0, s.can.capacity));
  if (data.plots) {
    for (const [id, plot] of Object.entries(s.plots)) {
      const p = data.plots[id];
      if (!p) continue;
      plot.tilled = !!p.tilled;
      plot.crop = plot.tilled && CROPS[p.crop] ? p.crop : null;
      plot.growth = plot.crop ? num(p.growth, 0, 0, CROPS[plot.crop].growMinutes) : 0;
      plot.moistUntil = num(p.moistUntil, 0);
      plot.variant = p.variant === 1 ? 1 : 0;
    }
  }
  if (data.quests) {
    for (const [id, qs] of Object.entries(s.quests)) {
      const d = data.quests[id];
      if (!d || !['locked', 'active', 'complete', 'claimed'].includes(d.status)) continue;
      qs.status = d.status;
      qs.progress = qs.progress.map((_, i) => Math.floor(num(d.progress?.[i], 0)));
    }
  }
  s.stats.earned = num(data.stats?.earned, 0);
  s.flags.introSeen = !!data.flags?.introSeen;
  s.settings.muted = !!data.settings?.muted;
  refreshAvailability(s);
  return s;
}

export function hasSave(storage) {
  try {
    return !!storage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function saveGame(storage, state) {
  try {
    const json = serialize(state);
    storage.setItem(SAVE_KEY, json);
    // Read it back: some storages accept writes and silently drop them.
    if (storage.getItem(SAVE_KEY) !== json) return { ok: false, reason: 'Could not save: the device did not keep the data' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Could not save: ${err.message}` };
  }
}

export function loadGame(storage) {
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (err) {
    return { ok: false, reason: `Storage unavailable: ${err.message}` };
  }
  if (!raw) return { ok: false, reason: 'No saved game' };
  try {
    return { ok: true, state: deserialize(raw), savedAt: JSON.parse(raw).savedAt };
  } catch (err) {
    return { ok: false, reason: `Save file is damaged: ${err.message}` };
  }
}

export function savePreview(storage) {
  const r = loadGame(storage);
  if (!r.ok) return null;
  return { time: r.state.time, coins: r.state.coins, savedAt: r.savedAt };
}
