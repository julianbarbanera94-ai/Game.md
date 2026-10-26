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
    this.cssW = 0;
    this.cssH = 0;
    this.fit = null; // { w, h } of a room to show whole, instead of the follow zoom
  }

  // Show a whole room (interior) inside the window, or null to go back to the
  // normal follow zoom.
  setFit(fit) {
    this.fit = fit;
    if (this.cssW) this.resize(this.cssW, this.cssH);
  }

  resize(cssW, cssH) {
    this.cssW = cssW;
    this.cssH = cssH;
    if (this.fit) {
      // Show the whole room above the hotbar/prompt; never magnify beyond
      // 1.25x (the art is low-res, so smaller is also sharper).
      const top = 8;
      const bottom = cssH < 520 ? 108 : 130;
      const scale = Math.min((cssW * 0.92) / this.fit.w, (cssH - top - bottom) / this.fit.h, 1.25);
      this.scale = scale;
      this.viewW = cssW / scale;
      this.viewH = cssH / scale;
      this.fitPad = top / scale;
      return;
    }
    // ~20% wider view than before: the art is shown smaller, so it reads sharper
    const tilesAcross = Math.min(25, Math.max(10, cssW / 55));
    let scale = cssW / (tilesAcross * 64);
    scale = Math.min(scale, cssH / (10.2 * 64));
    this.scale = scale;
    this.viewW = cssW / scale;
    this.viewH = cssH / scale;
  }

  clampTarget(tx, ty) {
    if (this.fit) return { x: (this.worldW - this.viewW) / 2, y: -this.fitPad };
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
