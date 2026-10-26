import { TILE, PLAYER_HEIGHT, WORLD_W, WORLD_H } from '../config.js';
import { CREEK, PLOTS, PLOTS_BY_ID } from '../data/world.js';
import { plotsInRange } from '../systems/sprinklers.js';
import { isPlotAvailable, isWet } from '../systems/farming.js';
import { darkness, formatClock } from '../systems/time.js';
import { BUILDINGS, CONSTRUCTION_STAGES, DECORATIONS } from '../data/buildings.js';
import { areaRect, spriteFor } from '../systems/buildings.js';
import { pastureFence } from '../world/layout.js';
import { pastureOf } from '../systems/pasture.js';
import { SPECIES } from '../data/animals.js';
import { isHungry } from '../systems/animals.js';
import { animalFrame } from './animals.js';
import { buildGround } from './terrain.js';
import { drawVehicle } from './vehicleArt.js';
import { calendar, activeEvent } from '../systems/seasons.js';
import { SEASON_TINT } from '../data/seasons.js';
import { isRaining, isSnowing } from '../systems/weather.js';
import { buildInteriorArt } from './interiorArt.js';
import { playerFrame, plotSpriteKey, untilledVariant, wetVariant } from './sprites.js';

// Draw order: ground layer -> plots -> y-sorted sprites (objects, scenery,
// player) -> effects/target marker -> lighting. HUD is DOM on top.

const PLAYER_FRAME_SCALE = PLAYER_HEIGHT / 268; // character is ~268px tall inside each 320px frame

export class Renderer {
  constructor(canvas, assets, world) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.assets = assets;
    this.world = world;
    this.ground = null;
    this.groundRes = 1;
    this.dpr = 1;
    this.fenceCache = new Map();
  }

  resize(cssW, cssH, camera) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    camera.resize(cssW, cssH);
  }

  buildStatic(camera) {
    // the ground is one big canvas: keep it under ~12M pixels so phones stay happy
    const maxRes = Math.sqrt(12e6 / (WORLD_W * WORLD_H));
    this.groundRes = Math.min(1.5, maxRes, Math.max(1, camera.scale * this.dpr));
    this.ground = buildGround(this.assets, this.groundRes, this.world.groundDrawables);
  }

  render(game) {
    const { g } = this;
    const cam = game.camera;
    const s = cam.scale * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = game.interior ? '#1a120b' : '#2f4a1f';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
    if (game.interior) {
      this.renderInterior(g, game);
      return;
    }

    const view = { x0: cam.x - TILE * 3, y0: cam.y - TILE * 2, x1: cam.x + cam.viewW + TILE * 3, y1: cam.y + cam.viewH + TILE * 6 };

    if (this.ground) {
      // The ground canvas is built near screen resolution, so plain bilinear
      // filtering looks the same as 'high' and costs far less every frame.
      const r = this.groundRes;
      g.imageSmoothingQuality = 'low';
      g.drawImage(this.ground, cam.x * r, cam.y * r, cam.viewW * r, cam.viewH * r, cam.x, cam.y, cam.viewW, cam.viewH);
      g.imageSmoothingQuality = 'high';
    }
    this.drawWater(g, game.clockSeconds);
    this.drawPlots(g, game);
    this.drawPastures(g, game);

    // y-sorted sprites
    const items = [];
    for (const d0 of [...this.world.drawables, ...this.placedDrawables(game.state, game.placement?.moveUid)]) {
      const d = d0.building ? this.resolveBuilding(game.state, d0) : d0;
      if (!d) continue;
      if (d.x + d.w / 2 < view.x0 || d.x - d.w / 2 > view.x1 || d.y < view.y0 || d.y - d.h > view.y1) continue;
      items.push(d);
    }
    if (!game.state.driving) items.push({ player: true, sortY: game.state.player.y });
    for (const v of game.state.vehicles) items.push({ vehicle: v, sortY: v.y + 14 });
    for (const ac of game.actors.list()) items.push({ animal: ac, sortY: ac.y });
    for (const n of game.npcs.list()) items.push({ npc: n, sortY: n.y });
    items.sort((a, b) => a.sortY - b.sortY);
    for (const d of items) {
      if (d.player) this.drawPlayer(g, game);
      else if (d.animal) this.drawAnimal(g, game, d.animal);
      else if (d.npc) this.drawNpc(g, game, d.npc);
      else if (d.vehicle) this.drawVehicleItem(g, game, d.vehicle);
      else this.drawSprite(g, d);
    }

    this.drawSprinklers(g, game);
    this.drawPlacement(g, game);
    this.drawTarget(g, game);
    game.effects.draw(g);
    this.drawLighting(g, game, cam);
    this.drawWeather(g, game, cam);
  }

  // Spinning water jets from sprinklers that are running: every morning for
  // half an hour and for a few seconds whenever one waters a dry plot.
  drawSprinklers(g, game) {
    const s = game.state;
    const minute = s.time % 1440;
    const morning = minute >= 360 && minute < 390;
    const t = game.clockSeconds;
    for (const rec of s.placed) {
      const def = DECORATIONS[rec.type];
      if (!def?.range) continue;
      if (!morning && !((game.sprayUntil?.[rec.uid] || 0) > t)) continue;
      const e = this.assets.entry(def.sprite);
      const h = e ? (def.w * TILE * e.height) / e.width : def.w * TILE;
      const hx = rec.x * TILE, hy = rec.y * TILE - h * def.head; // the spinning head
      const R = def.range * TILE * 0.92;
      g.save();
      for (const jet of [0, Math.PI]) {
        const a = t * 2.4 + jet;
        const ex = Math.cos(a) * R, ey = Math.sin(a) * R * 0.62;
        const pt = (k) => ({ x: hx + ex * k, y: hy + 34 * k + ey * k - Math.sin(k * Math.PI) * 46 });
        // the jet itself: a soft streak along the arc
        g.globalAlpha = 0.55;
        g.strokeStyle = '#e4f6ff';
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.beginPath();
        for (let i = 0; i <= 20; i++) {
          const q = pt(i / 20);
          if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
        }
        g.stroke();
        // droplets breaking off it
        for (let i = 2; i <= 22; i++) {
          const k = i / 22;
          const q = pt(k);
          g.globalAlpha = 0.9 * (1 - k * 0.4);
          g.fillStyle = i % 3 ? '#bfe8ff' : '#ffffff';
          g.beginPath();
          g.arc(q.x + Math.sin(t * 11 + i * 1.7) * 3, q.y + Math.cos(t * 9 + i) * 2, 3.6 - k * 1.6, 0, Math.PI * 2);
          g.fill();
        }
        // splash rings where it lands
        const land = pt(1);
        const ph = (t * 3 + jet) % 1;
        g.globalAlpha = 0.7 * (1 - ph);
        g.strokeStyle = '#d8f2ff';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(land.x, land.y, 6 + ph * 14, 3 + ph * 6, 0, 0, Math.PI * 2);
        g.stroke();
      }
      // fine mist over the watered square
      g.globalAlpha = 0.1;
      g.fillStyle = '#d6efff';
      g.beginPath();
      g.ellipse(hx, hy + 34, R, R * 0.62, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  // Rain streaks with splashes, or drifting snow, over the visible world.
  drawWeather(g, game, cam) {
    const rain = isRaining(game.state.time);
    const snow = !rain && isSnowing(game.state.time);
    if (!rain && !snow) return;
    const t = game.clockSeconds;
    g.save();
    if (rain) {
      g.fillStyle = 'rgba(38,55,76,0.24)'; // overcast
      g.fillRect(cam.x, cam.y, cam.viewW, cam.viewH);
      g.strokeStyle = 'rgba(215,232,255,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      const n = Math.round((cam.viewW * cam.viewH) / 6000);
      for (let i = 0; i < n; i++) {
        const fx = ((i * 7919) % 1000) / 1000, fy = ((i * 104729) % 1000) / 1000;
        const x = cam.x + ((fx * cam.viewW + t * 90) % cam.viewW);
        const y = cam.y + ((fy * cam.viewH + t * (620 + (i % 5) * 40)) % cam.viewH);
        g.moveTo(x, y);
        g.lineTo(x - 7, y + 26);
      }
      g.stroke();
      // splashes on the ground
      g.strokeStyle = 'rgba(220,235,255,0.5)';
      g.lineWidth = 1.2;
      for (let i = 0; i < n / 4; i++) {
        const phase = (t * 1.7 + i * 0.37) % 1;
        const fx = ((i * 4657) % 1000) / 1000, fy = ((i * 2971 + Math.floor(t * 1.7 + i * 0.37) * 131) % 1000) / 1000;
        g.globalAlpha = 1 - phase;
        g.beginPath();
        g.ellipse(cam.x + fx * cam.viewW, cam.y + fy * cam.viewH, 2 + phase * 6, 1 + phase * 2.5, 0, 0, Math.PI * 2);
        g.stroke();
      }
    } else {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      const n = Math.round((cam.viewW * cam.viewH) / 14000);
      for (let i = 0; i < n; i++) {
        const fx = ((i * 7919) % 1000) / 1000, fy = ((i * 104729) % 1000) / 1000;
        const x = cam.x + ((fx * cam.viewW + Math.sin(t * 0.8 + i) * 18 + t * 12) % cam.viewW);
        const y = cam.y + ((fy * cam.viewH + t * (40 + (i % 4) * 10)) % cam.viewH);
        g.beginPath();
        g.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  // The world (or a part of it, `rect` in world px) drawn into a new canvas
  // `pxW` device pixels wide: the painted ground, plots and every building and
  // vehicle, no people. Used by the map screen and the launch-art tool.
  renderMap(game, pxW, rect = { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H }) {
    const rw = rect.x1 - rect.x0, rh = rect.y1 - rect.y0;
    const k = pxW / rw;
    const c = document.createElement('canvas');
    c.width = Math.round(rw * k);
    c.height = Math.round(rh * k);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.setTransform(k, 0, 0, k, -rect.x0 * k, -rect.y0 * k);
    if (this.ground) {
      const r = this.groundRes;
      g.drawImage(this.ground, rect.x0 * r, rect.y0 * r, rw * r, rh * r, rect.x0, rect.y0, rw, rh);
    }
    this.drawPlots(g, game);
    this.drawPastures(g, game);
    const items = [];
    for (const d0 of [...this.world.drawables, ...this.placedDrawables(game.state)]) {
      const d = d0.building ? this.resolveBuilding(game.state, d0) : d0;
      if (d && d.x + d.w / 2 > rect.x0 && d.x - d.w / 2 < rect.x1 && d.y > rect.y0 && d.y - d.h < rect.y1 + TILE * 4) items.push(d);
    }
    for (const v of game.state.vehicles) items.push({ vehicle: v, sortY: v.y + 14 });
    items.sort((a, b) => a.sortY - b.sortY);
    for (const d of items) {
      if (d.vehicle) this.drawVehicleItem(g, game, d.vehicle);
      else this.drawSprite(g, { ...d, progress: null });
    }
    return c;
  }

  // Building drawable with its current level / construction-stage sprite.
  resolveBuilding(state, d) {
    const rec = d.uid ? state.placed.find((p) => p.uid === d.uid) : state.buildings[d.building];
    if (!rec) return null;
    const look = spriteFor(state, d.building, rec, CONSTRUCTION_STAGES);
    const e = this.assets.entry(look.sprite);
    const w = look.w * TILE;
    const h = e ? (w * e.height) / e.width : w;
    return { ...d, sprite: look.sprite, w, h, progress: look.constructing ? look.progress : null, job: rec.job };
  }

  placedDrawables(state, hideUid = null) {
    const out = [];
    for (const p of state.placed) {
      if (p.uid === hideUid) continue;
      const base = { uid: p.uid, x: p.x * TILE, y: p.y * TILE, sortY: p.y * TILE };
      if (p.kind === 'building') {
        out.push({ ...base, building: p.type, w: TILE * 3, h: TILE * 3 });
        if (p.level >= 1 && pastureOf(p.type, p.x, p.y)) {
          const key = `${p.uid}:${p.x}:${p.y}`;
          if (!this.fenceCache.has(key)) this.fenceCache.set(key, pastureFence(this.assets, p.type, p.x, p.y));
          out.push(...this.fenceCache.get(key));
        }
        continue;
      }
      const def = DECORATIONS[p.type];
      const e = this.assets.entry(def.sprite);
      const w = def.w * TILE;
      out.push({ ...base, sprite: def.sprite, w, h: e ? (w * e.height) / e.width : w });
    }
    return out;
  }

  // Trodden-earth patch inside each finished pasture.
  drawPastures(g, game) {
    for (const p of game.state.placed) {
      if (p.kind !== 'building' || p.level < 1) continue;
      const geo = pastureOf(p.type, p.x, p.y);
      if (!geo) continue;
      const { rect } = geo;
      const x = rect.x0 * TILE, y = rect.y0 * TILE, w = (rect.x1 - rect.x0) * TILE, h = (rect.y1 - rect.y0) * TILE;
      g.save();
      const grad = g.createRadialGradient(x + w / 2, y + h * 0.45, 20, x + w / 2, y + h * 0.5, w * 0.6);
      grad.addColorStop(0, 'rgba(176,140,78,0.42)');
      grad.addColorStop(1, 'rgba(176,140,78,0.12)');
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(x, y, w, h, 18);
      g.fill();
      g.restore();
    }
  }

  drawVehicleItem(g, game, v) {
    let driver = null;
    if (game.state.driving === v.uid) {
      const img = this.assets.get('player.idle_back');
      if (img) driver = { img, scale: PLAYER_FRAME_SCALE * 0.6 };
    }
    drawVehicle(g, v, driver, (key) => this.assets.get(key));
  }

  // Villager: the player sprite colour-shifted and scaled until NPC art exists.
  tintedFrame(key, tint) {
    this.tintCache ||= new Map();
    const id = `${key}|${tint.shirt}|${tint.pants}|${tint.hair}`;
    if (this.tintCache.has(id)) return this.tintCache.get(id);
    const img = this.assets.get(key);
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const [h, s, v] = rgbToHsv(d[i], d[i + 1], d[i + 2]);
      let nh = null;
      let nv = v;
      let ns = s;
      if (s > 0.35 && (h >= 195 && h <= 265)) nh = tint.pants; // blue overalls
      else if (s > 0.4 && (h >= 345 || h <= 12) && v > 0.35) nh = tint.shirt; // red shirt
      else if (h >= 10 && h <= 45 && v < 0.4 && s > 0.3) { // dark brown hair
        nv = Math.min(1, v * tint.hair);
        ns = tint.hair > 1.3 ? s * 0.8 : s;
      }
      if (nh == null && nv === v) continue;
      const [r, gg, b] = hsvToRgb(nh ?? h, ns, nv);
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
    }
    g.putImageData(data, 0, 0);
    this.tintCache.set(id, c);
    return c;
  }

  drawNpc(g, game, n) {
    const def = n.def;
    const f = playerFrame(n.facing, n.moving, n.t, null);
    const img = this.tintedFrame(f.key, def.tint);
    if (!img) return;
    const k = PLAYER_FRAME_SCALE * def.scale;
    const w = img.width * k;
    const h = img.height * k;
    g.fillStyle = 'rgba(25,35,10,0.32)';
    g.beginPath();
    g.ellipse(n.x, n.y - 2, 19 * def.scale, 7 * def.scale, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(n.x, n.y);
    if (f.flip) g.scale(-1, 1);
    g.drawImage(img, -w * 0.5, -h * (306 / 320), w, h);
    g.restore();
    // name tag when close, and a marker when they have something for the player
    const p = game.state.player;
    const near = Math.hypot(n.x - p.x, n.y - p.y) < TILE * 3;
    const top = n.y - h * (306 / 320) + 6;
    const mark = game.npcMarker(n.id);
    if (near) {
      g.save();
      g.font = '700 13px system-ui, sans-serif';
      g.textAlign = 'center';
      const tw = g.measureText(def.name).width + 12;
      g.fillStyle = 'rgba(20,28,22,0.78)';
      g.beginPath();
      g.roundRect(n.x - tw / 2, top - 22, tw, 18, 8);
      g.fill();
      g.fillStyle = '#fff4d6';
      g.fillText(def.name, n.x, top - 9);
      g.restore();
    }
    if (mark) {
      const bob = Math.sin(game.clockSeconds * 4) * 2;
      g.save();
      g.font = '800 20px system-ui, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(40,25,5,0.85)';
      g.fillStyle = mark === '?' ? '#8be06a' : '#ffd84a';
      g.strokeText(mark, n.x, top - (near ? 30 : 10) + bob);
      g.fillText(mark, n.x, top - (near ? 30 : 10) + bob);
      g.restore();
    }
  }

  drawAnimal(g, game, ac) {
    const a = game.state.animals.find((x) => x.uid === ac.uid);
    if (!a) return;
    const sp = SPECIES[ac.species];
    const f = animalFrame(ac.species, ac);
    const img = this.assets.get(f.key);
    if (!img) return;
    const h = sp.drawHeight;
    const w = (h * img.width) / img.height;
    const hop = ac.moving ? -Math.abs(Math.sin(ac.t * 9)) * (ac.species === 'chicken' ? 3 : 1.6) : Math.sin(ac.t * 1.6) * 0.5;
    g.save();
    g.fillStyle = 'rgba(25,35,10,0.22)';
    g.beginPath();
    g.ellipse(ac.x, ac.y - 1, w * 0.36, h * 0.09, 0, 0, Math.PI * 2);
    g.fill();
    g.translate(ac.x, ac.y + hop);
    if (f.flip) g.scale(-1, 1);
    g.drawImage(img, -w / 2, -h, w, h);
    g.restore();
    // speech bubble: finished product, or hungry
    const ready = a.stock > 0;
    const hungry = isHungry(game.state, a);
    if (ready || hungry) {
      const icon = this.assets.get(ready ? `icon.product_${sp.product}` : `icon.feed_${sp.feed === 'hay' ? 'hay' : 'chicken'}`);
      const bob = Math.sin(game.clockSeconds * 3 + ac.t) * 2;
      const bx = ac.x, by = ac.y - h - 16 + bob;
      g.save();
      g.fillStyle = 'rgba(255,250,235,0.96)';
      g.strokeStyle = ready ? '#d9a431' : '#c8602d';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(bx, by, 13, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(bx - 4, by + 11);
      g.lineTo(bx, by + 18);
      g.lineTo(bx + 4, by + 11);
      g.fill();
      if (icon) {
        const s = 19;
        const iw = icon.width >= icon.height ? s : (s * icon.width) / icon.height;
        const ih = icon.width >= icon.height ? (s * icon.height) / icon.width : s;
        g.drawImage(icon, bx - iw / 2, by - ih / 2, iw, ih);
      }
      if (!ready && hungry) {
        g.fillStyle = '#d6452b';
        g.beginPath();
        g.arc(bx + 10, by - 10, 5.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.font = '800 9px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('!', bx + 10, by - 6.8);
      }
      g.restore();
    }
  }

  drawProgress(g, d, time) {
    const w = Math.min(120, d.w * 0.6);
    const x = d.x - w / 2;
    const y = d.y - d.h - 14;
    g.fillStyle = 'rgba(28,38,34,0.85)';
    g.beginPath();
    g.roundRect(x - 4, y - 18, w + 8, 30, 8);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x, y, w, 6);
    g.fillStyle = '#f2c14e';
    g.fillRect(x, y, w * d.progress, 6);
    g.fillStyle = '#f7f0dc';
    g.font = '700 11px "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`Building · ready ${formatClock(d.job.end)}`, d.x, y - 5);
  }

  drawPlacement(g, game) {
    const pl = game.placement;
    if (!pl) return;
    const def = DECORATIONS[pl.type];
    const moving = pl.moveUid && game.state.placed.find((p) => p.uid === pl.moveUid);
    const lvl = def ? null : BUILDINGS[pl.type].levels[Math.max(1, moving?.level || 1) - 1];
    const sprite = def ? def.sprite : lvl.sprite;
    const wT = def ? def.w : lvl.w;
    const img = this.assets.get(sprite);
    const fr = areaRect(pl.type, pl.x, pl.y);
    g.save();
    g.fillStyle = pl.valid ? 'rgba(120,220,110,0.35)' : 'rgba(230,80,60,0.4)';
    g.strokeStyle = pl.valid ? 'rgba(200,255,190,0.9)' : 'rgba(255,170,150,0.9)';
    g.lineWidth = 2;
    g.fillRect(fr.x0 * TILE, fr.y0 * TILE, (fr.x1 - fr.x0) * TILE, (fr.y1 - fr.y0) * TILE);
    g.strokeRect(fr.x0 * TILE, fr.y0 * TILE, (fr.x1 - fr.x0) * TILE, (fr.y1 - fr.y0) * TILE);
    // outline whatever is in the way
    g.strokeStyle = 'rgba(255,60,40,0.95)';
    g.fillStyle = 'rgba(255,60,40,0.35)';
    g.lineWidth = 3;
    for (const c of pl.check?.rects || []) {
      g.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
      g.strokeRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
    }
    // a sprinkler shows the square it will water and the plots inside it
    if (def?.range) {
      const r = def.range, cx = pl.x, cy = pl.y - 0.15;
      g.setLineDash([10, 6]);
      g.strokeStyle = 'rgba(140,210,255,0.95)';
      g.fillStyle = 'rgba(110,190,255,0.12)';
      g.lineWidth = 2.5;
      g.fillRect((cx - r) * TILE, (cy - r) * TILE, r * 2 * TILE, r * 2 * TILE);
      g.strokeRect((cx - r) * TILE, (cy - r) * TILE, r * 2 * TILE, r * 2 * TILE);
      g.setLineDash([]);
      g.fillStyle = 'rgba(110,190,255,0.3)';
      for (const id of plotsInRange(game.state, pl.x, pl.y)) {
        const d = PLOTS_BY_ID[id];
        g.fillRect(d.tx * TILE + 4, d.ty * TILE + 4, TILE - 8, TILE - 8);
      }
    }
    if (img) {
      g.globalAlpha = 0.65;
      const w = wT * TILE;
      const h = (w * img.height) / img.width;
      g.drawImage(img, pl.x * TILE - w / 2, pl.y * TILE - h, w, h);
    }
    g.restore();
  }

  renderInterior(g, game) {
    const room = game.interior;
    // paint the room at the current device resolution (rounded up to 0.5x
    // steps so small resizes reuse the cache)
    const res = Math.min(3, Math.max(1, Math.ceil(game.camera.scale * this.dpr * 2) / 2));
    if (!this.interiorArt || this.interiorArt.id !== room.id || this.interiorArt.res !== res) {
      this.interiorArt = { id: room.id, ...buildInteriorArt(room.def, this.assets, res) };
    }
    const art = this.interiorArt;
    g.drawImage(art.base, 0, 0, room.w, room.h);
    const items = art.pieces.map((p) => ({ piece: p, sortY: p.sortY }));
    items.push({ player: true, sortY: game.state.player.y });
    items.sort((a, b) => a.sortY - b.sortY);
    for (const it of items) {
      if (it.player) {
        this.drawPlayer(g, game);
        continue;
      }
      const p = it.piece;
      if (!p.img) continue;
      if (p.shadow) {
        g.fillStyle = 'rgba(30,14,4,0.3)';
        g.beginPath();
        g.ellipse(p.x + p.w / 2 + 3, p.y + p.h - 4, p.w * 0.5, 7, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (p.pot) {
        g.drawImage(p.img, p.x, p.y, p.w, p.leafH);
        g.drawImage(p.pot, p.x, p.y + p.leafH - p.w * 0.9 * 0.75, p.w, p.w * 0.9); // rim overlaps the leaves
      } else {
        g.drawImage(p.img, p.x, p.y, p.w, p.h);
      }
    }
    g.drawImage(art.front, 0, art.frontY, room.w, art.frontH);
    this.drawTarget(g, game);
    game.effects.draw(g);
    // warm lamp light, darker corners
    const grad = g.createRadialGradient(room.w * 0.45, room.h * 0.45, 40, room.w * 0.45, room.h * 0.5, room.w * 0.8);
    grad.addColorStop(0, 'rgba(255,200,120,0.05)');
    grad.addColorStop(1, 'rgba(20,10,0,0.28)');
    g.fillStyle = grad;
    g.fillRect(0, 0, room.w, room.h);
  }

  drawSprite(g, d) {
    const img = this.assets.get(d.sprite);
    if (!img) return;
    const x = d.x - d.w / 2;
    const y = d.y - d.h;
    if (d.flip) {
      g.save();
      g.translate(d.x, 0);
      g.scale(-1, 1);
      g.translate(-d.x, 0);
    }
    if (d.src) g.drawImage(img, d.src[0], d.src[1], d.src[2], d.src[3], x, y, d.w, d.h);
    else g.drawImage(img, x, y, d.w, d.h);
    if (d.flip) g.restore();
    if (d.progress != null) this.drawProgress(g, d);
  }

  drawWater(g, t) {
    // animated glints over the creek
    g.save();
    g.globalAlpha = 0.18;
    g.fillStyle = '#e8fbff';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 157 + t * 18 * (1 + (i % 3) * 0.3)) % (WORLD_W + 80)) - 40;
      const y = (CREEK.y0 + 0.35 + ((i * 37) % 100) / 100 * (CREEK.y1 - CREEK.y0 - 0.6)) * TILE;
      const w = 10 + (i % 4) * 4 + Math.sin(t * 2 + i) * 3;
      g.beginPath();
      g.ellipse(x, y, w, 1.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  drawPlots(g, game) {
    const { state } = game;
    for (const def of PLOTS) {
      const plot = state.plots[def.id];
      const cx = (def.tx + 0.5) * TILE;
      const cy = (def.ty + 0.5) * TILE;
      const available = isPlotAvailable(state, def.id);
      const key = available ? plotSpriteKey(plot) : 'plot.soil_dry';
      let img = this.assets.get(key);
      if (!img) continue;
      if (available && plot.tilled && isWet(state, plot)) img = wetVariant(key, img);
      else if (!available || !plot.tilled) img = untilledVariant(key, img);
      const w = TILE * 0.98;
      const h = (w * img.height) / img.width;
      if (!available) g.globalAlpha = 0.5;
      g.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      g.globalAlpha = 1;
      if (!available) {
        const weed = this.assets.get((def.tx + def.ty) % 2 ? 'foliage.grass_tall' : 'foliage.fern');
        if (weed) {
          const ww = TILE * 0.8;
          g.drawImage(weed, cx - ww / 2, cy + TILE * 0.3 - (ww * weed.height) / weed.width, ww, (ww * weed.height) / weed.width);
        }
      }
    }
  }

  drawPlayer(g, game) {
    const p = game.state.player;
    // soft contact shadow
    g.fillStyle = 'rgba(25,35,10,0.32)';
    g.beginPath();
    g.ellipse(p.x, p.y - 2, 19, 7, 0, 0, Math.PI * 2);
    g.fill();
    const f = playerFrame(p.facing, game.playerMoving, game.animTime, game.action?.kind);
    const img = this.assets.get(f.key);
    if (!img) return;
    const w = img.width * PLAYER_FRAME_SCALE;
    const h = img.height * PLAYER_FRAME_SCALE;
    const ax = w * 0.5;
    const ay = h * (306 / 320);
    const bob = game.action ? Math.sin((game.action.t / game.action.dur) * Math.PI) * 2 : 0;
    g.save();
    g.translate(p.x, p.y + bob);
    if (f.flip) g.scale(-1, 1);
    g.drawImage(img, -ax, -ay, w, h);
    g.restore();
  }

  drawTarget(g, game) {
    const t = game.target;
    if (!t || game.uiOpen || t.kind === 'placement') return;
    const pulse = 0.75 + Math.sin(game.clockSeconds * 5) * 0.25;
    g.save();
    g.strokeStyle = t.ok ? `rgba(255,255,255,${pulse})` : `rgba(255,190,150,${pulse})`;
    g.lineWidth = 3;
    g.lineCap = 'round';
    let x0, y0, x1, y1;
    if (t.kind === 'plot') {
      x0 = t.tx * TILE + 2; y0 = t.ty * TILE + 2; x1 = x0 + TILE - 4; y1 = y0 + TILE - 4;
    } else {
      x0 = t.x - 22; y0 = t.y - 70; x1 = t.x + 22; y1 = t.y - 26;
      // bobbing marker above interactable objects
      const by = t.y - 92 + Math.sin(game.clockSeconds * 4) * 4;
      g.fillStyle = 'rgba(255,248,220,0.95)';
      g.beginPath();
      g.moveTo(t.x - 8, by);
      g.lineTo(t.x + 8, by);
      g.lineTo(t.x, by + 10);
      g.closePath();
      g.fill();
      g.restore();
      return;
    }
    const c = 12;
    g.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      g.moveTo(x, y + dy * c);
      g.lineTo(x, y);
      g.lineTo(x + dx * c, y);
    }
    g.stroke();
    g.restore();
  }

  drawLighting(g, game, cam) {
    // gentle seasonal colour grade (and festival glow) under the night overlay
    const evTint = activeEvent(game.state.time)?.tint;
    for (const t of [SEASON_TINT[calendar(game.state.time).seasonIndex], evTint]) {
      if (!t) continue;
      g.save();
      g.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${t[3]})`;
      g.fillRect(cam.x, cam.y, cam.viewW, cam.viewH);
      g.restore();
    }
    const dark = darkness(game.state.time);
    if (dark <= 0.01) return;
    g.save();
    g.fillStyle = `rgba(18,26,64,${dark * 0.6})`;
    g.fillRect(cam.x, cam.y, cam.viewW, cam.viewH);
    // warm window/lantern glow around the house and the player
    g.globalCompositeOperation = 'lighter';
    const lights = [[17.7 * TILE, 7.6 * TILE, 200], [game.state.player.x, game.state.player.y - 40, 120]];
    for (const p of game.state.placed) if (DECORATIONS[p.type]?.light) lights.push([p.x * TILE, (p.y - 1.2) * TILE, 150]);
    for (const d of this.world.drawables) if (d.light) lights.push([d.x, d.y - 1.2 * TILE, 150]);
    const dv = game.drivingVehicle;
    if (dv && dv.fuel > 0) lights.push([dv.x + Math.cos(dv.heading) * 110, dv.y + Math.sin(dv.heading) * 110, 190]);
    for (const [x, y, r] of lights) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,190,90,${dark * 0.28})`);
      grad.addColorStop(1, 'rgba(255,190,90,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.restore();
  }
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, max ? d / max : 0, max];
}

function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
