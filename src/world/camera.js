// Smooth-follow camera clamped to the world. Works in world pixels; `scale`
// converts world pixels to CSS pixels.
export class Camera {
  constructor(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    this.viewW = 0;
    this.viewH = 0;
  }

  resize(cssW, cssH) {
    const tilesAcross = Math.min(21, Math.max(8, cssW / 66));
    let scale = cssW / (tilesAcross * 64);
    scale = Math.min(scale, cssH / (8.5 * 64));
    this.scale = scale;
    this.viewW = cssW / scale;
    this.viewH = cssH / scale;
  }

  clampTarget(tx, ty) {
    const x = this.viewW >= this.worldW ? (this.worldW - this.viewW) / 2 : Math.min(Math.max(tx - this.viewW / 2, 0), this.worldW - this.viewW);
    const y = this.viewH >= this.worldH ? (this.worldH - this.viewH) / 2 : Math.min(Math.max(ty - this.viewH / 2, 0), this.worldH - this.viewH);
    return { x, y };
  }

  follow(tx, ty, dt, snap = false) {
    const t = this.clampTarget(tx, ty);
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    this.x += (t.x - this.x) * k;
    this.y += (t.y - this.y) * k;
  }
}
