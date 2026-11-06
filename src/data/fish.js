// Fish you can hook from the creek banks with a fishing rod. Each fish is also
// an item (category 'fish') so it can be sold, carried and saved like produce.
// `seasons` lists where it bites (0 spring, 1 summer, 2 autumn, 3 winter);
// `dawn` and `dusk` weights are multiplied when it is early or late in the day.

export const FISH = {
  perch: { id: 'perch', name: 'Perch', sellPrice: 22, weight: 5, seasons: [0, 1, 2, 3], dusk: 1.4, icon: 'icon.fish_perch' },
  carp: { id: 'carp', name: 'Carp', sellPrice: 30, weight: 4, seasons: [0, 1, 2], dawn: 1.3, icon: 'icon.fish_carp' },
  trout: { id: 'trout', name: 'Trout', sellPrice: 52, weight: 2, seasons: [0, 2], dawn: 1.8, icon: 'icon.fish_trout' },
  bass: { id: 'bass', name: 'Largemouth Bass', sellPrice: 44, weight: 2, seasons: [1], dusk: 1.8, icon: 'icon.fish_bass' },
  pike: { id: 'pike', name: 'Pike', sellPrice: 88, weight: 0.6, seasons: [2, 3], dawn: 1.5, dusk: 1.5, icon: 'icon.fish_pike' },
};

export const FISH_LIST = Object.values(FISH);

// Rod and bite timing (seconds).
export const BITE_WAIT = [3, 9]; // a random wait after the line is cast
export const HOOK_WINDOW = 1.6; // press Action within this time once the float dips
