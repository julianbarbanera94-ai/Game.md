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
- **Levels:** each tent game has 3 levels (⭐ easy, ⭐⭐ medium, ⭐⭐⭐ a little harder). Nothing is locked; the picker starts on the first level you haven't finished and shows ✅ for finished ones. After a win there is a **▶ Next** button. If a child hasn't tapped for a few seconds, a pointing finger shows what to tap.
- **Mini games** 🎪: every area has a striped game tent. Press A at it to play (tap the screen, or use A to help):
  🎈 Balloon Pop (park), 🐭 Peekaboo Pals (Clubhouse Hill), 🐚 Beach Catch (Sunny Beach),
  🥕 Feed the Animals (Minnie's Farm) and ⛄ Build a Snowman (Snowy Woods).
  There's no way to lose; finishing gives 3 ⭐ and a "Yay!". A = play again, B or ✖️ = back.
- **Game Station** 🎮 next to Mickey's House in the park, with five more games:
  👗 Dress Up (hats, glasses, bows, things to hold; 📸 takes a photo and the hat stays on in the park),
  🎨 Coloring, 🃏 Memory Match (3 pairs of friends), 🎵 Follow the Star (xylophone) and 🔢 Count with Me.
- **Tap the screen** to walk somewhere, or tap a thing to walk over and use it (A still works too).
- **Search & find** 🔍: the card in the top-left corner shows a drawing of something in the world (the windmill, the lighthouse, a tent…, 40 in all). Go and find it; it stays the same until you do. Tap the card for an arrow. Each find is a sticker.
- **Little things to do:** swings, a bubble machine, a bench and a bird bath (park), a drum stage and a flower clock (Clubhouse Hill), a kite and a lifeguard tower (beach), a tractor and a wishing well (farm), a snow bell, ice fishing and a snow-angel spot (Snowy Woods).
- The top bar shows only the find card, your stars, the map and a ☰ menu (stickers, change friend, sound, grown-up settings and all your counters).
- **Dress up for real** in Minnie's Bow-tique (or the Game Station): drawn hats, glasses, bows and pearls, capes, tutus, vests and shoe colors, each in 7 colors, plus a 🎲 surprise outfit. Outfits stay on in the world.
- **Music** 🎵: every area (and the buildings) has its own little tune. ⚙️ has sliders for music and sounds.
- **Sticker book** 📒: finds, critters, friends, helping friends and 🏆 for finishing all three levels of a tent game all become stickers (58 to collect).
- **Help a friend** 🤝: talk to a friend a couple of times and they may ask for help ("I lost my bone!"). They follow you while you look; the pink 🤝 chip and arrow show the way. Finding it gives 5 ⭐ and a gold sticker.
- Walk through **tall grass** and little animals pop out (🐰🦋🐞🐸🐿️…). Collect ⭐ stars around the park.
- 🗺️ opens the Town Map: the whole world, where you are, and where your friends are.
- 🔄 changes character, 🔊 mutes. Progress counters are saved on the device.

All art and sound are drawn/generated in code, with no external files.

## Rebuilding the APK
`android/build.sh` packages `index.html` into a WebView app using Apktool and uber-apk-signer
(downloaded automatically; no Android SDK needed). It needs Java and writes `ParkPals.apk`.
The APK is signed with a debug key, which is fine for installing on your own devices.
