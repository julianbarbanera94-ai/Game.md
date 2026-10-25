# Farmstead — Implementation Status

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
