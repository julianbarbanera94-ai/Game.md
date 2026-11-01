# AGENTS.md: ParkPals

Working rules for AI agents and contributors in this repository.
Follow the user's latest instruction over this file.

## What this app is
- ParkPals: a top-down Pokémon-style park game for 3–4 year olds, with Mickey and friends.
- The whole game is one file: `index.html` (HTML, CSS, JavaScript and drawing code, no image or audio files).
- Packaged for Android with a WebView wrapper built by `android/build.sh` into `ParkPals.apk`. Not Capacitor.
- Controls: on-screen joystick, A and B buttons, tap to walk, and keyboard for desktop testing.

## Where things live
- `index.html`: all game code. Sections run in this order: CSS, HTML overlays, sound, characters, world builders, things and critters, rooms, mini games, Game Station, Search & find, quests, music, stickers, actions, update, render, test hooks (`window.__park`).
- `android/build.sh`: builds `ParkPals.apk` from `index.html` (Apktool and uber-apk-signer, downloaded on first run).
- `android/app/`: manifest, `apktool.yml` (version numbers), icons, and the `MainActivity.smali` WebView wrapper.
- `ParkPals.apk`: the latest built app, committed so it can be shared.
- `README.md`: user-facing feature list. Add a section for each release.

## Versions
- `android/app/apktool.yml` (`versionCode` and `versionName`) and the top section of `README.md` must match on every release.
- Bump `versionCode` by one for every APK you give the user, so updates install over the old version.
- Keep the signing key constant. The debug key lets updates install over earlier builds; never change it.

## Git workflow
- Work on the designated branch for this session (`ccr-be401acc-9n6jbo`). Do not commit directly to `main`.
- Never force-push, rewrite history, or delete another branch's work.
- Commit and push only when the user asks, or as the session requires. Open a pull request only when the user asks.
- Do not merge to `main` without explicit approval.
- Write commit messages in plain words describing what changed for the player.

## Making changes
- Keep changes focused. Match the existing style in `index.html`: short functions, the same helpers (`ell`, `rbox`, `poly`, `line`, `say`, `bubble`, `burst`), and the same naming.
- Draw everything in code. Do not add image files, emoji-as-art, or icons for things that already have a drawn version in the world.
- Every new thing a child can use needs: a drawn look, a short spoken line via `say()`, and a sticker or counter where it fits.
- Keep the game readable without reading. Use pictures and sounds first; text is extra.
- Keep secrets out of the repo. Keystores and `local.properties` are git-ignored; record variable names only, never values.

## Design principles (3–4 year olds)
- **No failure.** Nothing a child does should lose progress or end in a "game over". Give a gentle reply instead.
- **Big and simple.** Large targets (at least 44 px), one action per screen, and clear pictures instead of small text.
- **Thumb first.** Put the main action where one thumb reaches: the A and B buttons.
- **Direct and immediate.** Tap or walk into a thing, and it reacts at once with sound and movement.
- **Offline by default.** Everything must work with no network. Save progress on the device only.
- **Calm and kind.** No loud or fast flashing motion. Respect reduced-motion and keep sounds short and friendly.
- **Mickey and friends stay true.** Characters match the reference art and speak in their own voices.

## Verification
- There are no test or lint scripts. Do not invent commands.
- Minimum check before reporting work done: state what was run.
  - Local: open `index.html` in a headless browser at phone size (412×870) and landscape (870×400), play the changed part, and check the browser console for errors.
  - Build: run `bash android/build.sh` and confirm `ParkPals.apk` is produced.
  - Install check: not run unless the user has a device to test on. Say so.
- Report only checks that were actually run, and say which were not.

## Working style
- Think smarter, not longer. Answer simple questions directly.
- Lead with the answer. Don't restate the question or list options you won't pursue.
- Limits:
  - Simple questions: under 5 lines.
  - Recommendations: at most 3 options, with one clear pick.
  - Small changes: a short summary, not a long report.
- Verify only the assumption that matters most. Once confident, stop checking.
- Use credit-heavy actions only when they change the outcome: subagents, reading whole large files when a search would do, repeated builds, extended web searches.
- Act directly on small, reversible changes. Ask first before anything that deletes, merges, pushes to a shared branch, publishes, or costs money.

## Documentation
- Record each release in `README.md`. Do not add template or process documents to the repo unless asked.

## Open items for the owner
- Confirm whether a Google TV version will be made. If so, it needs its own layout rules.
- Confirm whether `README.md` should keep being updated for every APK build.
