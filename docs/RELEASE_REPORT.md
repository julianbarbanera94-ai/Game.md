# Farmstead — Phase 10 report (polish, animation, validation)

Build: Android debug APK `0.3.0` (versionCode 3) from the `android-latest` pre-release. This is a test build,
**not a store-ready release**: see "Not release-ready yet" below.

## What Phase 10 added

**Audio** (all original, synthesised by `tools/make_audio.py`, Ogg Vorbis, 0.9 MB total)
- Two looping music tracks (farm, village) that crossfade as you walk between them; farm birdsong and wind;
  rain ambience on rainy days; nothing outdoors while you are inside.
- Tractor engine loop whose pitch and volume follow the throttle; stops when you get off.
- New cues: confirm, cancel, unlock, level-up fanfare, construction hammering, tilling, implement clunk,
  door creak, chicken, cow and sheep voices (feeding, petting, collecting).
- Settings: Sound on/off plus separate **Music**, **Ambience** and **Effects** volumes; audio pauses when
  the app goes to the background.

**Effects and weather**
- Stars and an expanding ring for level-ups and unlocks; stars on quest completion; dust and sparkle when a
  building finishes; exhaust puffs from tractors; grain when feeding; hearts when petting.
- **Rain days** (about 1 in 4 spring days, 1 in 8 summer, 1 in 3 autumn, never in winter, never on the first two
  days): rain streaks and splashes, overcast light, rain sounds, "Rain" on the clock, and the rain waters every
  planted crop. **Snow** on some winter days (looks only). Weather comes from the day number, so it needs no
  save data and is the same after reloading.

**Animation and feel**
- Checked every player frame: all share the same canvas, baseline and centre, so walking and actions do not
  jitter or shift. The unused "carry" frame is now the pose for collecting eggs, milk and wool.
- **Running**: Shift, the gamepad's right trigger, or the touch stick pushed to its rim (1.55x speed, faster steps).
- Getting into a tractor starts the engine with a puff of smoke; lowering/raising implements and attaching
  them clunk.

**Input**
- **Gamepad** (standard mapping, browser Gamepad API): stick/d-pad move, A act, B back / get off, X bag,
  Y journal, View map, Start menu, LB/RB hotbar, RT run. In menus and the title screen the d-pad moves a
  visible focus and A presses; left/right adjust sliders.
- **Vibration** (Settings, on by default): short buzzes on harvest, level-up and tractor bumps. The Android app
  uses a native bridge (`AndroidHaptics`, VIBRATE permission) because WebViews ignore `navigator.vibrate`.

**Launch art** (`tools/make_branding.mjs`, rendered in the game's own renderer from the hand-painted sprites)
- Logo: the "Farmstead" sign made of the wooden-bridge planks with the game's bushes and flowers.
- App icon: the cottage, path and blossom tree. Android launcher icons (rounded and round) for every density,
  Play Store icon 512x512, web favicon/touch icon.
- Title screen and loading screen use the logo; `launch/` holds 1920x1080 title and loading art and the
  1024 icon master. Android 12+ splash uses the round icon on the game's forest green.
- The reference board's logo/icon (about 200 px) were too small to use without blurring, so they were not used.

**Performance**
- The ground layer is now drawn with bilinear filtering (it is already built at screen resolution): frame cost
  dropped from 43 to 27 ms on the throttled phone profile and from 8.1 to 5.3 ms on desktop.
- 241 sprites re-encoded as **lossless WebP** (42.7 MB to 31.2 MB); every visible pixel was checked identical.
- The APK only bundles assets the game uses (manifest entries plus files named in HTML/CSS/code): the web
  payload went from about 56 MB to 35 MB.

## Tests run (all passing on the pushed commit)

| Suite | Result |
|---|---|
| Unit tests `npm test` | 97 passed |
| Playthrough `npm run test:e2e` | 236 checks |
| Integration (fresh save through the whole loop, save/load, recovery) `npm run test:integration` | 45 checks |
| Polish (audio channels, weather, running, gamepad, vibration, effects, launch art) `npm run test:polish` | 29 checks |
| Vehicles `npm run test:vehicles` | 48 checks |
| Village `npm run test:village` | 43 checks |
| Progression `npm run test:progression` | 50 checks |
| Touch controls `npm run test:touch` | 23 checks |
| Clearing and building `npm run test:clearing` | 10 + 11 checks |

Also checked by screenshots: phone portrait and landscape HUD, map, settings and title; desktop title, loading,
rain, level-up.

## Performance measurements (emulated, `node tools/perf.mjs`)

Headless Chromium on the build machine, **software rendering (no GPU)**. These are not phone measurements.

| Profile | Load | First download | Decoded images | update+render avg / p95 | Frame rate |
|---|---|---|---|---|---|
| Desktop 1280x800 | 1.1 s | 24.3 MB | 75 MB + 28 MB ground | 5.3 / 6.8 ms | 60 fps |
| Phone 844x390 @2.75x, CPU slowed 4x | 5.4 s | 24.4 MB | 75 MB + 40 MB ground | 27.2 / 32.8 ms | 23 fps |

Almost all of the phone-profile frame time is copying the ground layer to the screen, which a phone's GPU does
far faster than this software renderer. Real-device numbers still need to be taken (see below).

## Not release-ready yet (known issues and gaps)

- **Not measured on a real phone.** Frame rate, memory and load time above are emulated.
- **Art still needing production work** (see `docs/ART_REQUESTS.md`): villagers are recoloured farmer
  sprites with letter-badge portraits; village buildings reuse farm sprites; vehicle sprites are small crops
  enlarged 2x (soft); sprayer and reaper are drawn in code; many buildings/animals/icons are upscaled exports
  (`hires-upscaled`) rather than repainted.
- **Audio is functional placeholder quality**: synthesised, not composed or recorded. Animal voices are rough.
  Any file can be replaced under the same manifest key.
- **No crafting system** and no health/energy (see Phase 9 notes); no horse riding (reference board) and no
  8-direction or separate run frames: running reuses the walk frames faster.
- Gamepad support was tested with a simulated pad in the browser, not with physical controllers on Android.
- Debug-signed APK; a release keystore, store listing text and screenshots are still needed for a store.

## How to regenerate assets

```
python3 tools/make_audio.py          # music, ambience, effects
PORT=8123 node scripts/serve.mjs &   # then:
node tools/make_branding.mjs         # logo, icon master, title/loading art -> launch/
python3 tools/make_icons.py          # Android icons, store icon, in-game logo/loading backdrop
python3 tools/webp_assets.py         # lossless WebP for large sprites
node tools/perf.mjs                  # performance probe
```
