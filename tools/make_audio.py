#!/usr/bin/env python3
"""Synthesise Farmstead's original music, ambience and sound effects.

    python3 tools/make_audio.py            # writes assets/audio/*.ogg and updates the manifest

Everything here is generated from scratch with numpy (additive synthesis,
filtered noise and envelopes) and encoded to Ogg Vorbis with ffmpeg (gapless,
so the loops have no click), so the audio is original
and free to ship. It is functional placeholder-quality audio: a composer's
tracks and recorded foley can replace any file later under the same key.
"""
import json
import os
import subprocess
import tempfile
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio")
SR = 22050
rng = np.random.default_rng(7)


def t_of(sec):
    return np.arange(int(sec * SR)) / SR


def env(n, a=0.005, d=0.3, sustain=0.0, r=0.05):
    """Attack/decay envelope over n samples (exponential decay toward sustain)."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    dec = sustain + (1 - sustain) * np.exp(-(t - a).clip(0) / max(d, 1e-4))
    e = e * dec
    rel = int(r * SR)
    if rel and rel < n:
        e[-rel:] *= np.linspace(1, 0, rel)
    return e


def freq(note):
    """MIDI note number -> Hz."""
    return 440.0 * 2 ** ((note - 69) / 12)


def pluck(note, dur, bright=0.5):
    t = t_of(dur)
    f = freq(note)
    out = np.zeros_like(t)
    for k in range(1, 7):
        out += (bright ** (k - 1)) / k * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (2.5 + k * 1.6))
    return out * env(len(t), 0.004, dur, 0, 0.03)


def mallet(note, dur):
    t = t_of(dur)
    f = freq(note)
    out = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t * 18)
    return out * env(len(t), 0.002, 0.45, 0, 0.04)


def pad(notes, dur):
    t = t_of(dur)
    out = np.zeros_like(t)
    for n in notes:
        f = freq(n)
        for det in (-0.6, 0.0, 0.7):
            out += np.sin(2 * np.pi * (f + det) * t) * 0.5 + 0.15 * np.sin(2 * np.pi * 2 * (f + det) * t)
    a = min(0.6, dur / 3)
    e = np.minimum(1, t / a) * np.minimum(1, (dur - t) / a)
    return out * e / (len(notes) * 3)


def lowpass(x, alpha):
    """One-pole low-pass (alpha 0..1, smaller = darker)."""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def reverb(x, wet=0.25):
    out = x.copy()
    for delay, gain in ((0.031, 0.5), (0.047, 0.42), (0.071, 0.35), (0.113, 0.28), (0.167, 0.2)):
        d = int(delay * SR)
        y = np.zeros_like(x)
        y[d:] = x[:-d] * gain
        out += y * wet
    return out


def mix_at(buf, clip, at_sec, gain=1.0):
    i = int(at_sec * SR)
    j = min(len(buf), i + len(clip))
    buf[i:j] += clip[: j - i] * gain


def loop_tail(buf, tail):
    """Fold the ring-out after the loop end back onto the start so it loops seamlessly."""
    n = len(buf) - tail
    out = buf[:n].copy()
    out[:tail] += buf[n:]
    return out


def normalise(x, peak=0.85):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def song(bpm, bars, chords, melody, lead, bass_oct=-12, arp=(0, 1, 2, 1)):
    """chords: list of (root, triad offsets) per bar; melody: list of (beat, note, beats)."""
    beat = 60 / bpm
    total = bars * 4 * beat
    tail = int(2.5 * SR)
    buf = np.zeros(int(total * SR) + tail)
    for bar, (root, triad) in enumerate(chords * (bars // len(chords))):
        t0 = bar * 4 * beat
        notes = [root + o for o in triad]
        mix_at(buf, pad(notes, 4 * beat + 0.4), t0, 0.32)
        mix_at(buf, pluck(root + bass_oct, 2 * beat, 0.35), t0, 0.55)
        mix_at(buf, pluck(root + bass_oct + 7, 2 * beat, 0.35), t0 + 2 * beat, 0.45)
        for i in range(8):
            n = notes[arp[i % len(arp)]] + (12 if i % 4 == 3 else 0)
            mix_at(buf, pluck(n, beat * 1.2, 0.55), t0 + i * beat / 2, 0.22)
    for b, n, length in melody:
        mix_at(buf, lead(n, length * beat + 0.3), b * beat, 0.42)
    buf = reverb(buf, 0.3)
    return normalise(loop_tail(buf, tail), 0.7)


def farm_music():
    # G major, gentle 84 bpm: G - Em - C - D, 8 bars
    G, Em, C, D = (67, (0, 4, 7)), (64, (0, 3, 7)), (60, (0, 4, 7)), (62, (0, 4, 7))
    mel = [(0, 79, 1.5), (1.5, 78, 0.5), (2, 76, 1), (3, 74, 1), (4, 76, 2), (6, 71, 2),
           (8, 72, 1.5), (9.5, 74, 0.5), (10, 76, 1), (11, 79, 1), (12, 78, 3), (15, 74, 1),
           (16, 79, 1.5), (17.5, 81, 0.5), (18, 83, 1), (19, 81, 1), (20, 79, 2), (22, 76, 2),
           (24, 76, 1), (25, 74, 1), (26, 72, 1), (27, 71, 1), (28, 74, 4)]
    # second half: the same tune an octave lower, then a resolving ending
    mel += [(32 + b, n - 12, d) for b, n, d in mel[:16]]
    mel += [(52, 76, 1), (53, 74, 1), (54, 72, 1), (55, 74, 1), (56, 71, 2), (58, 69, 2), (60, 67, 4)]
    return song(84, 16, [G, Em, C, D], mel, lambda n, d: pluck(n, d, 0.45))


def village_music():
    # F major, 100 bpm, marimba lead: F - Dm - Bb - C
    F, Dm, Bb, C = (65, (0, 4, 7)), (62, (0, 3, 7)), (58, (0, 4, 7)), (60, (0, 4, 7))
    mel = []
    phrase = [77, 76, 74, 72, 74, 76, 77, 79, 81, 79, 77, 76, 74, 72, 70, 72]
    for i, n in enumerate(phrase * 2):
        if i % 8 != 7:
            mel.append((i * 1.0, n, 0.9))
    answer = [72, 74, 76, 77, 76, 74, 72, 69, 70, 72, 74, 72, 70, 69, 67, 65]
    for i, n in enumerate(answer * 2):
        if i % 4 != 3:
            mel.append((32 + i * 1.0, n, 0.9))
    return song(100, 16, [F, Dm, Bb, C], mel, mallet, arp=(0, 2, 1, 2))


def farm_ambience(sec=36.0):
    n = int(sec * SR)
    noise = rng.standard_normal(n)
    wind = lowpass(noise, 0.02)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * t_of(sec) / sec * 3)
    buf = wind * lfo * 1.6
    # birds: short chirps (pitch sweeps), a few per few seconds
    for _ in range(26):
        at = rng.uniform(0, sec - 1)
        base = rng.uniform(2600, 4200)
        for k in range(rng.integers(2, 5)):
            d = rng.uniform(0.05, 0.12)
            t = t_of(d)
            f = base + (rng.uniform(-900, 900)) * t / d
            chirp = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.005, d / 2, 0, 0.01)
            mix_at(buf, chirp, at + k * 0.13, 0.08)
    # crossfade the end into the start
    fade = int(2 * SR)
    out = buf[:-fade].copy()
    out[:fade] = out[:fade] * np.linspace(0, 1, fade) + buf[-fade:] * np.linspace(1, 0, fade)
    return normalise(out, 0.5)


def rain_loop(sec=12.0):
    n = int(sec * SR)
    hiss = rng.standard_normal(n)
    hiss = hiss - lowpass(hiss, 0.15)  # high-passed
    buf = hiss * 0.35 + lowpass(rng.standard_normal(n), 0.05) * 0.8
    for _ in range(int(sec * 30)):
        at = rng.uniform(0, sec - 0.05)
        d = t_of(0.03)
        drop = np.sin(2 * np.pi * rng.uniform(1500, 3500) * d) * np.exp(-d * 160)
        mix_at(buf, drop, at, rng.uniform(0.05, 0.15))
    fade = int(1.5 * SR)
    out = buf[:-fade].copy()
    out[:fade] = out[:fade] * np.linspace(0, 1, fade) + buf[-fade:] * np.linspace(1, 0, fade)
    return normalise(out, 0.55)


def engine_loop():
    sec = 1.6
    t = t_of(sec)
    f = 46.875  # whole number of cycles in 1.6 s, so it loops cleanly
    putt = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * f / 2 * t))
    x = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 9)) * putt
    x += lowpass(rng.standard_normal(len(t)), 0.08) * 0.6
    return normalise(x, 0.6)


def chime(notes, step=0.09, dur=0.5, voice=mallet):
    buf = np.zeros(int((step * len(notes) + dur) * SR))
    for i, n in enumerate(notes):
        mix_at(buf, voice(n, dur), i * step)
    return normalise(reverb(buf, 0.25), 0.8)


def noise_hit(dur, alpha, decay):
    t = t_of(dur)
    return lowpass(rng.standard_normal(len(t)), alpha) * np.exp(-t * decay)


def hammer():
    buf = np.zeros(int(0.9 * SR))
    for i in range(3):
        t = t_of(0.18)
        knock = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 35) + noise_hit(0.18, 0.4, 45) * 0.8
        mix_at(buf, knock, i * 0.26)
    return normalise(buf, 0.8)


def till():
    return normalise(noise_hit(0.22, 0.12, 18) + noise_hit(0.22, 0.5, 40) * 0.3, 0.7)


def clunk():
    t = t_of(0.35)
    x = (np.sin(2 * np.pi * 220 * t) + 0.6 * np.sin(2 * np.pi * 587 * t) + 0.4 * np.sin(2 * np.pi * 1230 * t)) * np.exp(-t * 14)
    return normalise(x + noise_hit(0.35, 0.6, 60) * 0.5, 0.75)


def vowel(f0, dur, formants, vibrato=0.0, glide=0.0):
    """Buzz source shaped by resonant peaks: a rough animal voice."""
    t = t_of(dur)
    f = f0 * (1 + glide * t / dur) * (1 + vibrato * np.sin(2 * np.pi * 6 * t))
    phase = 2 * np.pi * np.cumsum(f) / SR
    x = np.zeros_like(t)
    for k in range(1, 40):
        fk = f0 * k
        w = sum(np.exp(-((fk - F) / bw) ** 2) for F, bw in formants)
        x += w * np.sin(k * phase) / np.sqrt(k)
    return x * env(len(t), 0.04, dur, 0.7, dur * 0.4)


def moo():
    return normalise(vowel(105, 1.1, [(300, 120), (700, 200), (2400, 400)], 0.01, -0.25), 0.75)


def baa():
    return normalise(vowel(330, 0.7, [(600, 200), (1200, 300), (2600, 500)], 0.06, -0.05), 0.7)


def cluck():
    buf = np.zeros(int(0.6 * SR))
    for i, f0 in enumerate((620, 700, 560)):
        mix_at(buf, vowel(f0, 0.09, [(900, 300), (1800, 400)], 0.0, -0.3), i * 0.15)
    return normalise(buf, 0.7)


def door():
    t = t_of(0.5)
    creak = np.sin(2 * np.pi * np.cumsum(300 + 120 * np.sin(2 * np.pi * 9 * t)) / SR) * env(len(t), 0.02, 0.3, 0.2, 0.1) * 0.3
    return normalise(creak + noise_hit(0.5, 0.2, 9) * 0.4, 0.6)


def write_ogg(name, x, kbps=64):
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        path = tmp.name
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    dst = os.path.join(OUT, f"{name}.ogg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-codec:a", "libvorbis", "-b:a", f"{kbps}k", dst], check=True)
    os.unlink(path)
    return dst, len(x) / SR


CLIPS = {
    # key: (builder, kbps, kind)
    "music_farm": (farm_music, 80, "music"),
    "music_village": (village_music, 80, "music"),
    "ambience_farm": (farm_ambience, 56, "ambience"),
    "ambience_rain": (rain_loop, 56, "ambience"),
    "engine_loop": (engine_loop, 56, "loop"),
    "confirm": (lambda: chime([72, 79]), 64, "sfx"),
    "cancel": (lambda: chime([67, 60], 0.08, 0.35), 64, "sfx"),
    "unlock": (lambda: chime([72, 76, 79, 84, 88], 0.07, 0.7), 64, "sfx"),
    "levelup": (lambda: chime([67, 72, 76, 79, 84, 79, 84, 88], 0.08, 0.8), 64, "sfx"),
    "build": (hammer, 64, "sfx"),
    "till": (till, 64, "sfx"),
    "attach": (clunk, 64, "sfx"),
    "moo": (moo, 64, "sfx"),
    "baa": (baa, 64, "sfx"),
    "cluck": (cluck, 64, "sfx"),
    "door": (door, 64, "sfx"),
}


def main():
    mpath = os.path.join(ROOT, "assets", "manifest.json")
    manifest = json.load(open(mpath))
    for key, (fn, kbps, kind) in CLIPS.items():
        dst, sec = write_ogg(key, fn(), kbps)
        manifest["assets"][f"audio.{key}"] = {
            "file": os.path.relpath(dst, ROOT), "kind": kind, "seconds": round(sec, 2),
            "source": "tools/make_audio.py", "status": "original-synthesized",
            "notes": "Original audio synthesised in code (numpy) and encoded to Ogg Vorbis; functional placeholder quality.",
        }
        print(f"{key:15s} {sec:6.2f}s  {os.path.getsize(dst) // 1024} KB")
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
