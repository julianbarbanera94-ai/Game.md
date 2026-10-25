# Farmstead — Implementation Status

## Fix round: mobile controls (after first APK test)

Reported on a phone, in landscape: (1) the cottage is blurry; (2) controls sit too high; (3) buttons only worked while A was held; (4) none of the pause-menu buttons worked.

| Problem | Cause | Fix | Verified by |
|---|---|---|---|
| Menu / shop / hotbar buttons dead during play | Browsers only create a `click` for a single-finger tap. The left thumb is nearly always on the stick, so taps from the other thumb produced pointer events but no click (reproduced in emulated multi-touch) | `src/input/buttons.js` fires the click on pointerup and swallows the browser's own click, so a dialog it opens isn't closed again by that click | `npm run test:touch` (held-stick taps on menu, save, sound, resume, hotbar; single-finger menu stays open) |
| A needed holding | A tap that arrived during the 0.4 s action animation, or just before a target was in reach, was dropped | Taps are buffered for 0.5 s and fire as soon as they can | `test:touch`: three quick taps on A till, plant and water a plot |
| "New game" silently did nothing when a save existed | The Android WebView blocks `window.confirm()` | Replaced with an in-game dialog | `test:touch` |
| Controls too high in landscape | Fixed 110 px offsets meant for portrait | Short-screen layout: stick and A hug the bottom corners, one quest shown, smaller hotbar and prompt | `test:touch` (positions and no overlap) |
| Cottage blurry | The only source is a 141×142 px board panel, enlarged | Whole room now fits above the HUD at no more than 1.25× zoom (smaller is sharper), plus unsharp-masked enlargement. **Still soft: it needs a real export, see `docs/ART_REQUESTS.md`** | screenshots |

Tests: `npm test` 26/26 · `npm run test:e2e` 125/125 · `npm run test:touch` 15/15.

## Milestone 2 — Phase 4: buildings & expansion

| Feature | Where | Verified by |
|---|---|---|
| Building levels 1–3 for the cottage, well, workshop (tool shed), market stall and storage shed, each with a gameplay effect | `data/buildings.js`, `systems/buildings.js` | unit + e2e |
| Effects: bag 16/24/32 slots; well auto-waters (north bed, then all plots) every 6:00 AM; can holds 10/25/40, and at level 3 waters 3 plots in a row; market +10%/+25% sell prices; shed stores 12/24/36 kinds of items | same | unit (each effect) + e2e (workshop) |
| Construction over game time with stage sprites, a progress bar and "ready at" times; builders keep working while you sleep | `systems/buildings.js`, `render/renderer.js` | unit + e2e |
| Building planner at the workbench (or workshop): upgrade preview (current → next sprite), cost, effect, lock reason | `ui/panels.js` | e2e + screenshots |
| Placement mode for the storage shed and 7 decorations: ghost sprite, green/red footprint, blocked on paths, garden, creek, doors and colliders; E/A to place, Esc/Cancel to abort | `game.js` | e2e (valid spot, blocks movement) |
| Storage shed: move items between bag and shed, validated both ways | `systems/storage.js` | unit + e2e |
| Walk-in cottage interior (bed = sleep, door = leave) | `data/interiors.js` | e2e |
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
