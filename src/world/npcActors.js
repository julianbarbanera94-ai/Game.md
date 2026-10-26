import { TILE } from '../config.js';
import { NPC_LIST } from '../data/npcs.js';
import { scheduleAt } from '../systems/npcs.js';
import { clock } from '../systems/time.js';

// Runtime villagers. Positions are decided by schedules (systems/npcs.js); this
// class only walks them there. NPCs are not saved: they are rebuilt from the
// clock, so loading a game mid-day finds everyone where they should be.

const WALK_SPEED = 62; // px per second
const ARRIVE = 3;
const NEAR_START = 25; // minutes after a shift starts during which an NPC is still walking out

export class NpcActors {
  constructor() {
    this.byId = new Map();
  }

  list() {
    return [...this.byId.values()];
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  sync(state) {
    const { minuteOfDay } = clock(state.time);
    for (const def of NPC_LIST) {
      const s = scheduleAt(def, minuteOfDay);
      let a = this.byId.get(def.id);
      if (!s.present) {
        if (a) this.byId.delete(def.id);
        continue;
      }
      const target = { x: s.at[0] * TILE, y: s.at[1] * TILE };
      if (!a) {
        // just arrived for the day? come out of the door; otherwise already at the post
        const start = def.wander ? def.wander.from : def.schedule.find((x) => minuteOfDay >= x.from && minuteOfDay < x.to).from;
        const fresh = minuteOfDay - start < NEAR_START;
        const from = fresh ? def.door : s.at;
        a = { id: def.id, def, x: from[0] * TILE, y: from[1] * TILE, facing: 'down', moving: false, t: 0 };
        this.byId.set(def.id, a);
      }
      a.target = target;
      a.finalFacing = s.facing;
    }
  }

  update(dt) {
    for (const a of this.byId.values()) {
      const dx = a.target.x - a.x;
      const dy = a.target.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > ARRIVE) {
        const step = Math.min(d, WALK_SPEED * dt);
        a.x += (dx / d) * step;
        a.y += (dy / d) * step;
        a.moving = true;
        a.facing = Math.abs(dx) > Math.abs(dy) * 1.05 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        a.t += dt;
      } else {
        a.moving = false;
        a.t = 0;
        a.facing = a.finalFacing || a.facing;
      }
    }
  }
}
