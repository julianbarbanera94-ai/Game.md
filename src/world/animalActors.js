import { TILE } from '../config.js';
import { SPECIES } from '../data/animals.js';
import { pastureOf } from '../systems/pasture.js';

// Runtime wandering for livestock. This is presentation only: animal identity
// and needs live in state.animals; positions are not saved (animals simply
// start somewhere in their pasture after a load).
//
// actor: { uid, species, x, y, tx, ty, wait, facing, moving, t, bounds }  (px)

const toPx = (b) => ({ x0: b.x0 * TILE, y0: b.y0 * TILE, x1: b.x1 * TILE, y1: b.y1 * TILE });

export class AnimalActors {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.map = new Map();
  }

  list() {
    return [...this.map.values()];
  }

  get(uid) {
    return this.map.get(uid) || null;
  }

  // Create actors for new animals, drop actors for sold ones, track building moves.
  sync(state) {
    const seen = new Set();
    for (const a of state.animals) {
      const home = state.placed.find((p) => p.uid === a.home);
      const g = home && pastureOf(home.type, home.x, home.y);
      if (!g) continue;
      seen.add(a.uid);
      const bounds = toPx(g.bounds);
      let ac = this.map.get(a.uid);
      if (!ac) {
        ac = {
          uid: a.uid, species: a.species,
          x: bounds.x0 + this.rand() * (bounds.x1 - bounds.x0),
          y: bounds.y0 + this.rand() * (bounds.y1 - bounds.y0),
          tx: null, ty: null, wait: this.rand() * 3, facing: 'down', moving: false, t: this.rand() * 10, bounds,
        };
        this.map.set(a.uid, ac);
      }
      ac.bounds = bounds;
    }
    for (const uid of [...this.map.keys()]) if (!seen.has(uid)) this.map.delete(uid);
  }

  update(dt) {
    for (const ac of this.map.values()) {
      ac.t += dt;
      if (ac.wait > 0) {
        ac.wait -= dt;
        ac.moving = false;
        continue;
      }
      const sp = SPECIES[ac.species];
      if (ac.tx == null) {
        // short wanders: a point within ~2.5 tiles, kept inside the pasture
        const r = TILE * 2.5;
        ac.tx = Math.min(ac.bounds.x1, Math.max(ac.bounds.x0, ac.x + (this.rand() * 2 - 1) * r));
        ac.ty = Math.min(ac.bounds.y1, Math.max(ac.bounds.y0, ac.y + (this.rand() * 2 - 1) * r));
      }
      const dx = ac.tx - ac.x;
      const dy = ac.ty - ac.y;
      const dist = Math.hypot(dx, dy);
      const step = sp.speed * dt;
      if (dist <= step) {
        ac.x = ac.tx;
        ac.y = ac.ty;
        ac.tx = null;
        ac.wait = 1.5 + this.rand() * 4.5;
        ac.moving = false;
        continue;
      }
      ac.x += (dx / dist) * step;
      ac.y += (dy / dist) * step;
      ac.moving = true;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) ac.facing = dx > 0 ? 'right' : 'left';
      else ac.facing = dy > 0 ? 'down' : 'up';
    }
  }
}
