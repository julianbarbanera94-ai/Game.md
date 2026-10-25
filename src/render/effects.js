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
    };
    const p = presets[kind];
    for (let i = 0; i < p.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = p.speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - p.up * Math.random(),
        g: 220, life: p.life, max: p.life,
        size: p.size[0] + Math.random() * (p.size[1] - p.size[0]),
        color: p.colors[i % p.colors.length], sparkle: kind === 'harvest' || kind === 'coins',
      });
    }
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
    this.particles = this.particles.filter((p) => p.life > 0);
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
      if (p.sparkle) {
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
