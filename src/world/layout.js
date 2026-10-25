import { TILE, WORLD_W } from '../config.js';
import { BOUNDS, BRIDGE, CREEK, GARDEN, OBJECTS, SCENERY } from '../data/world.js';

// Converts tile-space world data into runtime drawables + colliders.
// A drawable: { sprite, x, y, w, h, src?, flip?, sortY }  (x,y = bottom-centre anchor, px)

function spriteSize(assets, key, wTiles) {
  const e = assets.entry(key);
  const w = wTiles * TILE;
  return { w, h: e ? (w * e.height) / e.width : w };
}

function rectFrom(x, y, c) {
  return { x0: (x + c[0]) * TILE, y0: (y + c[1]) * TILE, x1: (x + c[2]) * TILE, y1: (y + c[3]) * TILE };
}

export function buildWorld(assets) {
  const drawables = [];
  const groundDrawables = [];
  const colliders = [];
  const interactables = [];

  for (const o of OBJECTS) {
    const { w, h } = spriteSize(assets, o.sprite, o.w);
    const d = { id: o.id, sprite: o.sprite, x: o.x * TILE, y: o.y * TILE, w, h, sortY: o.y * TILE };
    (o.ground ? groundDrawables : drawables).push(d);
    if (o.collider) colliders.push(rectFrom(o.x, o.y, o.collider));
    if (o.interact) {
      const p = o.interactPoint || [o.x, o.y + 0.1];
      interactables.push({ id: o.id, kind: o.interact, x: p[0] * TILE, y: p[1] * TILE });
    }
  }

  SCENERY.forEach(([sprite, x, y, wt, r], i) => {
    const { w, h } = spriteSize(assets, sprite, wt);
    drawables.push({ sprite, x: x * TILE, y: y * TILE, w, h, sortY: y * TILE, flip: i % 3 === 1 });
    if (r > 0) colliders.push(rectFrom(x, y, [-r, -r * 0.9, r, 0]));
  });

  buildFence(assets, drawables, colliders);

  // Creek blocks movement except across the bridge.
  const cy0 = (CREEK.y0 + 0.15) * TILE;
  const cy1 = (CREEK.y1 - 0.05) * TILE;
  colliders.push({ x0: 0, y0: cy0, x1: BRIDGE.x0 * TILE + 8, y1: cy1 });
  colliders.push({ x0: BRIDGE.x1 * TILE - 8, y0: cy0, x1: WORLD_W, y1: cy1 });

  const bounds = { x0: BOUNDS.x0 * TILE, y0: BOUNDS.y0 * TILE, x1: BOUNDS.x1 * TILE, y1: BOUNDS.y1 * TILE };
  return { drawables, groundDrawables, colliders, interactables, bounds };
}

// Garden fence: horizontal rail pieces on top/bottom, post runs on the sides.
function buildFence(assets, drawables, colliders) {
  const H = 'terrain.fence_horizontal_detailed';
  const POST = 'building.fence_segment';
  const g = GARDEN;
  const count = Math.round(g.x1 - g.x0);
  const step = (g.x1 - g.x0) / count;
  const rail = spriteSize(assets, H, step * 1.1);
  const addRail = (cx, y) => drawables.push({ sprite: H, x: cx * TILE, y: y * TILE, w: rail.w, h: rail.h, sortY: y * TILE });
  for (let i = 0; i < count; i++) {
    const cx = g.x0 + step * (i + 0.5);
    if (!(cx > g.gate[0] && cx < g.gate[1])) addRail(cx, g.y0 + 0.2);
    addRail(cx, g.y1 + 0.2);
  }
  // Side posts are cropped from the left post of the Phase 1 fence segment.
  const seg = assets.entry(POST);
  if (seg) {
    const src = [0, 0, seg.width * 0.12, seg.height];
    const pw = 0.36 * TILE;
    const ph = (pw * src[3]) / src[2];
    for (const x of [g.x0, g.x1]) {
      for (let y = g.y0 + 0.65; y <= g.y1 + 0.2; y += 0.55) {
        drawables.push({ sprite: POST, src, x: x * TILE, y: y * TILE, w: pw, h: ph, sortY: y * TILE });
      }
    }
  }
  const t = 0.16;
  colliders.push(
    { x0: g.x0 * TILE, y0: (g.y0 - t) * TILE, x1: g.gate[0] * TILE, y1: (g.y0 + t) * TILE },
    { x0: g.gate[1] * TILE, y0: (g.y0 - t) * TILE, x1: g.x1 * TILE, y1: (g.y0 + t) * TILE },
    { x0: g.x0 * TILE, y0: (g.y1 - t) * TILE, x1: g.x1 * TILE, y1: (g.y1 + t) * TILE },
    { x0: (g.x0 - t) * TILE, y0: g.y0 * TILE, x1: (g.x0 + t) * TILE, y1: g.y1 * TILE },
    { x0: (g.x1 - t) * TILE, y0: g.y0 * TILE, x1: (g.x1 + t) * TILE, y1: g.y1 * TILE },
  );
}

// Every sprite key the world needs, for preloading.
export function worldSpriteKeys() {
  return [
    ...OBJECTS.map((o) => o.sprite),
    ...SCENERY.map((s) => s[0]),
    'terrain.fence_horizontal_detailed',
    'building.fence_segment',
  ];
}
