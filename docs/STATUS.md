# Farmstead — Implementation Status

## Milestone 3 — Phase 5: livestock (chickens, cows, sheep)

| Feature | Where | Verified by |
|---|---|---|
| Chicken coop and barn: placeable via the planner, built over game time, 3 levels each (capacity 4/8/12 and 3/6/10) | `data/buildings.js` | unit + e2e |
| Fenced pasture under each building with a walk-in gate; animals wander inside it | `systems/pasture.js`, `world/animalActors.js` | unit (stay inside the fence) + e2e |
| Buy animals (right building, capacity, coins), sell back for half, with a confirm tap | `systems/animals.js`, livestock panel | unit + e2e |
| Feeding: chicken feed / hay bought at the market (unlocked by owning the building); one tap feeds every hungry animal in that pasture; a feeding lasts one game day | same | unit + e2e |
| Production only while fed; happy animals produce 25% faster; up to 3 products wait on each animal; collecting never duplicates; a full bag leaves the product on the animal | same | unit |
| In-world prompts and bubbles: product ready / hungry; tap to collect, feed or pet | `game.js`, `render/renderer.js` | e2e + screenshots |
| Eggs, milk and wool sell at the market | `data/items.js` | e2e |
| Quests: A Home for Hens → First Hens → Egg Money → Room for Cattle → Fresh Milk → Something Woolly | `data/quests.js` | unit + e2e |
| Save v3 (migration from v2); invalid or over-capacity animals are dropped on load | `systems/save.js` | unit + e2e |

Tests: `npm test` 41/41 · `npm run test:e2e` 231/231 · `npm run test:touch` 23/23.

Art: animals, products, feed and the coop/barn are temporary cut-outs from the Phase 4/5 reference panels (animals about 40 px tall natively). The coop art has hens painted into it. See `docs/ART_REQUESTS.md`.


## Fix round: mobile controls (after first APK test)

Reported on a phone, in landscape: (1) the cottage is blurry; (2) controls sit too high; (3) buttons only worked while A was held; (4) none of the pause-menu buttons worked.

| Problem | Cause | Fix | Verified by |
|---|---|---|---|
| Menu / shop / hotbar buttons dead during play | Browsers only create a `click` for a single-finger tap. The left thumb is nearly always on the stick, so taps from the other thumb produced pointer events but no click (reproduced in emulated multi-touch) | `src/input/buttons.js` fires the click on pointerup and swallows the browser's own click, so a dialog it opens isn't closed again by that click | `npm run test:touch` (held-stick taps on menu, save, sound, resume, hotbar; single-finger menu stays open) |
| A needed holding | A tap that arrived during the 0.4 s action animation, or just before a target was in reach, was dropped | Taps are buffered for 0.5 s and fire as soon as they can | `test:touch`: three quick taps on A till, plant and water a plot |
| "New game" silently did nothing when a save existed | The Android WebView blocks `window.confirm()` | Replaced with an in-game dialog | `test:touch` |
| Controls too high in landscape | Fixed 110 px offsets meant for portrait | Short-screen layout: stick and A hug the bottom corners, one quest shown, smaller hotbar and prompt | `test:touch` (positions and no overlap) |
| Cottage blurry | The only source is a 141×142 px board panel, enlarged | Whole room now fits above the HUD at no more than 1.25× zoom (smaller is sharper), plus unsharp-masked enlargement. **Still soft: it needs a real export, see `docs/ART_REQUESTS.md`** | screenshots |

### Saving on the phone
Reported: "I also can't save". What I found and changed:
- Likely cause of the report: the **Save game** button was one of the dead buttons (second-finger taps, fixed above).
- A second trap: if the browser's storage was blocked, the game silently fell back to saving in memory — it said "saved" and lost everything on restart. Now the game warns at start ("Saving is unavailable") instead.
- Every save is **read back and compared**; a storage that drops or truncates the write is reported as a failed save (unit-tested).
- The pause menu shows **"Saved ✓ Day N, time"** (or the error) right where you tapped.
- **Android app:** saves go to the app's own file storage (`window.AndroidStorage`, `SharedPreferences.commit()` — synchronous, so on disk before the call returns) instead of relying on WebView localStorage; an older localStorage save is copied across on first run. The app also saves when it is paused/backgrounded, and the page saves on `pagehide`.
- Not verified on a device: the Java side compiles only on GitHub Actions and I can't run the APK here. The JavaScript side was tested against a stand-in for the bridge (save → restart → Continue restores progress; page hidden saves).

Tests: `npm test` 27/27 · `npm run test:e2e` 125/125 · `npm run test:touch` 23/23.

## Milestone 2 — Phase 4: buildings & expansion

| Feature | Where | Verified by |
|---|---|---|
| Building levels 1–3 for the cottage, well, workshop (tool shed), market stall and storage shed, each with a gameplay effect | `data/buildings.js`, `systems/buildings.js` | unit + e2e |
| Effects: bag 16/24/32 slots; well auto-waters (north bed, then all plots) every 6:00 AM; can holds 10/25/40, and at level 3 waters 3 plots in a row; market +10%/+25% sell prices; shed stores 12/24/36 kinds of items | same | unit (each effect) + e2e (workshop) |
| Construction over game time with stage sprites, a progress bar and "ready at" times; builders keep working while you sleep | `systems/buildings.js`, `render/renderer.js` | unit + e2e |
| Building planner at the workbench (or workshop): upgrade preview (current → next sprite), cost, effect, lock reason | `ui/panels.js` | e2e + screenshots |
| Placement mode for the storage shed and 7 decorations: ghost sprite, green/red footprint, blocked on paths, garden, creek, doors and colliders; E/A to place, Esc/Cancel to abort | `game.js` | e2e (valid spot, blocks movement) |
| Storage shed: move items between bag and shed, validated both ways | `systems/storage.js` | unit + e2e |
| Walk-in cottage interior built from crisp layers (bed = sleep, door = leave) | `data/interiors.js`, `render/interiorArt.js` | e2e, screenshots in `audit/` |
| Quests: Storage Solutions, Home Improvements | `data/quests.js` | unit + e2e |
| Save v2 + migration from v1 saves; corrupt building data is rejected | `systems/save.js` | unit |
| Android APK: WebView wrapper (`android/`) built by GitHub Actions | `.github/workflows/android.yml` | see below |

Tests: `npm test` **26/26** · `npm run test:e2e` **125/125** checks, no page errors.

APK: this cloud environment can't reach `dl.google.com` (Android SDK and Google Maven), so the APK is built on GitHub Actions. Each push publishes `farmstead-debug.apk` to the `android-latest` pre-release.

Known gaps: building art is low-resolution cut-outs (see `ASSETS.md`); there is only one interior; no barn/coop yet (they need livestock, Phase 5); no free terrain-expansion plots beyond the south bed; decorations can't be moved or sold back yet.


## Milestone 1 — Playable foundation (this branch)

### Starting audit
- The repository contained only `CLAUDE_IMPLEMENTATION_PROMPT.md`, which is for a different project ("Wildcard" battle UI). It was left untouched. There was no existing engine, code or asset pipeline.
- **Stack chosen:** browser game, vanilla ES modules + Canvas 2D, DOM HUD, no build step and no runtime dependencies. This fits the design doc's desktop + mobile target and lets the supplied PNG art be used directly.
- Phase packs reviewed: 1 (starter), 2 (character/terrain), 3 (farming references; crops pulled forward, see `ASSETS.md`). Phases 4–10 were only listed, not processed.

### Implemented and verified
| Feature | Where | Verified by |
|---|---|---|
| Top-down world with painted ground (texture-splatted from supplied tiles), paths, creek, bridge | `render/terrain.js` | screenshots |
| Y-sorted sprites (player passes behind trees/buildings) | `render/renderer.js` | screenshots |
| Player movement, 4-direction walk animation, smooth clamped camera | `game.js`, `world/camera.js` | e2e |
| Collision: buildings, fence (with gate), trees, rocks, creek (bridge crossing), world bounds | `world/layout.js`, `world/collision.js` | e2e (cottage blocks the player; fence routing) |
| Contextual interaction + prompt + target highlight | `game.js` | e2e |
| Farming loop: till → plant → water → grow (moisture-gated, shared clock) → harvest | `systems/farming.js` | unit + e2e |
| Visible plot states: untilled (pale), tilled, wet (darkened), 5 growth stages, ready | `render/sprites.js` | screenshots |
| Inventory with stack/slot limits; no negative or duplicate items | `systems/inventory.js` | unit + e2e |
| Market stall: sell produce, buy seeds, locked stock explains its requirement, double-tap guard | `systems/economy.js`, `ui/panels.js` | unit + e2e |
| Watering can capacity + refill at well/barrel | `systems/farming.js` | unit + e2e |
| Day clock, sleep at cottage (crops grow overnight), day/night lighting | `systems/time.js`, `simulation.js` | unit + e2e |
| Data-driven quests from real events; explicit, once-only reward claim | `data/quests.js`, `systems/quests.js` | unit + e2e |
| Progression: seed unlocks gated by quests; garden expansion (land, 250c, needs a quest + coins); watering-can upgrade | `data/progression.js` | unit + e2e (locked state) |
| Save/load: versioned, validated/sanitised, autosave (sleep, quest, upgrade, market close, 60 s, tab hidden) + manual save; title screen Continue/New | `systems/save.js`, `main.js` | unit + e2e (reload restores everything) |
| HUD: day/time, coins, quest tracker, hotbar (tools + seeds), toasts; bag, journal, pause menu, controls help | `ui/` | e2e + screenshots |
| Touch controls: virtual stick + action button | `input/input.js`, `styles.css` | mobile screenshot (rendering only; touch input not automated) |
| Audio: Phase 1 placeholder WAVs + synthesized cues, mute toggle saved | `audio/sfx.js` | manual code path only (headless runs are muted) |

### Test results
- `npm test`: **18/18 unit tests pass.**
- `npm run test:e2e`: **77/77 checks pass, with no page errors** (headless Chromium, about 50 s). From a fresh save it covers new game → collision → till/plant/water 4 plots → claim → sleep → harvest (including a no-duplication check) → refill → sell → claim → buy (double-click buys once) → claim → locked land panel → manual save → reload → Continue (coins, inventory, plots, quests and position all restored) → evening lighting → mobile layout. Screenshots: `docs/screenshots/`.
- Bugs the e2e run found and fixed: a shop double-click could buy twice (panel re-render reset the per-button guard), and pressing Enter after Esc could activate a stale focused shop button.

### Known gaps / next steps
- **Art:** the crop/soil sprites and icons are temporary slices from Phase 3 boards. The player is missing an idle-left frame, full walk cycles and directional action frames; there is no vertical fence piece and no NPC sprites (see `ASSETS.md`).
- **Not built yet:** animals, vehicles, village/NPCs, building upgrades beyond the two listed above, crafting, a map screen, weather/seasons, music.
- Audio levels: only a mute toggle exists; separate music/SFX sliders are still to do.
- Real-device performance hasn't been measured. Headless Chromium renders at 60 fps with under 1 ms per frame at 1280×800.

### Recommended next phase
**Phase 4 — Buildings & expansion.** It builds on the upgrade/land system that now exists (cottage, well, tool shed and market stall upgrade levels, plus construction stages). It also needs production sprites, because Phase 4 contains reference boards only. In parallel, request isolated crop sprites to replace the temporary Phase 3 slices.

## Clearing land

Trees, bushes, boulders, stumps, logs and old barrels/crates inside the map border can be cleared for coins (tree 60, boulder 40, stump 25, log 30, bush 20, barrel/crate 10): walk up, press A, confirm. The outer ring of trees stays. Placing a building on a blocked spot says exactly why (edge of the map, path, garden, creek, a tree/rock to clear, a door too close, you standing in it), outlines the blocking objects in red, and slides to the nearest valid spot within ~2 tiles. Tests: `tests/e2e/building_after_clearing.mjs` clears scenery and builds a scarecrow, shed, coop and barn in the freed spots. Saved as `cleared` (save v4, v3 saves migrate). Tests: `tests/unit/clearing.test.mjs`, `npm run test:clearing`.

## Phase 7: village, villagers, requests and shops

- **The road east.** The map is now 64 tiles wide. A fallen tree blocks the road at the east end of the farm; after "Market Day" a work crew clears it for 150 coins (quest "The Road East"). A forest wall keeps the rest of the border closed.
- **Willowmere** (tiles x 36-62): cobbled square with a well, notice board, benches and lanterns (they light up at night), General Store, Smithy, Carpenter, Inn and two market stalls. *Buildings reuse existing farm sprites as stand-ins.*
- **Five villagers** (Mara the shopkeeper, Bram the blacksmith, Odette the innkeeper, Tobias the trader, Wren the resident) with daily schedules (shops open and close, Wren wanders between waypoints, doors say "closed - back around ..." when they are away), `?`/`!` markers over their heads, and numbered dialogue choices (tap or press 1-9). *They use the player sprite recoloured per villager, with a name tag, until NPC art is supplied.*
- **Friendship**: +3 for the first chat each day, +points for deliveries. Levels Stranger, Acquaintance, Friend, Close friend give shop discounts and warmer chat.
- **General Store**: limited daily stock of seeds and feed, friendship discount. **Tobias**: pays 15% extra for the first 8 of each product per day.
- **Delivery requests**: new ones are posted every morning on the notice board (max 4 open, carry max 3), with a deadline and a reward in coins and friendship. Accept, bring the goods, talk to the villager who asked. Progress is the real inventory; each request pays once.
- **Quests** (from real events): The Road East, Willowmere, Meet the Shopkeeper, Special Delivery, Good Neighbour.
- **Save v5**: friendships, requests, today's shop state, road and visit flags; v4 saves migrate; everything is validated on load.
- Tests: `tests/unit/village.test.mjs` (schedules, friendship, shops, requests, quests, save), `npm run test:village` (43 checks: road, walking in, dialogue, buying, requests, trader, night, reload).
- Not yet: shop interiors, villager gifts, seasonal stalls, NPC walking art, sound for the village.

## Phase 8: quests, progression and unlocks

- **Journal** (Journal button or J): Quests with Active / Available / Done filters, quest kinds (main story, farming, building, livestock, neighbours, delivery, exploration, seasonal), objective bars, accept / put down / claim; **Achievements** with progress bars and one-time claims; **Progress** (the unlock tree by track: Farming, Livestock, Buildings, Exploration, Community) with what each locked item needs.
- **Optional side quests** are offered, not forced (accept, put down, claim). One repeatable quest returns every 3 days.
- **Experience and farm levels** (10 levels): quests and achievements give XP, level-ups pay coins, level can gate unlocks.
- **Achievements** (14) driven by real event counters, claimed once.
- **Land**: a second purchasable field, the North Field (+8 plots, 600 coins, after the south bed). Locked plots say what they need.
- **Notifications**: toasts for objective progress, quest accepted/complete, new unlocks (announced once), achievements, level-ups, festivals.
- **Seasons** on the game clock (4 x 28 days, not real dates) with a light colour grade, and four festivals (Spring Festival, Summer Fair, Autumn Harvest, Winter Market): each starts a seasonal quest, lapses if unfinished, returns next year, and gives the trader +10% while it lasts.
- **Save v6**: XP, counters, achievements, announced unlocks, quest repeat/season data; v5 saves migrate silently (nothing old is re-announced). All validated on load.
- Tests: `tests/unit/progression.test.mjs` (13), `npm run test:progression` (50 checks through the real UI).
- Not yet: machinery/vehicle unlocks (Phase 6), real artwork for quest icons and reward screens, seasonal decorations (only a colour grade today).

## Phase 6: vehicles and machinery

- **Garage** (placeable building, farm level 3, 500 coins): buy tractors, implements and a trailer; refuel (2 coins/unit), repair, fit engine upgrades (+speed, +tank), tow vehicles home. Holds 3 machines.
- **Tractors**: Small (level 3, 1500) and Large (level 5, 4200, faster, 3 tiles wide). Arcade driving: W/S throttle and reverse, A/D steer (stick on touch), speed limits, slower on grass and soft soil, solid collisions (trees, buildings, creek), crash damage and wear.
- **Fuel and condition**: tank empties while driving (and faster while working); empty means no movement, with a warning; a jerry can in the field costs 4/unit; worn machines slow down but never stall.
- **Implements** (front): Plough (tills), Seeder (plants from your seeds), Sprayer (waters, no can), Reaper (harvests). **Crop trailer** (rear, 80 crops): the reaper fills it; unload into the bag at the tractor.
- **Controls**: E / A toggles the implement; F or the Get off button leaves (only when nearly stopped); on touch the joystick is throttle + steering. HUD shows fuel, condition, speed, implement and trailer.
- The garden is fenced, so machine work happens in the **North Field**.
- **Quests** (A Place for Machines, Horsepower, Take It for a Spin, Ploughing Day, Bringing in the Harvest) and achievements (Gearhead, Mechanised) from real events.
- **Save v7**: vehicles, mounts, cargo, owned implements (validated; you always load standing outside).
- Vehicle artwork: tractors, plough, seeder and crop trailer use the supplied **Vehicle Angles Pack** (south view, rotated to the heading; low-res crops enlarged 2x, so soft). Sprayer and reaper are still painted in code (`src/render/vehicleArt.js`).
- Tests: `tests/unit/vehicles.test.mjs` (16), `npm run test:vehicles` (48 checks).

## Sprinklers

- Unlocks at **farm level 2** (shown in the Progress tree and announced). Build one from the planner
  (Build & decorate) for 150 coins.
- It may stand on the garden's paths (never on a plot). It keeps every planted, growing plot within about
  2 tiles each way watered, all day, while the clock runs, including overnight. One on the path between the
  two beds, near the middle, waters all 16 garden plots. The placement preview shows its square and the
  plots it will reach.
- Spinning water jets run each morning (6:00-6:30) and whenever it waters a dry plot. It can be moved or
  picked up like other decorations, and it is saved with the farm.
- The sprite is painted in code (`tools/paint_sprinkler.mjs`); a hand-painted one is on the art list.
- Tests: `tests/unit/sprinklers.test.mjs` (4), `npm run test:sprinklers` (13 checks).
- Rain and sprinklers now water at the start of every clock step, so a long skip (sleeping) grows crops
  that were dry when it began.

## Phase 10: polish, animation and validation

Full report: `docs/RELEASE_REPORT.md`. In short: original music, ambience and effects with separate volumes;
rain and snow days (rain waters crops); celebration, construction, exhaust, feeding and petting effects;
running; carry pose; gamepad support with menu navigation; vibration (native bridge on Android); logo,
app icons, title and loading screens rendered from the game's own art; faster ground drawing; lossless
WebP sprites and a slimmer APK. Tests: `tests/unit/weather.test.mjs`, `npm run test:polish` (29 checks).
Not release-ready: real-device performance, NPC/vehicle art and composed audio are still to do.

## Phase 9: core gameplay integration

Checked the whole loop against the Phase 9 hand-off and filled the gaps:

- **World map** (M key or the Map button): the real painted world drawn small, with labels, you, villagers, vehicles, placed buildings and padlocks on the road, North Field and South bed until they open. Small screens show only the main labels.
- **Bag** has category tabs (All, Seeds, Produce, Animal goods) with sell values, and a **Farmer** tab: farm level and XP, equipment (can, bag, vehicles, implements), records (harvests, sales, deliveries, quests, gifts) and friendship with each villager.
- **Gifts**: "Here's a gift for you." in villager dialogue. Produce and animal goods only, one per villager per day; each villager has two favourites (+8 friendship, others +3). Saved; counts toward a records counter.
- **Settings** (pause menu): sound on/off, volume, camera distance (Close / Normal / Far) and large touch controls. Saved with the game and validated on load.
- **Load last save** in the pause menu (asks first). **Backup save**: the previous save is kept; if the latest one is damaged (a cut-off write), Continue loads the backup and says so on the title screen and in game.
- Phone layout: the four HUD buttons stack in a column on narrow portrait screens.
- Shared state: inventory, coins, plots, animals, vehicles, buildings, quests, unlocks, friendships, requests, time and settings all live in the one `state` object; every system reads and writes it, and the save is that object.
- No duplicates: unit tests prove quest and achievement rewards, deliveries, land unlocks, implements, clearing, animal collection and gifts can only happen once, and refused purchases change nothing. Panel buttons also ignore a second tap within 350 ms.
- Tests: `tests/unit/integration.test.mjs` (8), `npm run test:integration` (45 checks). One fresh save goes through every loop step: move and collide, till/plant/water/grow/harvest by hand, sell and buy, unlock land, build a coop and a garage, buy, feed and collect from a hen, buy a tractor and plough and plough the North Field, open the road, take a request, deliver it, give a gift, and use the map, farmer sheet and settings. Then it saves, reloads and checks that all of it comes back, tests Load last save, and checks recovery from a damaged save.

Known gaps (not built in this phase):
- **Crafting** (fences, gates, hay bales on the reference board) is not implemented. There are no wood, stone or nail resources and no art for crafted goods. The design says to add crafting only where it enriches progression, and decorations are already bought in the planner.
- No health or energy bars: the design has no stamina system, so the reference board's 100/100 bars were left out.
- Equipment is shown, not swapped: tools upgrade through buildings (workshop = bigger can) rather than gear slots.
- Villager portraits are letter badges and villagers are recoloured farmer sprites until NPC art exists.
- The integration test sets up a mid-game purse and some quest states to reach the later systems quickly. Each system's requirements are walked through step by step in its own suite (playthrough, village, progression, vehicles).

## Placing and moving buildings

- Buildings can now be placed right up to the playable edge of the map (the old one-tile margin is gone); only a footprint hanging over the edge is refused.
- **Move structures**: the Storage Shed, Coop/Barn and Garage panels have "Move this building" (free, finished buildings only); decorations offer Move or Pick up (refunds half). Animals come out inside the new pasture.

## Asset audit

See `docs/audit/ASSET_AUDIT.md`: every image in the ten packs measured against resolution standards; the cottage interior was rebuilt from layers; remaining soft assets (buildings, animals, icons, decorations) need new exports.
