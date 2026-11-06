import { TILE, WORLD_W, WORLD_H } from '../config.js';
import { BUILDINGS } from '../data/buildings.js';
import { NPCS } from '../data/npcs.js';
import { VEHICLES } from '../data/vehicles.js';
import { NORTH_FIELD } from '../data/world.js';
import { ROAD_GATE } from '../data/village.js';
import { PARCELS } from '../data/land.js';
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
  for (const p of PARCELS) {
    const cx = p.poly.reduce((n, q) => n + q[0], 0) / p.poly.length, cy = p.poly.reduce((n, q) => n + q[1], 0) / p.poly.length;
    if (!state.unlocks[p.id]) out.push({ kind: 'lock', label: `${p.name} (${p.price.toLocaleString()} coins)`, x: cx, y: cy });
    else if (!p.core) out.push({ kind: 'place', label: p.name, x: cx, y: cy });
  }
  for (const v of state.vehicles) {
    if (state.driving === v.uid) continue;
    out.push({ kind: 'vehicle', label: VEHICLES[v.type]?.name || 'Tractor', x: v.x / TILE, y: v.y / TILE });
  }
  for (const n of npcs) out.push({ kind: 'npc', label: NPCS[n.id]?.name || '', x: n.x / TILE, y: n.y / TILE });
  const pl = state.driving ? state.vehicles.find((v) => v.uid === state.driving) : state.player;
  if (state.player.scene === 'farm' && pl) out.push({ kind: 'you', label: 'You', x: pl.x / TILE, y: pl.y / TILE });
  return out;
}

// Outlines of every parcel on the map picture: dashed and dimmed while for sale,
// a soft gold edge once owned.
function paintParcels(canvas, state) {
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); // renderMap leaves a world-to-map scale on the context
  const k = canvas.width / COLS; // map px per tile
  for (const p of PARCELS) {
    if (p.core) continue;
    const owned = !!state.unlocks[p.id];
    g.beginPath();
    p.poly.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
    g.closePath();
    if (!owned) {
      g.fillStyle = 'rgba(20,28,14,0.34)';
      g.fill();
      g.setLineDash([k * 0.9, k * 0.6]);
      g.lineWidth = Math.max(2, k * 0.22);
      g.strokeStyle = '#ffe39a';
    } else {
      g.setLineDash([]);
      g.lineWidth = Math.max(2, k * 0.16);
      g.strokeStyle = 'rgba(255,227,154,0.8)';
    }
    g.stroke();
    g.setLineDash([]);
  }
}

const Z_MAX = 4;
const BASE_W = 1400; // the map picture's width in map px at zoom 1; its height follows the world
const BASE_H = Math.round(BASE_W * (ROWS / COLS));

export function installMapPanel(Panels) {
  Panels.prototype.map = function map() {
    const game = this.game;
    const s = game.state;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // the window you look through: as large as the screen allows
    const vw = Math.max(240, Math.min(1090, window.innerWidth - 74));
    const vh = Math.max(160, Math.min(window.innerHeight - 150, Math.max(Math.round((vw * ROWS) / COLS * 1.3), Math.min(420, Math.round(window.innerHeight * 0.5)))));
    const compact = vw < 760;
    const canvas = game.renderer.renderMap(game, Math.round(Math.min(BASE_W * 2, BASE_W * Math.min(2, dpr * 1.5))));
    paintParcels(canvas, s);
    canvas.className = 'map-canvas';
    canvas.style.width = `${BASE_W}px`;
    canvas.style.height = `${BASE_H}px`;
    const layer = el('div', { class: 'map-layer', style: `width:${BASE_W}px;height:${BASE_H}px` },
      mapMarkers(s, game.npcs.list()).map((m) => el('div', { class: `map-mark ${m.kind}`, style: pct(m.x, m.y), title: m.label, 'data-mark': m.kind },
        m.kind === 'lock' ? el('span', { class: 'pin' }, '🔒') : m.kind === 'npc' || m.kind === 'you' || m.kind === 'vehicle' ? el('span', { class: 'dot' }) : null,
        m.kind === 'npc' ? null : el('span', { class: 'lbl' }, m.label))));
    const stage = el('div', { class: 'map-stage', style: `width:${BASE_W}px;height:${BASE_H}px` }, canvas, layer);
    const view = el('div', { class: 'map-view', style: `width:${vw}px;height:${vh}px`, tabindex: '0', 'aria-label': 'World map. Drag to move, scroll or pinch to zoom.' }, stage);
    const root = el('div', { class: `map${compact ? ' compact' : ''}` });

    // ---- pan and zoom (a transform on the stage; labels stay the same size)
    const zFit = Math.min(vw / BASE_W, vh / BASE_H);
    let z = zFit, tx = 0, ty = 0;
    const clampPan = () => {
      const w = BASE_W * z, h = BASE_H * z;
      tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tx));
      ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, ty));
    };
    const apply = () => {
      clampPan();
      stage.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
      view.style.setProperty('--inv', String(1 / z));
      view.dataset.zoom = z < zFit * 1.9 ? 'far' : z < zFit * 3.2 ? 'mid' : 'near';
    };
    const zoomAt = (nz, cx, cy) => {
      nz = Math.min(zFit * Z_MAX, Math.max(zFit, nz));
      tx = cx - ((cx - tx) / z) * nz;
      ty = cy - ((cy - ty) / z) * nz;
      z = nz;
      apply();
    };
    const centreOn = (tileX, tileY, nz) => {
      z = Math.min(zFit * Z_MAX, Math.max(zFit, nz));
      tx = vw / 2 - (tileX / COLS) * BASE_W * z;
      ty = vh / 2 - (tileY / ROWS) * BASE_H * z;
      apply();
    };
    const you = mapMarkers(s, []).find((m) => m.kind === 'you');
    const pts = new Map();
    let lastPinch = 0;
    view.addEventListener('pointerdown', (e) => { view.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); view.classList.add('drag'); });
    view.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const now = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, now);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = view.getBoundingClientRect();
        if (lastPinch) zoomAt(z * (d / lastPinch), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        lastPinch = d;
      } else {
        tx += now.x - prev.x;
        ty += now.y - prev.y;
        apply();
      }
    });
    const up = (e) => { pts.delete(e.pointerId); lastPinch = 0; if (!pts.size) view.classList.remove('drag'); };
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', up);
    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = view.getBoundingClientRect();
      zoomAt(z * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    view.addEventListener('keydown', (e) => {
      const step = 60;
      if (e.key === '+' || e.key === '=') zoomAt(z * 1.25, vw / 2, vh / 2);
      else if (e.key === '-') zoomAt(z * 0.8, vw / 2, vh / 2);
      else if (e.key === 'ArrowLeft') { tx += step; apply(); }
      else if (e.key === 'ArrowRight') { tx -= step; apply(); }
      else if (e.key === 'ArrowUp') { ty += step; apply(); }
      else if (e.key === 'ArrowDown') { ty -= step; apply(); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    });

    const btn = (label, title, fn, attr) => el('button', { class: 'map-btn', title, 'aria-label': title, 'data-map': attr, onclick: fn }, label);
    const controls = el('div', { class: 'map-controls' },
      btn('+', 'Zoom in', () => zoomAt(z * 1.4, vw / 2, vh / 2), 'in'),
      btn('−', 'Zoom out', () => zoomAt(z / 1.4, vw / 2, vh / 2), 'out'),
      btn('⤢', 'Show the whole world', () => { z = zFit; tx = ty = 0; apply(); }, 'fit'),
      you ? btn('◎', 'Centre on me', () => centreOn(you.x, you.y, zFit * 2.4), 'me') : null);
    const inside = s.player.scene !== 'farm' ? el('p', { class: 'muted' }, 'You are indoors. The map shows the outdoors.') : null;
    const legend = el('p', { class: 'map-legend muted' },
      el('span', { class: 'key you' }), ' You  ', el('span', { class: 'key npc' }), ' Villager  ', el('span', { class: 'key vehicle' }), ' Vehicle  🔒 For sale · drag to move, scroll or pinch to zoom');
    root.append(...[inside, el('div', { class: 'map-frame' }, view, controls), legend].filter(Boolean));
    this.show('Map', root, { xwide: true });
    if (you && pts) centreOn(you.x, you.y, zFit * 2.2); // open on where you are, zoomed in a little
    else apply();
    view.focus({ preventScroll: true });
  };
}
