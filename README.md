# Park Pals

A top-down, Pokémon-style free-roam game for toddlers, starring Mickey and friends.

## Play
- **Android:** install `ParkPals.apk` (allow "install unknown apps" when asked). It runs offline.
- **Browser:** open `index.html` on any phone, tablet or computer.

## How to play
- Pick a friend (Mickey, Minnie, Donald, Daisy, Goofy or Pluto). The others wander around the park.
- **Joystick** (or arrow keys / WASD) to walk. **B** (or X) to hop and spin.
- **A** (or Z / Enter) to do things. A green **A** marker shows what's nearby:
  pick flowers in the garden, pop party balloons, talk to friends, ring Mickey's doorbell,
  check the mailbox, make a wish at the fountain, get ice cream, eat party cake and picnic cookies,
  shake apple trees, build a sand castle, kick the ball, quack with the ducks, splash in the pond, read signs.
- The park has roads out on all four sides to new areas:
  - **North – Clubhouse Hill:** the Mickey Mouse Clubhouse, its big yellow slide, a trampoline and a hot dog stand.
  - **East – Sunny Beach:** seashells 🐚, crabs, a pier with Donald's boat, a lighthouse, umbrellas and a sand castle.
  - **South – Minnie's Farm:** Minnie's Bow-tique, a barn and animal pen (cow, pig, sheep, chickens, horse), carrots 🥕, pumpkins, a windmill and a scarecrow.
  - **West – Snowy Woods:** falling snow, a slippery frozen lake, sledding, a snowman to build, penguins and an igloo, cocoa and a twinkly tree. Find snowflakes ❄️.
- **Go inside** by walking into the door: the **Clubhouse** (dance party rug, Clubhouse screen, piano, toy box, fridge, cuckoo clock),
  **Minnie's Bow-tique** (wear a bow or a hat, mirror, shop counter) and **Mickey's House** (fireplace, nap in bed, story books, snack table).
  Walk onto the doormat to go back out.
- **Mini games** 🎪: every area has a striped game tent. Press A at it to play (tap the screen, or use A to help):
  🎈 Balloon Pop (park), 🐭 Peekaboo Pals (Clubhouse Hill), 🐚 Beach Catch (Sunny Beach),
  🥕 Feed the Animals (Minnie's Farm) and ⛄ Build a Snowman (Snowy Woods).
  There's no way to lose; finishing gives 3 ⭐ and a "Yay!". A = play again, B or ✖️ = back.
- Walk through **tall grass** and little animals pop out (🐰🦋🐞🐸🐿️…). Collect ⭐ stars around the park.
- 🗺️ opens the Town Map: the whole world, where you are, and where your friends are.
- 🔄 changes character, 🔊 mutes. Progress counters are saved on the device.

All art and sound are drawn/generated in code, with no external files.

## Rebuilding the APK
`android/build.sh` packages `index.html` into a WebView app using Apktool and uber-apk-signer
(downloaded automatically; no Android SDK needed). It needs Java and writes `ParkPals.apk`.
The APK is signed with a debug key, which is fine for installing on your own devices.
