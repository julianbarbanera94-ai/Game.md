# Claude implementation prompt — Wildcard battle UI kit

You are updating the existing Wildcard game from the supplied `wildcard-3.18.0.apk` / matching project source. The attached ZIP is a modular battle UI reference kit.

## Non-negotiable constraints
1. The creature artwork is already done. Do not redraw, replace, regenerate, recolour or flatten creature assets into the background.
2. Preserve battle mechanics, encounter logic, creature stats, progression, saves and controller mappings unless a bug is demonstrated and separately approved.
3. Treat `01_REFERENCE_FROM_APK/*_CURRENT_APK.js` as a snapshot of the current implementation. Inspect the actual source project before editing; do not blindly overwrite current files with these snapshots.
4. The SVG files are visual component references. Port them into the current game's actual rendering system rather than assuming the game loads SVGs directly.
5. Do not use the generated reference image as a flattened battle screen or background texture. Keep environment, creature actors, effects and HUD as separate layers.
6. Do not claim a feature is finished or tested unless you built and verified it.

## Desired direction
Create a clean, premium, cinematic creature battle UI:
- The arena and creatures are the focal point.
- Compact dark translucent creature status panels with name, level, portrait slot and HP.
- A simple command bar with Abilities, Tactics, Team and Items.
- Ability cards only appear when the player opens Abilities.
- Target selection is clear but restrained.
- During attack animations, hide or dim command UI.
- Show damage/effectiveness briefly, then return to the next decision state.
- Low health is communicated in the status panel without a distracting full-screen overlay.
- Victory/capture/reward screens use a concise result state.

## Work in stages
### Stage 1 — Audit
- Identify the actual battle renderer, scene/background code, UI drawing functions, state machine and input/controller layer.
- Map the nine example state specifications to existing battle states.
- Report which components can be reused and which functions/files need changes.
- Do not start a destructive refactor before reporting the plan.

### Stage 2 — Component architecture
Implement reusable components equivalent to:
- BattleStatusPanel
- HealthBar
- CommandBar
- AbilityCard
- BattleMessage
- TargetIndicator
- BattleEffectsLayer
Use data-driven state and keep visual rendering separate from battle rules.

### Stage 3 — Scene and HUD
- Preserve current arena rendering and creature actors first.
- Replace the existing command menu and status UI with the new components.
- Ensure the battle environment is not hidden by excess sky, menus or unused space.
- Keep all elements responsive to supported aspect ratios.

### Stage 4 — State-specific presentation
Implement and test:
1. Battle start
2. Command menu
3. Abilities menu
4. Target selected
5. Attack animation
6. Damage result
7. Enemy turn
8. Low health
9. Victory / capture / defeat

### Stage 5 — Input and regression
- Preserve Backbone controller support and existing mappings.
- Keep touch controls usable.
- Ensure focus, confirm, back/cancel and menu navigation work consistently.
- Verify battle start, player turn, enemy turn, damage, status effects, switching, items, capture, flee, victory, defeat and return to exploration.

## Deliverables
- Short audit and implementation plan.
- Files changed with a one-line reason for each.
- Screenshots of the actual running game for each implemented state.
- Build/test outcome and known limitations.
- Any additional assets needed, clearly labelled by file name and intended use.

## Acceptance criteria
- The game still runs and existing creatures render unchanged.
- No combat rules or saved data regressions.
- Components are independently named and replaceable.
- The battle scene is cleaner and less visually busy than the current scene.
- Every state only displays relevant UI.
- No fake screenshots or claims of successful testing.
