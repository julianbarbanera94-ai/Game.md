# Farmstead art brief — sizes for redrawn assets

The current sprites are soft because the original art only had 100–400 px of
real detail per object. Enlarging them does not fix that (tested): the objects
must be **redrawn or regenerated at the sizes below**.

`ART_SIZES.csv` lists every file (exact name, current size, target size).
Totals: 26 buildings, 6 trees, 7 decorations, 48 animal frames (+6 for the
future), 59 crop/soil states, 33 icons, 17 ground textures, plus cottage furniture.

## Rules for every image

- **Camera:** directly overhead, hand-painted 2D, matching
  `docs/reference/approved_starting_area_reference.jpg`. Not isometric, not flat vector.
- **One object per file**, whole object visible with a 4% margin on every side, nothing cropped.
- **Transparent PNG.** If transparency isn't possible, use one solid flat **magenta (#FF00FF)** background and no cast shadow on it (a soft contact shadow painted into the object is fine).
- **Light** from the top-left, same palette and outline weight across every asset.
- **No text, labels, frames, grids or UI** in the image.
- **File names** exactly as in the CSV (the key + `.png`).
- Upgrade levels of one building (L1 / L2 / L3) use the **same camera angle, same footprint
  centre and bottom edge**, so it grows in place.
- Sizes are the **object's pixel size after the empty margin is trimmed**.
  Image generators often cap at 1024×1024 or 1536×1024: that is fine, as long as the
  object fills the canvas (do not draw a small object in a big empty image).
  I'll trim and normalise.
- Keep each object's proportions as in the reference sheet; ±5% is fine.

## Target sizes (long edge unless noted)

| group | count | target size | drawn in game at | notes |
|---|---|---|---|---|
| Buildings | 26 | 448–1024 px wide, see CSV (house 960–1024, barn/coop L3 1024, small ones 448–640) | 147–410 px wide | the most noticeable |
| Construction stages | 4 | 768 px wide | ~300 px wide | foundation → frame → roof → nearly done |
| Trees | 6 | 512–640 px wide | 154–205 px wide | oak, pine, birch, autumn, blossom, stump |
| Decorations | 7 | 192–320 px wide | 45–102 px wide | scarecrow, bench, flower crate, berry crate, hay bales, lantern post, trough |
| Animals | 48 | chicken 128 px tall, sheep 192 px tall, cow 256 px tall | 40 / 58 / 78 px tall | per species 9 frames: facing camera x5 (`d0`–`d4`), facing away x4 (`u0`–`u3`); same height in every frame; add true side-view walk frames if possible |
| Crops and soil | 59 | 192 × 192 | 62 px (one tile) | growth stages: planted, sprout, growing1, growing2, mature, ready, ready_alt per crop |
| Icons | 33 | 256 × 256 | up to 62 px | products, feed, seeds, tools; centred on a square canvas |
| Ground textures | 17 | 512 × 512 | 170 px stamps | **seamless, tileable**, no objects or hard edges |
| Cottage furniture | 5 | bed 300×540, table 300×250, chair 120×150, dresser 300×220, nightstand 140×150 | 1.9–3.4 tiles | overhead view; currently drawn by code |

Minimum acceptable: half the sizes above. Anything smaller will look soft again.

## Prompt template

> Hand-painted top-down (directly overhead, not isometric) 2D game asset for a cosy farming
> game: **[ASSET NAME]**. Rich painterly detail, warm natural palette, soft dark outline,
> light from the top-left, matching the attached reference image. Single object centred on a
> transparent background (or flat #FF00FF), whole object visible with a small margin, no text,
> no ground shadow, no frame. Output at least **[SIZE]** pixels on the long edge.

Attach `approved_starting_area_reference.jpg` and the current sprite of that asset as
a shape/colour guide with every request. For L2 and L3, also attach L1 and ask for the
same building "upgraded", keeping the same viewing angle.

## Priority order

1. Buildings (house, coop, barn, workshop, market, well, storage shed) and construction stages
2. Chicken, cow and sheep frames
3. Product, feed and seed icons
4. Decorations, trees
5. Crops, soil and ground textures
6. Cottage furniture
