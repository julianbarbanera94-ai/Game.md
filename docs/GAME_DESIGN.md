# FARMSTEAD — Game Design & Implementation Specification

**Document purpose:** The single source of truth for designing, building, integrating and validating Farmstead.  
**Audience:** Claude Code, game developers, artists, animators and designers.  
**Status:** Living specification — update it when a design decision changes.  
**Project type:** Top-down farming, life-simulation and incremental farm-expansion RPG.

---

## 1. High-level vision

Farmstead is a hands-on farming RPG about starting with almost nothing and gradually building a thriving agricultural business and community.

The player begins in a modest home with a small patch of land and a few vegetable plots. They personally perform the work: walk to the field, prepare soil, plant and water crops, return to harvest them, carry or store the produce, take it to market and earn money. Earnings fund better tools, more land, larger buildings, animals and machinery. The world and the player's responsibilities expand over time.

The game combines:
- **Hands-on, character-driven gameplay:** the player moves through the world and performs tasks rather than managing everything from menus.
- **Long-term progression:** each successful activity opens up new opportunities.
- **A connected economy:** crops, animal products, crafted goods, shops, deliveries and upgrades feed into one coherent economy.
- **A warm, inviting world:** detailed illustrated art, a memorable village, NPCs, exploration and optional seasonal activities.
- **Readable, mobile-friendly controls:** simple interaction patterns that work on touchscreens and desktop.

### Design pillars

1. **Do the work; feel the reward.** Important tasks happen in the world, with visible actions and feedback.
2. **Start small; grow meaningfully.** Expansion should change what the player can do, not merely increase numbers.
3. **One coherent world.** Farming, animals, vehicles, shops, quests and construction share the same inventory, currency and world state.
4. **Clear next steps.** Players can always see useful goals without being forced into a rigid path.
5. **Consistent art direction.** Every new asset is compared with the approved original starting-level concept.
6. **Play first, menus second.** UI supports the world; it must not replace the main gameplay.
7. **Progress persists.** The player's effort, purchases and unlocks must survive save/load.

---

## 2. Genre and reference positioning

Farmstead takes broad inspiration from:
- The base-building and gradual expansion loop of village/farm management games.
- The direct character movement and world interaction of top-down creature-adventure RPGs.
- Farming and life-simulation games where crops, animals, relationships and commerce are interconnected.

These are high-level genre references only. Farmstead should have its own identity, art, characters, interface, progression and content. Do not copy proprietary characters, maps, UI, names, assets or distinctive layouts from other games.

---

## 3. Camera, world and visual direction

### Camera — non-negotiable

- Use a **directly overhead/top-down camera**.
- Do **not** use an angled, isometric or three-quarter view.
- The view should feel slightly elevated enough to read characters, crops, buildings and vehicles clearly, but the ground plane and paths should remain viewed from directly above.
- Keep a stable camera angle across the farm, village, fields, interiors and other explorable spaces.
- Camera follow should be smooth but restrained; avoid motion that makes precise interaction difficult.
- Buildings and objects must be designed to read correctly from this view. Do not use side-view building art placed onto a top-down map.

### Art direction — non-negotiable

Use the approved original starting-level concept image as the benchmark for every asset and screen.

- Rich, detailed, hand-painted 2D illustration.
- Warm, natural, inviting colours with nuanced texture.
- Consistent light direction, shadow softness, object scale, outline treatment and detail density.
- Distinctive silhouettes for buildings, crops, tools, vehicles and animals.
- Clear visual hierarchy: interactive objects should be recognisable without looking like generic icons.
- Maintain a cohesive style across environment art, characters, buildings, UI, effects and promotional assets.
- Avoid flat geometric placeholders, generic vector clip-art, mismatched asset packs and simplistic shapes that do not match the reference.
- Avoid mixing different camera perspectives or inconsistent lighting.
- Any temporary placeholder must be clearly identified and replaced or explicitly approved before release.

### Asset handling

- Reference sheets and catalog panels are **art-direction references**, not finished game assets.
- Do not place an entire reference board or catalog panel into the game.
- Convert required elements into individually named assets with transparent backgrounds where appropriate.
- Use sprite sheets/atlases for animation when supported by the project's engine.
- Define each asset's dimensions, anchor/pivot, animation frames, collision footprint and intended in-game scale.
- Keep source artwork separate from exported runtime assets.
- Use clear file names and a manifest for each asset family.
- Check each asset in the actual game camera and at actual runtime scale before approval.

### Visual consistency review

Before adding or changing a visual, compare it against:
1. The approved starting-level concept image.
2. Previously approved assets in the same category.
3. The asset's actual appearance in the game scene.

Reject or revise assets with inconsistent camera angle, lighting, proportions, palette, texture density, outline or shadow direction.

---

## 4. Player fantasy and game world

The player is a new farmer establishing a life in a rural region. The farm is the main home base, while the village provides commerce, relationships, quests and access to new services.

### Core locations

- **Starter farm:** small house, garden plots, storage, a simple path and a little room to expand.
- **Fields:** progressively larger plots, crop rows, irrigation or watering points and machinery access.
- **Farm buildings:** tool shed, barn, chicken coop, storage, workshop and later specialist facilities.
- **Village:** general store, market, specialist shops, community spaces and NPC homes.
- **Animal areas:** pens, coops, barns, pasture and feeding stations.
- **Exploration areas:** woodland, riverside, orchard, hills and other unlockable regions as supported by the world design.
- **Interiors:** entered buildings should have useful interactions and readable layouts, not be decorative dead ends.

Keep the initial world compact and legible. Unlock additional areas progressively rather than exposing every system immediately.

---

## 5. Core gameplay loop

### Minute-to-minute loop

1. Move around the farm.
2. Identify a task through the world or task tracker.
3. Interact with a crop, tool, animal, building, NPC or vehicle.
4. Perform the task using a short action, animation, timed interaction or small sequence.
5. Receive clear feedback and update the world.
6. Collect the resulting item, currency or progress.
7. Choose the next task.

### Daily/medium loop

1. Check crop readiness, animal needs, inventory and active objectives.
2. Complete farming and animal-care tasks.
3. Collect or process products.
4. Visit the village or market to sell goods and buy supplies.
5. Complete deliveries or NPC requests.
6. Invest earnings in tools, buildings, upgrades or land.
7. Save progress and continue later.

### Long-term loop

**Grow → harvest → sell → earn → invest → expand → unlock → repeat with new opportunities.**

Expansion should introduce new decisions and activities: more crop varieties, animal care, production chains, machinery, larger fields, additional NPCs, specialist shops and new land.

---

## 6. Starting experience and onboarding

The opening should be calm, clear and immediately playable.

### Starting state

- A modest starter house.
- A small usable garden/field.
- A limited amount of currency.
- A basic tool set.
- A nearby storage point or simple inventory.
- A small number of seeds.
- One nearby NPC or tutorial prompt to introduce the first objective.

### Suggested opening sequence

1. Show the farm and player in the normal gameplay camera.
2. Briefly explain movement and interaction without a long text wall.
3. Direct the player to prepare a small plot.
4. Plant seeds and water the plot.
5. Explain that crops grow over game time.
6. Harvest the crop when ready.
7. Take produce to the market or shop and sell it.
8. Use earnings to buy more seeds or a useful starter upgrade.
9. Introduce the first expansion objective.
10. Save automatically at appropriate milestones, while still allowing manual save if supported.

Tutorial prompts should be dismissible or unobtrusive after the player understands the action. Avoid forcing repeated tutorial text on returning players.

---

## 7. Progression and expansion

Progression should be driven by a combination of money, resources, completed objectives and reputation. Do not use money as the only gate for every system.

### Example progression tiers

**Tier 1 — Starter plot**
- Small house and garden.
- Basic hand tools.
- A few easy crops.
- Sell produce locally.
- Learn movement, planting, watering, harvesting and inventory.

**Tier 2 — Growing farm**
- Purchase or unlock more garden space.
- Add storage and a tool shed.
- Unlock more crop varieties.
- Access basic deliveries and NPC requests.

**Tier 3 — Established farm**
- Upgrade the house and farm buildings.
- Add chicken coop or another starter livestock building.
- Collect animal products.
- Unlock a larger field and better tools.

**Tier 4 — Working agricultural business**
- Add a barn, workshop and larger fields.
- Acquire a first vehicle or useful machinery.
- Introduce machinery-based field work.
- Expand sales and delivery opportunities.

**Tier 5 — Diversified farm**
- Add additional livestock, orchards or production buildings.
- Process raw goods into higher-value products where supported.
- Unlock more village services and distant areas.

**Tier 6 — Regional farm enterprise**
- Large-scale farming and multiple production chains.
- Advanced machinery and storage.
- Larger orders, specialist quests and community projects.
- Cosmetic customisation and optional endgame goals.

These are a design framework, not a fixed balance table. The actual costs, timings and unlock requirements must be tuned in playtests.

### Progression rules

- Every purchase must have a visible cost and a clear result.
- Locked content must explain its requirements.
- Unlocks should be saved and restored correctly.
- New tiers should add meaningful gameplay, not just bigger numbers.
- Early-game tasks should be short and forgiving.
- Avoid requiring real-world waiting for essential progress unless intentionally chosen and clearly communicated.
- Provide multiple useful activities so players are not forced to wait on a single crop timer.
- Avoid pay-to-win assumptions; monetisation, if ever added, requires a separate design decision.

---

## 8. Farming system

### Crop lifecycle

Each crop plot should support appropriate states:
1. Untilled soil.
2. Tilled/ready soil.
3. Seed planted.
4. Growing stages.
5. Ready to harvest.
6. Harvested/empty or ready for replanting.

Watering, weather, crop type, game time and any chosen seasonal rules may affect growth. Keep rules understandable and consistent.

### Required interactions

- Approach a plot.
- Receive a contextual action prompt.
- Use a suitable tool or action.
- Change the plot state visibly.
- Consume seeds or other required inventory items.
- Advance growth according to game time.
- Harvest only when eligible.
- Add yield to inventory or storage.
- Update quest objectives and achievements when relevant.

### Farming quality requirements

- Different crop types should have distinct silhouettes, growth stages and yields.
- Tool use should have clear animation and feedback.
- The system must prevent planting when the plot is invalid or the player lacks seeds.
- Harvesting must not duplicate products.
- Crop state must persist through save/load.
- Large fields should remain performant.
- Machinery should interact with compatible plots through the same underlying crop-state model rather than a separate fake system.

---

## 9. Livestock and animal care

Animals are interactive world entities, not menu-only resources.

### Core actions

- Approach and interact.
- Feed or care for the animal.
- Inspect basic status where appropriate.
- Collect available products.
- Store or sell products.
- Upgrade housing or capacity as progression permits.

Animal types may include chickens, cows, sheep and other species appropriate to the chosen art and content direction.

### Rules

- Each animal needs persistent identity and state.
- Product generation must follow understandable rules and must not duplicate on reload.
- Care should matter without becoming punitive or excessively repetitive.
- Animals should have appropriate idle and movement animations.
- Animal interactions should trigger relevant quest, inventory and economy events.

---

## 10. Vehicles and machinery

Machinery should feel like a useful extension of hands-on farming, not a decorative object or a teleporting tool.

### Core behaviour

- Approach a vehicle and show an interaction prompt.
- Enter the vehicle with a clear transition.
- Change movement/control mode while driving.
- Show appropriate vehicle feedback and tool/implement state.
- Allow the player to exit safely.
- Use compatible implements to perform supported field actions.
- Reflect changes in the actual world state.
- Save ownership and relevant vehicle state.

### Design requirements

- Vehicle movement must respect world boundaries and collisions.
- Turning and movement should feel controllable at the chosen top-down camera angle.
- The vehicle sprite, wheel placement, attachments and shadow must match the approved design.
- Do not show a machine harvesting if the underlying crop state does not change.
- Avoid claiming realistic simulation if the actual handling is simplified arcade-style; communicate the intended feel through the game design.

---

## 11. Inventory, storage and crafting

Use a single consistent item model across farming, animals, shops, quests and crafting.

### Inventory requirements

- Item identifier, display name, icon, category, quantity and stack rules.
- Clear distinction between seeds, crops, animal products, tools, building materials, crafted goods and quest items.
- Add/remove operations with validation.
- Storage containers where supported.
- Feedback when inventory is full or an action cannot be completed.
- No negative quantities, accidental duplication or silent item loss.

### Crafting/processing

Add only where it enriches the progression. Processing stations should have clear input requirements, processing time or interaction steps, outputs and costs. Crafting and processing should use the same shared inventory and persistence systems.

---

## 12. Economy, shops and deliveries

### Economy principles

- Players earn currency by selling goods, completing deliveries and selected quests.
- Players spend currency on seeds, tools, feed, buildings, upgrades, land and machinery.
- Each item has a defined sell price and, where appropriate, purchase price.
- Prices should be tuned so the first expansion feels achievable without trivialising later progression.
- Avoid arbitrary price changes that make previously useful activities worthless without explanation.

### Transactions

- Show price, quantity and total before confirmation where appropriate.
- Validate funds and inventory before committing a transaction.
- Apply the transaction atomically: do not charge money without granting the item or remove an item without paying the correct amount.
- Prevent double purchases from repeated taps.
- Persist balances and transaction results.
- Provide readable success and failure feedback.

### Deliveries

- Show requested items, quantities, deadline if used, reward and destination.
- Track delivery progress from actual inventory/world events.
- Prevent reward duplication.
- Allow a clear completion and reward-claim state.

---

## 13. Village, NPCs and relationships

NPCs make the world feel lived in and connect players to the economy and quest system.

### NPC interactions

- Approach and interact.
- Display a dialogue or action interface.
- Offer relevant services, shops, requests or story beats.
- Update quests and relationship state where applicable.
- Provide an exit/back action that reliably returns to gameplay.

NPCs should have distinct silhouettes, names, roles and dialogue tone. Avoid using the same character asset for every person without intentional variation.

Relationships should be optional and supportive, not a blocker to basic farming progression unless a specific quest deliberately requires an interaction.

---

## 14. Quest and objective system

Use data-driven quest definitions rather than hard-coding each quest into UI logic.

Each quest should define:
- Unique ID.
- Title and description.
- Quest giver or source.
- Prerequisites.
- Objectives and progress.
- Availability and repeatability.
- Rewards.
- Completion and claim state.

### Objective event types

Examples include:
- Plant, water or harvest a crop.
- Collect a quantity of an item.
- Sell products.
- Feed an animal or collect its product.
- Build or upgrade a structure.
- Operate machinery.
- Visit a location.
- Talk to an NPC.
- Deliver goods.
- Unlock a plot of land.

The quest UI must read the same state as the actual game. Do not simulate progress in the UI without a real gameplay event.

---

## 15. Buildings, construction and land expansion

Buildings and land are visible changes to the world.

### Building rules

- Show the building, cost and prerequisites before purchase.
- Validate placement and collisions.
- Provide a clear placement/confirmation flow if free placement is supported.
- Update the world only after a successful transaction.
- Allow upgrades to change the building's appearance or functionality where appropriate.
- Persist ownership, placement, level and relevant contents.

### Land expansion

- Locked land should be visible or discoverable where practical.
- Display requirements and cost.
- Unlocking must update the playable map and save state.
- Avoid unreachable unlocks caused by circular requirements.
- Expansion should create room for new activities, not only extra empty ground.

---

## 16. World navigation and map

- Keep the camera top-down and consistent.
- Use readable paths, field boundaries, fences and natural landmarks.
- Provide collision boundaries that match visible objects reasonably closely.
- Keep the player from walking through solid buildings or large obstacles.
- Show exits and transitions clearly.
- Provide a map or navigation aid once the world is large enough to need it.
- New areas should unlock progressively and be connected logically.
- Avoid disconnected scenery that looks explorable but has no interaction or navigation purpose.

---

## 17. Controls and accessibility

### Desktop baseline

- Keyboard movement.
- One primary interaction action.
- Contextual tool/action input.
- Clear inventory, map, quest and pause/settings access.
- Rebindable controls where feasible.

### Mobile baseline

- Comfortable virtual movement control or equivalent touch scheme.
- Context-sensitive action button.
- UI targets large enough for touch.
- Controls positioned away from critical status information and common screen edges.
- Support common portrait/landscape decisions based on the actual game layout; do not assume both without testing.
- Prevent accidental repeated purchases or destructive actions from multi-touch.

### Accessibility and usability

- Readable text and strong contrast.
- Do not rely on colour alone to communicate status.
- Clear error messages and interaction prompts.
- Adjustable audio levels and mute.
- Respect reduced-motion preferences where practical.
- Pause behaviour must be predictable.

---

## 18. UI and HUD

The UI should feel premium, warm, readable and unobtrusive, supporting the illustrated world rather than competing with it.

### HUD priorities

Show only information useful during movement:
- Currency.
- Day/time or relevant world status if implemented.
- Current task/quest summary.
- Contextual interaction prompt.
- Selected tool or action if relevant.
- Inventory or quick-access entry points.

### Full-screen interfaces

- Inventory and storage.
- Quest log.
- Map.
- Shops and selling.
- Building upgrades and land purchase.
- Crafting/processing.
- Settings and save/load status.

### UI rules

- Consistent spacing, typography, icons and interaction states.
- Buttons must work and show feedback.
- Include loading, empty, locked, insufficient-resource and error states.
- Avoid covering the character or key gameplay areas unnecessarily.
- Make sure menus can be closed and return the player to the previous context.
- Build functional UI components; do not use a screenshot of a UI as the interface.

---

## 19. Audio and feedback

Use properly licensed, original or otherwise permitted audio. Do not assume reference artwork includes actual sound files.

Suggested categories:
- Ambient countryside and village sounds.
- Music that can be muted or adjusted.
- UI click, confirm, cancel and error cues.
- Tool, tilling, watering and harvesting sounds.
- Animal sounds.
- Vehicle engine and machinery sounds.
- Construction, collection, reward and quest completion cues.

Audio should reinforce actions without becoming repetitive or intrusive. Provide separate volume controls for music and effects where feasible.

---

## 20. Time, weather and seasons

If time, weather and seasons are included, they must use a consistent world simulation.

- Define whether time advances continuously, while playing, or through explicit actions.
- Use one shared time source for crop growth, animal products, shops and timed quests.
- Save the relevant simulation state.
- Weather effects should be visual and gameplay-relevant only where the rules are clearly communicated.
- Seasonal events should not be essential to the core progression unless the game explicitly tells the player.
- Do not make the core game dependent on real-world dates by accident.

---

## 21. Save/load and shared state

Use a coherent, versioned save model. Avoid each feature saving unrelated fragments that can disagree.

### Save data may include

- Save schema version.
- Player position and state.
- Inventory and storage.
- Currency.
- Crop plot states and growth progress.
- Animal state and product availability.
- Owned vehicles and relevant state.
- Buildings, placement, levels and upgrades.
- Unlocked land and regions.
- Active/completed quests and objective progress.
- NPC relationships where implemented.
- World time, weather and season if implemented.
- Settings and audio preferences.

### Reliability requirements

- Save at safe milestones and provide manual save if supported.
- Handle missing, malformed or older save data safely.
- Avoid duplicate reward claims after reload.
- Do not lose currency or inventory during interrupted transactions.
- Provide clear feedback when saving or loading fails.
- Test a save created before an unlock and loaded after restart.

---

## 22. Technical implementation principles for Claude Code

1. Inspect the repository and identify its engine, framework, entry points, asset pipeline and existing architecture.
2. Do not assume a technology stack before inspecting the project.
3. Preserve working systems; do not rewrite the whole project without a demonstrated need.
4. Create a concise implementation plan and identify dependencies before large changes.
5. Use shared models/services for inventory, currency, quests, world state and persistence.
6. Use event-driven updates where appropriate so harvesting, sales and interactions can update quests and achievements consistently.
7. Keep gameplay logic separate from presentation wherever practical.
8. Use data-driven definitions for crops, items, animals, buildings, vehicles, quests and prices.
9. Keep assets named, categorised and documented.
10. Do not introduce paid services or API keys without explicit approval.
11. Do not claim a feature is complete just because a screen or button exists.
12. Test the real running game after each meaningful integration step.
13. Record known gaps, test results and any assets still represented by placeholders.

---

## 23. Testing and acceptance criteria

### Functional checks

- Movement and collision.
- Interactions with objects and NPCs.
- Crop planting, watering, growth and harvesting.
- Inventory add/remove and storage.
- Animal care and product collection.
- Vehicle entry, movement, exit and supported machinery actions.
- Shop purchases and sales.
- Quest progress, completion and reward claims.
- Building purchases/upgrades and land unlocks.
- Save/load and return-to-game behaviour.
- UI navigation, touch controls and keyboard controls.
- Audio settings and mute.
- Error states such as insufficient funds, missing seeds or full inventory.

### Art checks

- Correct overhead camera.
- Matching hand-painted style.
- Consistent scale, shadows, palette and outline treatment.
- Correct sprite anchors and animation alignment.
- No visible seams or mismatched atlas frames.
- Readability at the actual gameplay zoom.
- No reference panels accidentally used as runtime assets.

### Release gates

Do not call the game release-ready until:
- The early-game loop has been completed from a fresh save.
- Meaningful save/load has been verified.
- Transactions and rewards have been checked for duplication.
- High-severity issues in core flows have been resolved.
- Performance has been measured on representative target devices.
- The remaining known issues and unsupported platforms have been documented.

Report what was actually tested. Never invent test results or performance numbers.

---

## 24. Suggested build order

1. Inspect current project and document existing systems.
2. Make movement, camera, collisions and interaction reliable.
3. Connect the shared item/inventory/currency model.
4. Implement the complete starter crop loop.
5. Connect selling and seed purchasing.
6. Implement quests and tutorial objectives using real game events.
7. Add building/land purchase and persistence.
8. Connect animals and product collection.
9. Connect vehicle controls and supported field operations.
10. Connect village NPCs, shops and deliveries.
11. Implement remaining progression and unlocks.
12. Polish animation, effects, UI and audio.
13. Run fresh-save and returning-save regression tests.
14. Complete the visual consistency audit.
15. Produce a final implementation and test report.

Adjust this order to the actual repository and dependencies. Do not implement systems already working just to follow the list.

---

## 25. Definition of done

Farmstead is considered ready for a release candidate only when the actual game—not just the asset packs—supports a complete, tested loop in which the player can start with a small farm, perform work directly in the world, sell goods, invest earnings, unlock new systems, save progress and return to continue playing.

The visual style must remain consistent with the approved starting-level reference, and the project must include a clear list of verified features, known issues and any remaining production asset work.

**This document is the design source of truth. When an implementation detail conflicts with it, preserve the existing working project where sensible and flag the conflict for a deliberate design decision rather than silently changing the intended game.**
