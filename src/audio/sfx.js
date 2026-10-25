// Sound effects. Uses the Phase 1 placeholder WAVs where supplied and small
// synthesized cues for the rest. Fails silently if audio is unavailable.
const FILES = {
  coin: 'audio.coin_pickup', step: 'audio.footstep', harvest: 'audio.harvest',
  plant: 'audio.plant_seed', click: 'audio.ui_click', water: 'audio.watering',
};
const SYNTH = {
  till: [[180, 0.06, 'triangle'], [120, 0.08, 'triangle']],
  error: [[220, 0.08, 'square'], [165, 0.12, 'square']],
  quest: [[523, 0.09, 'sine'], [659, 0.09, 'sine'], [784, 0.16, 'sine']],
  refill: [[300, 0.08, 'sine'], [420, 0.1, 'sine']],
};

export class Sfx {
  constructor(assets) {
    this.assets = assets;
    this.ctx = null;
    this.buffers = new Map();
    this.muted = false;
    this.volume = 0.55;
  }

  async unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      await Promise.all(Object.entries(FILES).map(async ([name, key]) => {
        const url = this.assets.url(key);
        if (!url) return;
        const res = await fetch(url);
        this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      }));
    } catch (err) {
      console.warn('[audio] unavailable', err);
    }
  }

  play(name) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume;
    gain.connect(this.ctx.destination);
    const buf = this.buffers.get(name);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start();
      return;
    }
    let at = t;
    for (const [freq, dur, type] of SYNTH[name] || []) {
      const o = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(env).connect(gain);
      o.start(at);
      o.stop(at + dur + 0.02);
      at += dur * 0.8;
    }
  }
}
