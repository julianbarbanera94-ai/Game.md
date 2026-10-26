// Vehicles and machinery (Phase 6). Distances are world pixels (64 px = 1 tile),
// times are real seconds. Until dedicated art exists they are painted in code
// (src/render/vehicleArt.js).

export const VEHICLES = {
  tractor_small: {
    id: 'tractor_small', name: 'Small Tractor', cost: 1500, level: 3,
    blurb: 'A sturdy little tractor for the home fields. Works 2 tiles wide.',
    maxSpeed: 250, maxReverse: 110, accel: 360, brake: 640, turnRate: 1.9,
    fuelCap: 40, fuelPerSec: 0.1, wearPerSec: 0.035,
    half: 26, length: 92, width: 58, workWidth: 2, color: '#3f8f3a',
  },
  tractor_large: {
    id: 'tractor_large', name: 'Large Tractor', cost: 4200, level: 5,
    blurb: 'Faster, with a bigger tank. Works 3 tiles wide.',
    maxSpeed: 310, maxReverse: 130, accel: 420, brake: 720, turnRate: 1.7,
    fuelCap: 70, fuelPerSec: 0.14, wearPerSec: 0.04,
    half: 32, length: 116, width: 72, workWidth: 3, color: '#b5382b',
  },
};

// Front-mounted implements work the plots in front of the tractor while engaged.
export const IMPLEMENTS = {
  plough: { id: 'plough', name: 'Plough', cost: 600, slot: 'front', action: 'till', blurb: 'Tills the soil it passes over.' },
  seeder: { id: 'seeder', name: 'Seeder', cost: 700, slot: 'front', action: 'plant', blurb: 'Plants your selected seed in tilled soil.' },
  sprayer: { id: 'sprayer', name: 'Sprayer', cost: 500, slot: 'front', action: 'water', blurb: 'Waters planted crops without a can.' },
  reaper: { id: 'reaper', name: 'Reaper', cost: 800, slot: 'front', action: 'harvest', blurb: 'Harvests ripe crops into a trailer or your bag.' },
  crop_trailer: { id: 'crop_trailer', name: 'Crop Trailer', cost: 450, slot: 'rear', action: null, capacity: 80, blurb: 'Carries up to 80 harvested crops behind the tractor.' },
};

export const UPGRADES = [
  { name: 'Tuned engine', cost: 400, speed: 1.12, tank: 1.15 },
  { name: 'Heavy-duty engine', cost: 900, speed: 1.25, tank: 1.35 },
];

export const MAX_VEHICLES = 3;
export const GARAGE_FUEL_PRICE = 2; // coins per fuel unit at the garage
export const FIELD_FUEL_PRICE = 4; // coins per unit from a jerry can in the field
export const REPAIR_PRICE = 1.2; // coins per condition point
export const WORK_FUEL_FACTOR = 0.45; // extra fuel burned while an implement is working
export const LOW_CONDITION = 30; // below this the machine slows down
export const PARK_OFFSET = 1.9; // tiles below the garage where vehicles are parked
