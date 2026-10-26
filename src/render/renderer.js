import { TILE, PLAYER_HEIGHT, WORLD_W } from '../config.js';
import { CREEK, PLOTS } from '../data/world.js';
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
    this.groundRes = Math.min(1.5, Math.max(1, camera.scale * this.dpr));
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
      const r = this.groundRes;
      g.drawImage(this.ground, cam.x * r, cam.y * r, cam.viewW * r, cam.viewH * r, cam.x, cam.y, cam.viewW, cam.viewH);
    }
    this.drawWater(g, game.clockSeconds);
    this.drawPlots(g, game);
    this.drawPastures(g, game);

    // y-sorted sprites
    const items = [];
    for (const d0 of [...this.world.drawables, ...this.placedDrawables(game.state)]) {
      const d = d0.building ? this.resolveBuilding(game.state, d0) : d0;
      if (!d) continue;
      if (d.x + d.w / 2 < view.x0 || d.x - d.w / 2 > view.x1 || d.y < view.y0 || d.y - d.h > view.y1) continue;
      items.push(d);
    }
    items.push({ player: true, sortY: game.state.player.y });
    for (const ac of game.actors.list()) items.push({ animal: ac, sortY: ac.y });
    items.sort((a, b) => a.sortY - b.sortY);
    for (const d of items) {
      if (d.player) this.drawPlayer(g, game);
      else if (d.animal) this.drawAnimal(g, game, d.animal);
      else this.drawSprite(g, d);
    }

    this.drawPlacement(g, game);
    this.drawTarget(g, game);
    game.effects.draw(g);
    this.drawLighting(g, game, cam);
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

  placedDrawables(state) {
    const out = [];
    for (const p of state.placed) {
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
    const sprite = def ? def.sprite : BUILDINGS[pl.type].levels[0].sprite;
    const wT = def ? def.w : BUILDINGS[pl.type].levels[0].w;
    const img = this.assets.get(sprite);
    const fr = areaRect(pl.type, pl.x, pl.y);
    g.save();
    g.fillStyle = pl.valid ? 'rgba(120,220,110,0.35)' : 'rgba(230,80,60,0.4)';
    g.strokeStyle = pl.valid ? 'rgba(200,255,190,0.9)' : 'rgba(255,170,150,0.9)';
    g.lineWidth = 2;
    g.fillRect(fr.x0 * TILE, fr.y0 * TILE, (fr.x1 - fr.x0) * TILE, (fr.y1 - fr.y0) * TILE);
    g.strokeRect(fr.x0 * TILE, fr.y0 * TILE, (fr.x1 - fr.x0) * TILE, (fr.y1 - fr.y0) * TILE);
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
    const img = this.assets.get(room.def.sprite);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(-20, -20, room.w + 40, room.h + 40);
    if (img) g.drawImage(img, 0, 0, room.w, room.h);
    this.drawPlayer(g, game);
    this.drawTarget(g, game);
    game.effects.draw(g);
    // warm indoor light
    const grad = g.createRadialGradient(room.w * 0.45, room.h * 0.45, 40, room.w * 0.45, room.h * 0.5, room.w * 0.8);
    grad.addColorStop(0, 'rgba(255,200,120,0.06)');
    grad.addColorStop(1, 'rgba(20,10,0,0.35)');
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
    const dark = darkness(game.state.time);
    if (dark <= 0.01) return;
    g.save();
    g.fillStyle = `rgba(18,26,64,${dark * 0.6})`;
    g.fillRect(cam.x, cam.y, cam.viewW, cam.viewH);
    // warm window/lantern glow around the house and the player
    g.globalCompositeOperation = 'lighter';
    const lights = [[17.7 * TILE, 7.6 * TILE, 200], [game.state.player.x, game.state.player.y - 40, 120]];
    for (const p of game.state.placed) if (DECORATIONS[p.type]?.light) lights.push([p.x * TILE, (p.y - 1.2) * TILE, 150]);
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
