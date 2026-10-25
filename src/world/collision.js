// Axis-aligned collision against static rectangles + world bounds.
// Rects are { x0, y0, x1, y1 } in world pixels.

export function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export class CollisionWorld {
  constructor(bounds, rects) {
    this.bounds = bounds;
    this.rects = rects;
  }

  blocked(box) {
    const b = this.bounds;
    if (box.x0 < b.x0 || box.y0 < b.y0 || box.x1 > b.x1 || box.y1 > b.y1) return true;
    for (const r of this.rects) if (overlaps(box, r)) return true;
    return false;
  }

  // Move a feet-box by (dx, dy), resolving each axis separately so the
  // player slides along walls instead of sticking.
  move(pos, half, dx, dy) {
    const boxAt = (x, y) => ({ x0: x - half.w, y0: y - half.h, x1: x + half.w, y1: y + half.h });
    let { x, y } = pos;
    if (dx && !this.blocked(boxAt(x + dx, y))) x += dx;
    if (dy && !this.blocked(boxAt(x, y + dy))) y += dy;
    return { x, y };
  }
}
