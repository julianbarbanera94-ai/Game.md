#!/usr/bin/env python3
"""Paint the fishing rod and fish item icons (no fishing art was supplied).

    python3 tools/paint_fishing.py

Each icon is shaded in code like the other painted props: a top-left key
light on every part, a soft bounce, a little specular, scale or grain texture
and a thin warm-brown edge instead of a black outline. Painted at 4x and
reduced for clean edges. Writes assets/derived/icons/*.png and registers
icon.tool_fishing_rod and icon.fish_* in the manifest.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 4
N = 240 * S
EDGE = (60, 36, 16)
LIGHT = np.array([-0.5, -0.7, 0.5])
LIGHT /= np.linalg.norm(LIGHT)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)


def grain(seed, scale=30):
    r = np.random.default_rng(seed)
    cells = max(2, N // scale)
    g = Image.fromarray((r.random((cells, cells)) * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC)
    return np.asarray(g, np.float32) / 255


def tint(base, t, noise):
    """Colour ramp from shadow to highlight, with a little natural variation."""
    dark = np.array(base, np.float32) * 0.45
    light = np.array(base, np.float32) * 1.12 + 22
    light = np.clip(light, 0, 255)
    t = np.clip(t + (noise - 0.5) * 0.18, 0, 1)[..., None]
    return dark * (1 - t) + light * t


def lit(mask, nx, ny, nz):
    """Diffuse term from a surface normal field."""
    diff = np.clip(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
    return 0.25 + 0.75 * diff


def over(canvas, rgb, a):
    a = np.clip(a, 0, 1)[..., None]
    out = canvas.copy()
    out[..., :3] = rgb * a + canvas[..., :3] * (1 - a)
    out[..., 3:4] = np.clip(canvas[..., 3:4] + a * 255 * (1 - canvas[..., 3:4] / 255), 0, 255)
    return out


def edge(mask, width=1.4):
    m = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8))
    grown = np.asarray(m.filter(ImageFilter.MaxFilter(int(width * S) * 2 + 1)).filter(ImageFilter.GaussianBlur(S * 0.4)), np.float32) / 255
    return np.clip(grown - mask, 0, 1)


def blob(mask):
    """Shape mask -> lit, textured colour layer with an edge."""
    d = np.clip(mask, 0, 1)
    # normals from a blurred height (the distance inside the shape)
    h = Image.fromarray((d * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(S * 8))
    h = np.asarray(h, np.float32) / 255
    gy, gx = np.gradient(h)
    nx, ny = -gx * 14, -gy * 14
    nz = np.ones_like(nx)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    return lit(d, nx / n, ny / n, nz / n) * d, d


def finish(canvas_layers):
    out = np.zeros((N, N, 4), np.float32)
    for rgb, a in canvas_layers:
        out = over(out, rgb, a)
    img = Image.fromarray(out.astype(np.uint8), "RGBA").resize((240, 240), Image.LANCZOS)
    box = img.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    return img.crop(box) if box else img


def draw_mask(fn):
    img = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(img)
    fn(d)
    return np.asarray(img, np.float32) / 255


def body_outline(cx, cy, L, H):
    """Curved fish silhouette: a full belly, tapering to a slim tail stalk and a blunt nose."""
    pts_top, pts_bot = [], []
    for i in range(0, 61):
        t = i / 60  # 0 = nose, 1 = tail
        x = cx + L * (0.42 - t * 0.9)
        # body half-height: fullest just behind the head, pinched at the tail
        h = H * (math.sin(math.pi * min(1, (t + 0.06) ** 0.85)) ** 0.9) * (1 - 0.5 * max(0, t - 0.55) / 0.45)
        h = max(h, 0.0)
        pts_top.append((x, cy - h))
        pts_bot.append((x, cy + h * 0.98))
    return pts_top + pts_bot[::-1]


def draw_poly(pts):
    img = Image.new("L", (N, N), 0)
    ImageDraw.Draw(img).polygon([(x, y) for x, y in pts], fill=255)
    return np.asarray(img, np.float32) / 255


def fish(name, body, fin, tail_scale=1.0, stripes=False, spots=False, seed=1):
    cx, cy = N * 0.5, N * 0.5
    L, H = N * 0.4, N * 0.19
    m_body = draw_poly(body_outline(cx, cy, L, H))
    # forked tail
    tx = cx - L * 0.5 - N * 0.02
    m_tail = draw_poly([(tx + N * 0.02, cy), (tx - N * 0.2 * tail_scale, cy - N * 0.15 * tail_scale), (tx - N * 0.12, cy), (tx - N * 0.2 * tail_scale, cy + N * 0.15 * tail_scale)])
    # dorsal fin: a soft, rounded sail along the back
    dor = [(cx - N * 0.12 + i * N * 0.02, cy - H * 0.82 - N * 0.1 * math.sin(math.pi * i / 10)) for i in range(11)]
    m_dor = draw_poly(dor + [(cx + N * 0.1, cy - H * 0.5), (cx - N * 0.12, cy - H * 0.5)])
    # pectoral fin on the side
    pec = [(cx + N * 0.12, cy + H * 0.1), (cx + N * 0.04, cy + H * 0.55), (cx - N * 0.02, cy + H * 0.2)]
    m_pec = draw_poly(pec)
    layers = []
    for m, base in ((m_tail, fin), (m_dor, fin), (m_pec, fin)):
        t, a = blob(m)
        layers.append((tint(base, t, grain(seed + 3, 22)), a))
    t, a = blob(m_body)
    rgb = tint(body, t, grain(seed, 26))
    yfall = np.clip((yy - cy) / (H * 1.1), -1, 1)[..., None]
    rgb = rgb * (1 - 0.22 * yfall) + np.array([250, 240, 210]) * 0.14 * np.clip(yfall, 0, 1)  # pale belly
    rgb = rgb * (1 + 0.12 * np.clip(-yfall, 0, 1))  # back catches the light
    if stripes:
        for k in range(-3, 4):
            x0 = cx - L * 0.2 + k * N * 0.055
            band = np.exp(-((xx - x0) / (N * 0.011)) ** 2) * (np.abs(yy - cy) < H * 0.8)
            rgb = rgb * (1 - 0.32 * band[..., None])
    if spots:
        r = np.random.default_rng(seed)
        for _ in range(48):
            x, y = cx + r.uniform(-L * 0.4, L * 0.25), cy + r.uniform(-H * 0.7, H * 0.7)
            rad = r.uniform(N * 0.006, N * 0.014)
            sp = np.clip((rad - np.hypot(xx - x, yy - y)) / (S * 1.2), 0, 1)
            rgb = rgb * (1 - 0.5 * sp[..., None]) + np.array([30, 40, 20]) * 0.45 * sp[..., None]
    sc = np.abs(np.sin((xx + yy * 0.5) / (S * 4.5))) * np.abs(np.sin((yy - xx * 0.3) / (S * 4.5)))
    rgb = rgb * (1 - 0.08 * sc[..., None])
    layers.append((rgb, a))
    # eye, set just behind the nose
    ex, ey = cx + L * 0.22, cy - H * 0.22
    eye = np.clip((N * 0.034 - np.hypot(xx - ex, yy - ey)) / (S * 1.2), 0, 1)
    pup = np.clip((N * 0.02 - np.hypot(xx - ex - S, yy - ey)) / (S * 1.2), 0, 1)
    glint = np.clip((S * 3.5 - np.hypot(xx - ex - S * 2.5, yy - ey - S * 2.5)) / S, 0, 1)
    layers.append((np.full((N, N, 3), 245.0), eye))
    layers.append((np.full((N, N, 3), 20.0), pup))
    layers.append((np.full((N, N, 3), 255.0), glint))
    # belly-side gill arc and warm-brown outlines
    gill = np.clip(1 - np.abs(np.hypot(xx - (cx + L * 0.12), (yy - cy) * 1.1) - H * 0.55) / (S * 1.2), 0, 1) * (xx < cx + L * 0.12) * (yy > cy - H * 0.9)
    layers.append((np.full((N, N, 3), (80, 50, 22), np.float32), gill * 0.55))
    for m in (m_body, m_tail, m_dor, m_pec):
        layers.append((np.full((N, N, 3), EDGE, np.float32), edge(m, 1.1)))
    return layers


def rod():
    layers = []
    # the rod: a long tapering shaft from bottom-left to top-right
    def shaft(d):
        d.line([(N * 0.12, N * 0.9), (N * 0.86, N * 0.12)], fill=255, width=int(N * 0.05))
    m = draw_mask(shaft)
    m_t, a = blob(m)
    layers.append((tint((160, 110, 56), m_t, grain(9, 40)), a))
    # cork grip bands (darker, grained)
    def grip(d):
        d.line([(N * 0.12, N * 0.9), (N * 0.26, N * 0.76)], fill=255, width=int(N * 0.075))
    mg = draw_mask(grip)
    t, a = blob(mg)
    layers.append((tint((176, 124, 70), t, grain(4, 14)), a))
    # reel: a round brass-and-wood reel with a spool and handle
    rx, ry = N * 0.42, N * 0.58
    def reel(d):
        d.ellipse([rx - N * 0.1, ry - N * 0.1, rx + N * 0.1, ry + N * 0.1], fill=255)
    mr = draw_mask(reel)
    t, a = blob(mr)
    layers.append((tint((200, 150, 60), t, grain(12, 30)), a))
    def spool(d):
        d.ellipse([rx - N * 0.055, ry - N * 0.055, rx + N * 0.055, ry + N * 0.055], fill=255)
    ms = draw_mask(spool)
    t, a = blob(ms)
    layers.append((tint((230, 190, 90), t, grain(13, 20)), a))
    # handle crank
    def crank(d):
        d.line([(rx + N * 0.1, ry), (rx + N * 0.16, ry - N * 0.04)], fill=255, width=int(N * 0.02))
        d.ellipse([rx + N * 0.13, ry - N * 0.08, rx + N * 0.19, ry - N * 0.02], fill=255)
    mc = draw_mask(crank)
    layers.append((np.full((N, N, 3), (120, 84, 40), np.float32), mc))
    # line and hook
    def line(d):
        pts = [(N * 0.86, N * 0.12)]
        for i in range(1, 40):
            t = i / 40
            x = N * 0.86 + (N * 0.84 - N * 0.86) * t
            y = N * 0.12 + (N * 0.84 - N * 0.12) * t
            pts.append((x, y))
        d.line(pts, fill=255, width=max(2, int(S * 1.2)))
    ml = draw_mask(line)
    layers.append((np.full((N, N, 3), (240, 238, 226), np.float32), ml))
    def hook(d):
        d.arc([N * 0.8, N * 0.8, N * 0.92, N * 0.98], start=20, end=300, fill=255, width=int(S * 3))
    mh = draw_mask(hook)
    layers.append((np.full((N, N, 3), (190, 196, 200), np.float32), mh))
    # the rod's edges
    for m in (m, mg, mr):
        layers.append((np.full((N, N, 3), EDGE, np.float32), edge(m, 1.2)))
    return layers


def main():
    out_dir = os.path.join(ROOT, "assets", "derived", "icons")
    os.makedirs(out_dir, exist_ok=True)
    specs = {
        "tool_fishing_rod": rod(),
        "fish_perch": fish("perch", (196, 170, 70), (210, 90, 60), stripes=True, seed=2),
        "fish_carp": fish("carp", (176, 140, 80), (196, 110, 70), spots=True, seed=3),
        "fish_trout": fish("trout", (150, 170, 150), (210, 130, 110), spots=True, seed=5),
        "fish_bass": fish("bass", (110, 150, 80), (150, 180, 120), stripes=True, seed=7),
        "fish_pike": fish("pike", (120, 150, 110), (170, 190, 140), tail_scale=1.1, stripes=True, seed=8),
    }
    mpath = os.path.join(ROOT, "assets", "manifest.json")
    manifest = json.load(open(mpath))
    for key, layers in specs.items():
        img = finish(layers)
        name = f"icon.{key}"
        rel = f"assets/derived/icons/{key}.png"
        img.save(os.path.join(ROOT, rel), optimize=True)
        manifest["assets"][name] = {
            "file": rel, "width": img.width, "height": img.height, "source": "tools/paint_fishing.py",
            "status": "painted-in-code",
            "notes": "Painted in code to match the game's icons (no fishing art was supplied); replace with hand-painted art when available.",
        }
        print(f"{name:26s} {img.size}")
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
