// Keyboard, touch and gamepad input. Produces a movement vector, a run flag
// and edge-triggered actions consumed once per frame by the game.
const MOVE_KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = [];
    this.stick = { x: 0, y: 0 };
    this.pad = { x: 0, y: 0, run: false, prev: [], connected: false };
    // interceptor(e) may handle a key immediately (e.g. closing a panel) and
    // return true to stop it from also being queued for the game loop.
    this.interceptor = null;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (this.interceptor?.(e)) return;
      if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  // Virtual joystick bound to a DOM element (touch / pointer).
  bindStick(el, knob) {
    let id = null;
    let cx = 0, cy = 0;
    const radius = 46;
    const set = (x, y) => {
      let dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.hypot(dx, dy) / radius;
      this.stick = m < 0.2 ? { x: 0, y: 0 } : { x: dx / radius, y: dy / radius };
    };
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      el.setPointerCapture(id);
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      set(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stick = { x: 0, y: 0 };
    this.pad = { x: 0, y: 0, run: false, prev: [], connected: false };
      knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  press(code) {
    this.pressed.push(code);
  }

  // Gamepad (standard mapping): left stick / d-pad move, A act, B back, X bag,
  // Y journal, View map, Start menu, LB/RB hotbar, RT or a stick pushed to the
  // edge runs. Called once per frame; pressing turns into the same codes as keys.
  pollGamepad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const gp = pads.find((g) => g.mapping === 'standard') || pads[0];
    this.pad.connected = !!gp;
    if (!gp) {
      this.pad.x = this.pad.y = 0;
      this.pad.run = false;
      return [];
    }
    const btn = (i) => !!gp.buttons[i]?.pressed;
    const dz = (v) => (Math.abs(v) < 0.25 ? 0 : v);
    let x = dz(gp.axes[0] || 0), y = dz(gp.axes[1] || 0);
    if (btn(14)) x = -1; if (btn(15)) x = 1; if (btn(12)) y = -1; if (btn(13)) y = 1;
    this.pad.x = x;
    this.pad.y = y;
    this.pad.run = btn(7) || Math.hypot(gp.axes[0] || 0, gp.axes[1] || 0) > 0.95;
    const CODES = { 0: 'PadA', 1: 'PadB', 2: 'KeyB', 3: 'KeyJ', 4: 'PadLB', 5: 'PadRB', 8: 'KeyM', 9: 'Escape', 12: 'PadUp', 13: 'PadDown', 14: 'PadLeft', 15: 'PadRight' };
    const fresh = [];
    gp.buttons.forEach((b, i) => {
      if (b.pressed && !this.pad.prev[i] && CODES[i]) fresh.push(CODES[i]);
      this.pad.prev[i] = b.pressed;
    });
    return fresh;
  }

  // Running: Shift, the gamepad's right trigger, or the touch stick pushed to its rim.
  running() {
    return this.down.has('ShiftLeft') || this.down.has('ShiftRight') || this.pad.run || Math.hypot(this.stick.x, this.stick.y) > 0.97;
  }

  moveVector() {
    let x = this.stick.x + this.pad.x, y = this.stick.y + this.pad.y;
    for (const code of this.down) {
      const v = MOVE_KEYS[code];
      if (v) { x += v[0]; y += v[1]; }
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  consume() {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }
}
