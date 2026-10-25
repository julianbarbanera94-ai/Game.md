import { TILE, PLAYER_HEIGHT, WORLD_W } from '../config.js';
import { CREEK, PLOTS } from '../data/world.js';
import { isPlotAvailable, isWet } from '../systems/farming.js';
import { darkness } from '../systems/time.js';
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
    g.fillStyle = '#2f4a1f';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);

    const view = { x0: cam.x - TILE * 3, y0: cam.y - TILE * 2, x1: cam.x + cam.viewW + TILE * 3, y1: cam.y + cam.viewH + TILE * 6 };

    if (this.ground) {
      const r = this.groundRes;
      g.drawImage(this.ground, cam.x * r, cam.y * r, cam.viewW * r, cam.viewH * r, cam.x, cam.y, cam.viewW, cam.viewH);
    }
    this.drawWater(g, game.clockSeconds);
    this.drawPlots(g, game);

    // y-sorted sprites
    const items = [];
    for (const d of this.world.drawables) {
      if (d.x + d.w / 2 < view.x0 || d.x - d.w / 2 > view.x1 || d.y < view.y0 || d.y - d.h > view.y1) continue;
      items.push(d);
    }
    items.push({ player: true, sortY: game.state.player.y });
    items.sort((a, b) => a.sortY - b.sortY);
    for (const d of items) {
      if (d.player) this.drawPlayer(g, game);
      else this.drawSprite(g, d);
    }

    this.drawTarget(g, game);
    game.effects.draw(g);
    this.drawLighting(g, game, cam);
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
    if (!t || game.uiOpen) return;
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
    for (const [x, y, r] of [[17.7 * TILE, 7.6 * TILE, 200], [game.state.player.x, game.state.player.y - 40, 120]]) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,190,90,${dark * 0.28})`);
      grad.addColorStop(1, 'rgba(255,190,90,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.restore();
  }
}
