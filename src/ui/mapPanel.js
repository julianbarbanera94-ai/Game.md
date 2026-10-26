import { TILE, WORLD_W, WORLD_H } from '../config.js';
import { BUILDINGS } from '../data/buildings.js';
import { NPCS } from '../data/npcs.js';
import { VEHICLES } from '../data/vehicles.js';
import { NORTH_FIELD } from '../data/world.js';
import { ROAD_GATE } from '../data/village.js';
import { el } from './hud.js';

// World map: the real painted world shrunk to fit, with labels, the player,
// villagers, vehicles and padlocks on anything still locked. Installed onto Panels.

const COLS = WORLD_W / TILE;
const ROWS = WORLD_H / TILE;

// Fixed places (tiles). Placed buildings are labelled from the save.
const PLACES = [
  { name: 'Cottage', x: 17.7, y: 6.6 },
  { name: 'Well', minor: true, x: 12.0, y: 8.4 },
  { name: 'Workshop', minor: true, x: 26.0, y: 8.0 },
  { name: 'Market stall', x: 30.4, y: 9.2 },
  { name: 'Garden', x: 7.0, y: 13.4 },
  { name: 'Creek', x: 27.0, y: 24.0, soft: true },
  { name: 'Willowmere', x: 48.8, y: 4.6, big: true },
  { name: 'General Store', x: 43.4, y: 6.2 },
  { name: 'Notice board', minor: true, x: 46.4, y: 10.0 },
  { name: "Tobias's stall", x: 45.2, y: 13.6 },
  { name: 'Inn', x: 55.4, y: 14.9 },
];

const pct = (x, y) => `left:${(x / COLS) * 100}%;top:${(y / ROWS) * 100}%`;
// labels near the sides grow inwards instead of being cut off
const edge = (x) => (x / COLS < 0.12 ? ' edge-l' : x / COLS > 0.88 ? ' edge-r' : '');

export function mapMarkers(state, npcs = []) {
  const out = [];
  for (const p of PLACES) out.push({ kind: p.big ? 'title' : p.soft ? 'soft' : p.minor ? 'place minor' : 'place', label: p.name, x: p.x, y: p.y });
  for (const rec of state.placed) {
    if (rec.kind !== 'building') continue;
    const def = BUILDINGS[rec.type];
    out.push({ kind: 'place', label: rec.level >= 1 ? def.name : `${def.name} (building)`, x: rec.x, y: rec.y - 2.6 });
  }
  if (!state.flags.roadOpen) out.push({ kind: 'lock', label: 'Fallen tree blocks the road', x: (ROAD_GATE.x0 + ROAD_GATE.x1) / 2, y: (ROAD_GATE.y0 + ROAD_GATE.y1) / 2 });
  if (!state.unlocks.northField) out.push({ kind: 'lock', label: 'North field (locked)', x: (NORTH_FIELD.x0 + NORTH_FIELD.x1) / 2, y: (NORTH_FIELD.y0 + NORTH_FIELD.y1) / 2 });
  if (!state.unlocks.gardenExpansion) out.push({ kind: 'lock', label: 'South bed (locked)', x: 7.0, y: 18.0 });
  for (const v of state.vehicles) {
    if (state.driving === v.uid) continue;
    out.push({ kind: 'vehicle', label: VEHICLES[v.type]?.name || 'Tractor', x: v.x / TILE, y: v.y / TILE });
  }
  for (const n of npcs) out.push({ kind: 'npc', label: NPCS[n.id]?.name || '', x: n.x / TILE, y: n.y / TILE });
  const pl = state.driving ? state.vehicles.find((v) => v.uid === state.driving) : state.player;
  if (state.player.scene === 'farm' && pl) out.push({ kind: 'you', label: 'You', x: pl.x / TILE, y: pl.y / TILE });
  return out;
}

export function installMapPanel(Panels) {
  Panels.prototype.map = function map() {
    const game = this.game;
    const s = game.state;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // as wide as the window allows, but short enough to fit with the legend on a landscape phone
    const cssW = Math.max(240, Math.min(1100, window.innerWidth - 60, (window.innerHeight - 150) * (COLS / ROWS)));
    const canvas = game.renderer.renderMap(game, Math.round(cssW * dpr));
    canvas.className = 'map-canvas';
    const layer = el('div', { class: 'map-layer' },
      mapMarkers(s, game.npcs.list()).map((m) => el('div', { class: `map-mark ${m.kind}${edge(m.x)}`, style: pct(m.x, m.y), title: m.label, 'data-mark': m.kind },
        m.kind === 'lock' ? el('span', { class: 'pin' }, '🔒') : m.kind === 'npc' || m.kind === 'you' || m.kind === 'vehicle' ? el('span', { class: 'dot' }) : null,
        m.kind === 'npc' ? null : el('span', { class: 'lbl' }, m.label))));
    const wrap = el('div', { class: 'map-wrap', style: `max-width:${Math.round(cssW)}px` }, canvas, layer);
    const inside = s.player.scene !== 'farm' ? el('p', { class: 'muted' }, 'You are indoors. The map shows the outdoors.') : null;
    const legend = el('p', { class: 'map-legend muted' },
      el('span', { class: 'key you' }), ' You  ', el('span', { class: 'key npc' }), ' Villager  ', el('span', { class: 'key vehicle' }), ' Vehicle  🔒 Locked');
    // a small map (phones) keeps only the main labels so they do not pile up
    this.show('Map', el('div', { class: `map${cssW < 760 ? ' compact' : ''}` }, inside, wrap, legend), { xwide: true });
  };
}
