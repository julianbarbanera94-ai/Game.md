import { SPECIES } from '../data/animals.js';

// Which sprite to show for a wandering animal. The Phase 5 panel has 5 frames
// facing the camera (d0-d4) and 4 facing away (u0-u3); there are no true
// side-on walk cycles, so sideways movement uses the turned-head frames and a
// small hop animation stands in for steps.
export function animalFrame(speciesId, ac) {
  const sp = SPECIES[speciesId];
  const key = (f) => `animal.${speciesId}_${f}`;
  const step = Math.floor(ac.t * 4);
  if (ac.facing === 'up') return { key: key(ac.moving ? `u${step % 4}` : 'u0'), flip: false };
  if (ac.facing === 'down') return { key: key(ac.moving ? `d${step % 2}` : 'd0'), flip: false };
  const frame = sp.side[ac.facing];
  return { key: key(frame), flip: ac.facing === 'left' && sp.side.left === sp.side.right };
}

export const ANIMAL_KEYS = Object.keys(SPECIES).flatMap((id) => [
  ...[0, 1, 2, 3, 4].map((i) => `animal.${id}_d${i}`),
  ...[0, 1, 2, 3].map((i) => `animal.${id}_u${i}`),
]);

export const ANIMAL_ICON_KEYS = [
  'icon.product_egg', 'icon.product_milk', 'icon.product_wool', 'icon.feed_chicken', 'icon.feed_hay',
];
