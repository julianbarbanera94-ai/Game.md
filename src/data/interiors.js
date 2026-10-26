// Interior scenes, built from separate layers instead of one painted image:
// the floor, walls, rug and window light are painted procedurally at render
// resolution (src/render/interiorArt.js), furniture pieces are drawn as
// separate y-sorted objects, and props use crisp sprites at native size.
// All coordinates are in tiles inside the room (origin top-left).
//
// piece: { kind, x, y, w, h } — the drawn rectangle; `foot` is the collision
// rectangle [x0, y0, x1, y1] in tiles (defaults to the lower part of the piece).
export const INTERIORS = {
  house: {
    id: 'house',
    name: 'Cottage',
    widthTiles: 9,
    heightTiles: 9,
    wall: { back: 1.55, side: 0.45, front: 0.55 },
    door: [3.95, 5.05], // gap in the front wall (x range)
    windows: [[1.9, 3.2], [5.8, 7.1]], // back-wall windows (x ranges)
    rug: [3.2, 5.25, 5.85, 7.55],
    pieces: [
      { kind: 'dresser', x: 0.6, y: 0.95, w: 1.9, h: 1.35, foot: [0.6, 1.4, 2.5, 2.3] },
      { kind: 'nightstand', x: 0.62, y: 3.55, w: 0.85, h: 0.95, foot: [0.62, 3.8, 1.47, 4.5] },
      { kind: 'bed', x: 0.6, y: 4.45, w: 1.9, h: 3.35, foot: [0.6, 4.6, 2.5, 7.8] },
      { kind: 'table', x: 3.55, y: 3.0, w: 1.9, h: 1.55, foot: [3.55, 3.4, 5.45, 4.55] },
      { kind: 'chair', x: 2.9, y: 3.3, w: 0.75, h: 0.95, side: 'left', foot: [2.95, 3.75, 3.6, 4.25] },
      { kind: 'chair', x: 5.35, y: 3.3, w: 0.75, h: 0.95, side: 'right', foot: [5.4, 3.75, 6.05, 4.25] },
      { kind: 'sprite', sprite: 'interior_prop.workbench', x: 6.0, y: 0.75, w: 2.5, foot: [6.05, 1.4, 8.45, 2.35] },
      { kind: 'sprite', sprite: 'interior_prop.barrel', x: 7.75, y: 3.2, w: 0.8, foot: [7.75, 3.75, 8.55, 4.2] },
      { kind: 'sprite', sprite: 'interior_prop.water_barrel', x: 7.7, y: 4.4, w: 0.85, foot: [7.7, 5.0, 8.55, 5.55] },
      { kind: 'sprite', sprite: 'interior_prop.crate', x: 7.55, y: 6.6, w: 0.95, foot: [7.55, 7.2, 8.5, 7.7] },
      { kind: 'sprite', sprite: 'interior_prop.crate', x: 6.75, y: 7.05, w: 0.8, foot: [6.75, 7.55, 7.55, 7.95] },
      { kind: 'plant', sprite: 'foliage.bush_flowering', x: 2.75, y: 7.2, w: 0.9, foot: [2.85, 7.6, 3.55, 7.95] },
    ],
    interactables: [
      { kind: 'bed', at: [2.85, 6.1] },
      { kind: 'exit', at: [4.5, 8.55] },
    ],
    spawn: [4.5, 8.1],
  },
};
