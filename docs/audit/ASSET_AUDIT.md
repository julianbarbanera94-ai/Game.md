# Asset resolution & sharpness audit

Every image in all ten phase ZIPs, plus every runtime sprite in
`assets/manifest.json`, was measured by `tools/audit_assets.py`. The large
sheets in each phase were also inspected by eye.

| file | contents |
|---|---|
| `AUDIT_TABLES.md` | Every image, grouped by phase and verdict, with file, dimensions, kind (sprite / frame / sheet / tile vignette / mock-up), category, transparency, object sizes found on sheets, effective resolution, required resolution, sharpness, action and notes. |
| `asset_audit.csv` / `runtime_audit.csv` / `audit.json` | The same data, machine-readable. |
| `interior_before_after_*.jpg` | The cottage interior, before and after. |
| `indoor_outdoor_*.jpg` | Indoors and outdoors side by side, at the same zoom. |

To regenerate the audit, extract the ZIPs as `<dir>/p1 … <dir>/p10`, then run
`python3 -I tools/audit_assets.py <dir>`.

## Method

- **Effective resolution.** File size overstates detail when art was enlarged.
  The tool finds the largest factor f in {1.25, 1.5, 2, 2.5, 3, 4} such that
  shrinking the image by f and enlarging it back changes it by at most 2.2/255
  (mean absolute error). The detail actually present is then `size / f`. The
  previous 2×/3× Lanczos enlargements are counted as such.
- **Required resolution.** Required size = how large the object is drawn (world
  px) × 2.1. The 2.1 is the most device pixels per world pixel at the closest
  outdoor zoom on a 2× screen. Indoors, the camera tops out at 1.25× on a 2×
  screen, so the factor there is 2.5.
- **Sheets.** Board objects are cut out by keying the cream background and
  measured one by one. Where detection merges objects, sizes were measured by
  hand (`MEASURED` in the tool).
- **Verdicts.** Ratio = effective / required. **pass** ≥ 0.9, **review**
  0.6–0.9, **fail** < 0.6.
  - **fail (style)**: the Phase 1 v1 flat vector set, rejected on art direction
    regardless of size.
  - **reference only**: mock-ups and review boards.
  - **n/a**: UI mock-ups. The HUD is built in HTML/CSS.

## Resolution standards (adjusted to actual rendering)

| asset | drawn size (world px) | minimum source (long edge) | brief's range |
|---|---|---|---|
| Icons (HUD/shop) | ~62 CSS px | **128** (256 preferred) | 128–256 ✔ |
| Character frames | 84 px body | **≥ 176 px body**, frame 256–512 tall | 256–512 ✔ |
| Animals | 40–78 px | **≥ 168** | — |
| Crops / plots | 1 tile (62) | **≥ 130** | — |
| Small props | 45–100 px | **≥ 210** | 256–512 ✔ |
| Trees | 155–205 px | **≥ 420** | — |
| Buildings | 150–410 px | **≥ 714**, i.e. 1024 for the large ones | 512–1024+ → raise to 1024 |
| Ground texture stamps | 170 px | **≥ 357**, seamless | — |
| Interior props | 51–160 px | **≥ 2.5 × drawn width** | 256–512 ✔ |
| Interiors | 576 px room | built from layers, see below | 512–1024+ |

## Per-phase findings (source packs, 445 images)

| phase | images | pass | review | fail | fail (style) | ref / n/a | summary |
|---|---|---|---|---|---|---|---|
| 1 | 276 | 45 | 14 | 13 | 198 | 6 | **Usable:** the v2 foliage, props and player frames. **Rejected on style:** the v1 vector set. **Review:** trees (~0.8). **Fail at closest zoom:** buildings (house 417 px vs 714 px needed). |
| 2 | 45 | 26 | 9 | 5 | – | 5 | Props pass. Terrain stamps are review: about 230 px versus 357 px needed. |
| 3 | 18 | 0 | 13 | 3 | – | 2 | Crop stages are about 62–110 px per object: review. |
| 4 | 16 | 0 | 0 | 15 | – | 1 | Building-upgrade and interior **reference boards**. Objects are 55–220 px, so all fail. |
| 5 | 12 | 0 | 0 | 11 | – | 1 | Animal boards (animals ~40 px tall) and product icons (~25 px). |
| 6 | 17 | 0 | 1 | 14 | – | 2 | Boards: objects ~30–120 px. |
| 7 | 10 | 0 | 0 | 8 | – | 2 | Boards: objects ~30–120 px. |
| 8 | 10 | 0 | 0 | 1 | – | 9 | Mostly mock-ups. |
| 9 | 13 | 0 | 1 | 0 | – | 12 | Mostly mock-ups. |
| 10 | 10 | 0 | 1 | 2 | – | 7 | Mostly mock-ups. |

Pass / review / fail lists for every file are in `AUDIT_TABLES.md`. The main
structural problem is that **Phases 3–10 are reference boards** (many objects on
one sheet, each a few dozen pixels) rather than exported sprites. Separating
them into individual files does not add the missing detail. They are reference
material, and production art is needed.

**Search for higher-resolution sources (done; none found):**
- The Phase 1 "clean high-resolution" sheet holds the buildings at the same
  size as the v2 sprites.
- No pack contains bed, table, chair, cupboard or other furniture art except as
  ~20 px objects inside the 141 px interior panel.

## Runtime audit (what the game loads)

| category | pass | review | fail | note |
|---|---|---|---|---|
| characters | 16 | 0 | 0 | Player frames are fine. |
| props (Phase 1/2) | 34 | 0 | 0 | Fine. |
| Phase 4 decorations | 0 | 0 | 7 | Board cut-outs, enlarged 2×. |
| interior props (new) | 3 | 1 | 0 | The workbench is 0.71: drawn large on purpose. |
| trees | 0 | 9 | 2 | Soft only at the closest zoom. |
| ground textures | 0 | 15 | 2 | Soft only at the closest zoom. |
| crops | 0 | 53 | 6 | |
| buildings | 0 | 0 | 32 | Phase 1 L1 sprites are 0.4–0.6. Phase 4 L2/L3 and construction cut-outs are 0.15–0.3. |
| animals | 0 | 6 | 48 | Board cut-outs, enlarged 3×. |
| icons | 0 | 10 | 23 | Product and feed icons, enlarged 3×. |

The four `interior.*` panels are still in the manifest as the "before"
reference, but the game no longer loads them (`loaded = no`).

## Corrected: cottage interior (highest impact)

**Before:** one 141 px concept panel, enlarged 3× to 423 px and stretched over
a 576 px room. At the closest zoom it needs about 1440 device px, so the ratio
was 0.12, and it was visibly blurry at every zoom.

**After:** the room is built from separate layers, all drawn with the overhead
camera kept:

| layer | how | file |
|---|---|---|
| Wooden plank floor (per-plank colour, grain, knots, joints, nails, wear) | Painted procedurally at the device resolution in use (1×–3×), so there is no stretching. | `src/render/interiorArt.js` |
| Back wall: plaster, timber posts, rail, two windows with curtains and sills, jar shelf | same | same |
| Side and front wall tops, door gap with threshold and mat | same; the front wall is drawn over the player | same |
| Woven rug with border and medallion | same | same |
| Window light shafts, contact shadows, warm vignette | same | same |
| Bed, dresser, nightstand, table (runner, bowl, plates, candle), two chairs | One canvas per piece, y-sorted with the player | same |
| Workbench, barrel, water barrel, two crates | **Crisp Phase 1/2 sprites at native resolution.** The outdoor grass and sand base is keyed out, with no resampling. | `assets/derived/interior/*.png` (`tools/import_assets.py --interior`) |
| Potted plant | Crisp `foliage.bush_flowering` set into a painted pot | — |

**Updated mappings:**
- `src/data/interiors.js` now describes the room in tiles: walls, door,
  windows, rug, and pieces with collision footprints. It no longer points at a
  sprite.
- Manifest keys added:
  - `interior_prop.workbench`
  - `interior_prop.barrel`
  - `interior_prop.water_barrel`
  - `interior_prop.crate`

**Validation:**
- Screenshots at phone landscape (762×352 @2.6, room at 0.41×), phone portrait
  (390×844 @3) and the closest zoom (1920×1080 @2, room at 1.25×, painted at
  2.5×).
- No page errors.
- E2E playthrough: 236/236 checks pass, including entering the cottage,
  sleeping in the bed and leaving.
- Touch tests: 23/23.
- Unit tests: all pass.
- Scale matches outdoors: the player is the same size and the barrels and
  crates are the same art. See `indoor_outdoor_*.jpg`.
- The 1:1 device-pixel crop in `interior_before_after_detail.jpg` shows the
  difference directly.

**Honest limit:** the furniture is crisp but simpler than the hand-painted
outdoor art (flatter shading, less texture). It is an **interim**
implementation. It is better than a blurry concept, but it is not final art.
The layered structure is ready: a painted bed, table, chairs or dresser can
replace each painter function one by one, without touching layout or
collisions.

## Record of recreated / re-derived assets

| asset | source | action | checked |
|---|---|---|---|
| interior floor, walls, rug, light | — | new, procedural (painted at display resolution) | ✔ screenshots at 3 resolutions |
| bed, dresser, nightstand, table, chairs | — | new, procedural (**interim**) | ✔ |
| `interior_prop.barrel` 148×189 | `phase2/terrain/barrel.png` | grass base keyed out, native size | ✔ ratio 1.12 |
| `interior_prop.crate` 172×193 | `phase2/terrain/wooden_crate.png` | same | ✔ 1.11 |
| `interior_prop.water_barrel` 144×199 | `phase1/buildings/water_barrel.png` | grass and sand base keyed out | ✔ 1.03 |
| `interior_prop.workbench` 287×233 | `phase1/buildings/workbench.png` | same (one small yellow flower remains at the right leg) | ✔ 0.71 (review) |

No asset was upscaled or sharpened in this pass.

## Unresolved (needs new art; no adequate source exists in the packs)

1. **Buildings.** The Phase 1 L1 sprites are about 420 px; they need about
   1024 px for the closest zoom (0.4–0.6 now). The Phase 4 L2/L3, construction,
   coop and barn sprites are 110–220 px effective (0.15–0.3). These are the
   most visible soft assets outdoors.
2. **Animals:** chicken, cow and sheep, 9 frames each. The sources are ~40 px
   board cut-outs; each frame needs ≥ 168 px.
3. **Product and feed icons.** The sources are ~25 px; they need 128–256 px.
4. **Phase 4 decorations:** scarecrow, bench, crates, hay, lantern, trough.
   These are board cut-outs at 0.3–0.5.
5. **Interior furniture**, to replace the interim painted pieces: bed, table,
   chair, dresser and nightstand, each at ≥ 2.5× its drawn size (bed ≥ 300×540,
   table ≥ 300×250).
6. **Other interiors.** Tool shed, barn and coop interiors only exist as 140 px
   panels. They are not used in game yet.
7. **Trees and terrain stamps** are review (0.6–0.8). They are acceptable at
   normal zoom and slightly soft at the closest.
8. **Phases 6–10** are boards and mock-ups. Each feature in those phases will
   need exported sprites at the standards above before it is built.

`docs/ART_REQUESTS.md` lists the requested exports.
