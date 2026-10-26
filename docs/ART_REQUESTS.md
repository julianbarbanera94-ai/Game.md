# Art still needed at higher resolution

## Why resolution matters
- The world is drawn at **64 px per tile**. A phone has about 2.6 device pixels per CSS pixel, so art should be exported at **3×, i.e. 192 px per tile**.
- Most of what is in the game today is a cut-out from a reference board at roughly **1–1.5× (64–90 px per tile)**, then enlarged. That is why it looks soft.
- Deliver every sprite as a **separate transparent PNG** (no label text, no cream board background), with one consistent anchor (bottom-centre for objects) and a note of its collision footprint.

## Priority list

| # | What | Today (native pixels) | Please supply | Used for |
|---|---|---|---|---|
| 1 | **Crops, 8 types × 6 stages** (planted, sprout, growing 1, growing 2, mature, ready), **without the soil** | ~80×75 px *including* soil, cut from a board | ≥ 192×192 px per stage, transparent, crop only | Every plot on the farm; the most-seen art in the game |
| 1 | **Soil plot tiles**: untilled, tilled, wet, harvested | ~80×75 px | ≥ 192×192 px, seamless edges so plots can sit side by side | Garden |
| 1 | **Seed packets, produce, tool icons** (hoe, watering can, basket) | ~80–100 px, cut from boards | 192×192 px each | Hotbar, shop, bag |
| 2 | **Cottage furniture** (room itself is now built from crisp layers — see `audit/ASSET_AUDIT.md`) | interim procedural pieces | Separate transparent PNGs, overhead view: bed ≥ 300×540, table ≥ 300×250, chair ≥ 120×150, dresser ≥ 300×220, nightstand ≥ 140×150 | Walking into the cottage |
| 3 | **Building levels 1–3**: cottage, well, workshop, market stall, storage shed | Levels 2–3 are 100–200 px wide cut-outs enlarged 2× | Width ≥ 192 px × the tile width in the game (cottage ≈ 1000 px, well ≈ 440 px, workshop ≈ 630 px, market stall ≈ 800 px, shed ≈ 560 px). Same footprint and anchor at every level | Upgrades |
| 3 | **Construction stages** for each building type (foundation, frame, roof, nearly done) | One barn set, ~110 px wide | 4 stages per building at the finished sprite's resolution | Anything under construction |
| 4 | **Player frames**: idle-left, 6–8 frame walk cycles in 4 directions, and till / plant / water / harvest poses in 4 directions | Missing frames are mirrored or reused (see `docs/ASSETS.md`) | Same 320×320 canvas with feet at y=306 (this size is fine) | Walking and working animations |
| 5 | **Decorations**: scarecrow, bench, flower crate, berry planter, hay bales, lantern post, water trough | 80–200 px cut-outs | ≥ 192 px per tile of their in-game width | Building planner |
| 6 | **Seamless ground tiles**: grass, dirt path, water, plus path/water edge pieces | Ragged "vignette" tiles blended by code | 256×256 px seamless tiles | The whole world floor |
| 7 | **Effects** (dirt, water splash, sparkle, dust) | Procedural dots | Small sprite sheets, 4–8 frames each | Farming feedback |

## Needed for later phases (same rules)
- Animals (Phase 5): each animal as a sprite sheet with idle and walk frames in 4 directions.
- Vehicles (Phase 6): each vehicle in 4 or 8 facings, plus attachments as separate sprites.
- Village NPCs (Phase 7): walk sheets ≥ the player's 320×320 frame size. The ones in the Phase 4 pack are only about 25 px tall.

## Format checklist
- PNG with a real alpha channel; no halo or magenta fringe.
- One file per sprite; naming like `house_l2.png`, `carrot_ready.png`.
- Same lighting direction and palette as `docs/reference/approved_starting_area_reference.jpg`.
- A CSV/JSON giving each sprite's size, anchor and collision footprint.

## Phase 7 (village) art still needed

- Villager sprites: farmer, shopkeeper (Mara), blacksmith (Bram), innkeeper (Odette), trader (Tobias), child (Wren): 4 directions, idle + walk, 256-320 px frames, consistent anchor.
- Portraits for the dialogue panel (the panel currently shows a coloured initial).
- Dedicated village buildings: general store, smithy, carpenter, inn (currently farm sprites reused), market stall variants, notice board, fountain, dock.
- Shop interiors (overhead) for the four shops.

## Phase 6 (vehicles) art still needed

- Overhead tractors (small and large), facing east, ~92x58 and ~116x72 px drawn size (supply 2-3x), plus the plough, seeder, sprayer, reaper (header), and a crop trailer, ideally as separate transparent PNGs with a shared hitch/mount point.
- A garage building (exterior, ~3.8 tiles wide).
- Optional: wheel/dust effects, exhaust puffs, fuel and repair icons.

## Sprinkler (new)

`prop.sprinkler` is built by `tools/paint_sprinkler.py` from the game's painted rocks, soil and plants with a code-shaded brass head. Still wanted: a
hand-painted top-down sprite in the style of the other props, transparent PNG, about 300 x 340 px, anchored
at the bottom centre, the spinning head about 60% up the image.
