// Crop definitions. growMinutes = game minutes of *watered* growth needed.
// Sprite keys map to assets/derived/phase3/plots/<crop>_<stage>.png.
export const CROPS = {
  carrot: { id: 'carrot', name: 'Carrot', growMinutes: 240, yield: 1, seedPrice: 10, sellPrice: 22 },
  lettuce: { id: 'lettuce', name: 'Lettuce', growMinutes: 360, yield: 1, seedPrice: 15, sellPrice: 34 },
  potato: { id: 'potato', name: 'Potato', growMinutes: 480, yield: 2, seedPrice: 20, sellPrice: 24 },
  tomato: { id: 'tomato', name: 'Tomato', growMinutes: 600, yield: 2, seedPrice: 30, sellPrice: 38 },
  strawberry: { id: 'strawberry', name: 'Strawberry', growMinutes: 720, yield: 3, seedPrice: 45, sellPrice: 30 },
  pumpkin: { id: 'pumpkin', name: 'Pumpkin', growMinutes: 1080, yield: 1, seedPrice: 60, sellPrice: 160 },
  corn: { id: 'corn', name: 'Corn', growMinutes: 900, yield: 2, seedPrice: 40, sellPrice: 48 },
  wheat: { id: 'wheat', name: 'Wheat', growMinutes: 540, yield: 2, seedPrice: 25, sellPrice: 30 },
};

// Visual growth stages, in order. "ready" is the harvestable state.
export const GROWTH_STAGES = ['planted', 'sprout', 'growing1', 'growing2', 'mature'];

// How long one watering keeps soil moist (game minutes).
export const WATER_DURATION = 600;
