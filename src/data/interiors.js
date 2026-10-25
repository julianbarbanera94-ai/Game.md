// Interior scenes. Coordinates are fractions of the interior image so they
// stay correct if the art is re-exported at another resolution.
export const INTERIORS = {
  house: {
    id: 'house',
    name: 'Cottage',
    sprite: 'interior.house',
    widthTiles: 9,
    // walkable floor (feet), then furniture blocks
    bounds: [0.1, 0.2, 0.72, 0.9],
    colliders: [
      [0.07, 0.08, 0.25, 0.52], // cabinets and shelves
      [0.07, 0.55, 0.27, 0.84], // bed
      [0.27, 0.35, 0.61, 0.5], // table and chairs
      [0.34, 0.15, 0.59, 0.3], // fruit crate
    ],
    interactables: [
      { kind: 'bed', at: [0.31, 0.7] },
      { kind: 'exit', at: [0.45, 0.88] },
    ],
    spawn: [0.45, 0.84],
  },
};
