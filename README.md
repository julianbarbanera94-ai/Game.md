# Park Pals

A top-down, Pokémon-style free-roam game for toddlers, starring Mickey and friends.

## Play
- **Android:** install `ParkPals.apk` (allow "install unknown apps" when asked). It runs offline.
- **Browser:** open `index.html` on any phone, tablet or computer.

## How to play
- Pick a friend (Mickey, Minnie, Donald, Goofy or Pluto). The others wander around the park.
- **Joystick** (or arrow keys / WASD) to walk. **B** (or X) to hop and spin.
- **A** (or Z / Enter) to do things. A green **A** marker shows what's nearby:
  pick flowers in the garden, pop party balloons, talk to friends, ring Mickey's doorbell,
  check the mailbox, make a wish at the fountain, get ice cream, eat party cake and picnic cookies,
  shake apple trees, build a sand castle, kick the ball, quack with the ducks, splash in the pond, read signs.
- Walk through **tall grass** and little animals pop out (🐰🦋🐞🐸🐿️…). Collect ⭐ stars around the park.
- 🔄 changes character, 🔊 mutes. Progress counters are saved on the device.

All art and sound are drawn/generated in code, with no external files.

## Rebuilding the APK
`android/build.sh` packages `index.html` into a WebView app using Apktool and uber-apk-signer
(downloaded automatically; no Android SDK needed). It needs Java and writes `ParkPals.apk`.
The APK is signed with a debug key, which is fine for installing on your own devices.
