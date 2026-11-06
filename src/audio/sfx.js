// Game audio: sound effects, music, ambience and the tractor engine, each on
// its own volume channel (Settings). Uses the Phase 1 WAVs and the original
// clips made by tools/make_audio.py; a few tiny cues are synthesised live.
// Fails silently if audio is unavailable (no AudioContext, blocked autoplay).
const FILES = {
  coin: 'audio.coin_pickup', step: 'audio.footstep', harvest: 'audio.harvest',
  plant: 'audio.plant_seed', click: 'audio.ui_click', water: 'audio.watering',
  confirm: 'audio.confirm', cancel: 'audio.cancel', unlock: 'audio.unlock', levelup: 'audio.levelup',
  build: 'audio.build', till: 'audio.till', attach: 'audio.attach', door: 'audio.door',
  moo: 'audio.moo', baa: 'audio.baa', cluck: 'audio.cluck',
};
// Loops are fetched after the effects so the game is responsive first.
const LOOPS = {
  music_farm: 'audio.music_farm', music_village: 'audio.music_village',
  ambience_farm: 'audio.ambience_farm', ambience_rain: 'audio.ambience_rain', engine: 'audio.engine_loop',
};
const SYNTH = {
  error: [[220, 0.08, 'square'], [165, 0.12, 'square']],
  quest: [[523, 0.09, 'sine'], [659, 0.09, 'sine'], [784, 0.16, 'sine']],
  refill: [[300, 0.08, 'sine'], [420, 0.1, 'sine']],
};
const FADE = 1.2; // seconds for music and ambience crossfades

export class Sfx {
  constructor(assets) {
    this.assets = assets;
    this.ctx = null;
    this.buffers = new Map();
    this.muted = false;
    this.volume = 0.55; // effects
    this.musicVolume = 0.45;
    this.ambienceVolume = 0.5;
    this.bus = null; // { sfx, music, ambience, master }
    this.tracks = { music: null, ambience: null }; // { name, src, gain }
    this.want = { music: null, ambience: null };
    this.engine = null; // { src, gain }
    this.played = []; // recent cue names (tests and debugging)
  }

  async unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const bus = (v) => { const g = this.ctx.createGain(); g.gain.value = v; return g; };
      this.bus = { master: bus(1), sfx: bus(this.volume), music: bus(this.musicVolume), ambience: bus(this.ambienceVolume) };
      this.bus.master.connect(this.ctx.destination);
      for (const k of ['sfx', 'music', 'ambience']) this.bus[k].connect(this.bus.master);
      this.apply();
      await this.load(FILES);
      await this.load(LOOPS);
      this.setMusic(this.want.music);
      this.setAmbience(this.want.ambience);
    } catch (err) {
      console.warn('[audio] unavailable', err);
    }
  }

  async load(map) {
    await Promise.all(Object.entries(map).map(async ([name, key]) => {
      const url = this.assets.url(key);
      if (!url) return;
      try {
        const res = await fetch(url);
        this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      } catch (err) {
        console.warn(`[audio] could not load ${key}`, err);
      }
    }));
  }

  // Volumes and mute from Settings.
  apply() {
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(this.volume, t, 0.05);
    this.bus.music.gain.setTargetAtTime(this.musicVolume, t, 0.05);
    this.bus.ambience.gain.setTargetAtTime(this.ambienceVolume, t, 0.05);
  }

  play(name) {
    this.played.push(name);
    if (this.played.length > 40) this.played.shift();
    if (this.muted || !this.ctx) return;
    const buf = this.buffers.get(name);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.bus.sfx);
      src.start();
      return;
    }
    let at = this.ctx.currentTime;
    for (const [freq, dur, type] of SYNTH[name] || []) {
      const o = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(env).connect(this.bus.sfx);
      o.start(at);
      o.stop(at + dur + 0.02);
      at += dur * 0.8;
    }
  }

  // Crossfade a looping track on the music or ambience channel (null = silence).
  crossfade(channel, name) {
    this.want[channel] = name;
    if (!this.ctx) return;
    const cur = this.tracks[channel];
    if ((cur?.name || null) === name) return;
    const t = this.ctx.currentTime;
    if (cur) {
      cur.gain.gain.setTargetAtTime(0, t, FADE / 3);
      cur.src.stop(t + FADE * 2);
    }
    this.tracks[channel] = null;
    const buf = name && this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, t, FADE / 3);
    src.connect(gain).connect(this.bus[channel]);
    src.start();
    this.tracks[channel] = { name, src, gain };
  }

  setMusic(name) { this.crossfade('music', name); }
  setAmbience(name) { this.crossfade('ambience', name); }

  // Tractor engine: idles when level is 0, revs with speed (0..1); null stops it.
  setEngine(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (level == null) {
      if (this.engine) {
        this.engine.gain.gain.setTargetAtTime(0, t, 0.15);
        this.engine.src.stop(t + 0.8);
        this.engine = null;
      }
      return;
    }
    if (!this.engine) {
      const buf = this.buffers.get('engine');
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.bus.sfx);
      src.start();
      this.engine = { src, gain };
    }
    this.engine.src.playbackRate.setTargetAtTime(0.8 + level * 0.9, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(0.35 + level * 0.35, t, 0.1);
  }
}
