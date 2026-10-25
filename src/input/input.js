// Keyboard + touch input. Produces a movement vector and edge-triggered
// actions consumed once per frame by the game.
const MOVE_KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = [];
    this.stick = { x: 0, y: 0 };
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
      knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  press(code) {
    this.pressed.push(code);
  }

  moveVector() {
    let x = this.stick.x, y = this.stick.y;
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
