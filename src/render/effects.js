// Lightweight particles and floating text for action feedback.
export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
  }

  burst(kind, x, y) {
    const presets = {
      dirt: { n: 10, colors: ['#6b4a2b', '#8a6239', '#4d3420'], speed: 70, up: 60, size: [2, 4], life: 0.5 },
      water: { n: 14, colors: ['#8fd3ff', '#5fb7f0', '#d8f2ff'], speed: 60, up: 30, size: [1.5, 3], life: 0.6 },
      seed: { n: 6, colors: ['#e9d29a', '#c7a35d'], speed: 40, up: 40, size: [1.5, 2.5], life: 0.4 },
      harvest: { n: 16, colors: ['#ffe27a', '#fff6c8', '#9be36b'], speed: 90, up: 90, size: [2, 3.5], life: 0.8 },
      coins: { n: 12, colors: ['#ffd34d', '#f2b01e', '#fff2a8'], speed: 80, up: 80, size: [2, 3.5], life: 0.8 },
      // quests, unlocks and level-ups: big golden stars
      sparkle: { n: 22, colors: ['#ffe27a', '#fff6c8', '#ffd34d', '#ffffff'], speed: 120, up: 120, size: [2.5, 4.5], life: 1.1, sparkle: true },
      // finished building: a cloud of dust
      dust: { n: 26, colors: ['#cdb48a', '#b49a6c', '#e3d2ad'], speed: 110, up: 40, size: [4, 8], life: 0.9, g: 30 },
      // tractor exhaust: small grey puffs that rise and fade
      smoke: { n: 1, colors: ['rgba(90,90,90,0.55)', 'rgba(120,120,120,0.5)'], speed: 8, up: 30, size: [3, 5], life: 1.0, g: -40, grow: 6 },
      // feeding: grain
      feed: { n: 10, colors: ['#e9c46a', '#d4a24c', '#f3dc9a'], speed: 50, up: 50, size: [1.5, 2.5], life: 0.6 },
      // petting: little hearts
      heart: { n: 3, colors: ['#ff6b8a', '#ff8fa8'], speed: 20, up: 60, size: [4, 5], life: 1.0, g: -20, heart: true },
    };
    const p = presets[kind];
    for (let i = 0; i < p.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = p.speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - p.up * Math.random(),
        g: p.g ?? 220, life: p.life, max: p.life, grow: p.grow || 0, heart: !!p.heart,
        size: p.size[0] + Math.random() * (p.size[1] - p.size[0]),
        color: p.colors[i % p.colors.length], sparkle: p.sparkle || kind === 'harvest' || kind === 'coins',
      });
    }
  }

  // An expanding ring (level-up, unlock).
  ring(x, y, color = '#ffe27a', radius = 130) {
    (this.rings ||= []).push({ x, y, color, radius, life: 1.1, max: 1.1 });
  }

  text(str, x, y, color = '#fff') {
    this.texts.push({ str, x, y, color, life: 1.3, max: 1.3 });
  }

  update(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const p of this.particles) if (p.grow) p.size += p.grow * dt;
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.rings) {
      for (const r of this.rings) r.life -= dt;
      this.rings = this.rings.filter((r) => r.life > 0);
    }
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 28 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(g) {
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      if (p.heart) {
        const s = p.size;
        g.beginPath();
        g.moveTo(p.x, p.y + s * 0.9);
        g.bezierCurveTo(p.x - s * 1.4, p.y - s * 0.2, p.x - s * 0.5, p.y - s * 1.3, p.x, p.y - s * 0.4);
        g.bezierCurveTo(p.x + s * 0.5, p.y - s * 1.3, p.x + s * 1.4, p.y - s * 0.2, p.x, p.y + s * 0.9);
        g.fill();
      } else if (p.sparkle) {
        g.beginPath();
        const s = p.size * 1.6;
        g.moveTo(p.x, p.y - s);
        g.lineTo(p.x + s * 0.3, p.y - s * 0.3);
        g.lineTo(p.x + s, p.y);
        g.lineTo(p.x + s * 0.3, p.y + s * 0.3);
        g.lineTo(p.x, p.y + s);
        g.lineTo(p.x - s * 0.3, p.y + s * 0.3);
        g.lineTo(p.x - s, p.y);
        g.lineTo(p.x - s * 0.3, p.y - s * 0.3);
        g.fill();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const r of this.rings || []) {
      const k = 1 - r.life / r.max;
      g.globalAlpha = Math.max(0, r.life / r.max) * 0.8;
      g.strokeStyle = r.color;
      g.lineWidth = 10 * (1 - k) + 2;
      g.beginPath();
      g.ellipse(r.x, r.y, r.radius * k + 8, (r.radius * k + 8) * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.font = '700 15px "Trebuchet MS", system-ui, sans-serif';
    for (const t of this.texts) {
      g.globalAlpha = Math.min(1, t.life / 0.4);
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(30,20,10,0.85)';
      g.strokeText(t.str, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.str, t.x, t.y);
    }
    g.globalAlpha = 1;
  }
}
