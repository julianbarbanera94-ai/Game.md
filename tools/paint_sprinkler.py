#!/usr/bin/env python3
"""Paint the garden sprinkler in the game's hand-painted style.

    python3 tools/paint_sprinkler.py

No sprinkler art was supplied, so it is built from the game's own painted
pieces (the small mossy rocks, tilled soil, grass and flowers) around a brass
rotary sprinkler that is shaded here: every brass part gets real surface
normals, top-left key light with a warm bounce, soft specular, mottled
patina and verdigris, fine scratches and a thin warm-brown edge line like the
other props. Painted at 4x and reduced for clean edges.
Writes assets/derived/props/sprinkler.png and points prop.sprinkler at it.
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 4  # supersampling
W, H = 320 * S, 360 * S
rng = np.random.default_rng(11)
LIGHT = np.array([-0.55, -0.65, 0.52])
LIGHT /= np.linalg.norm(LIGHT)
VIEW = np.array([0.0, 0.0, 1.0])
HALF = (LIGHT + VIEW) / np.linalg.norm(LIGHT + VIEW)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def asset(key):
    m = json.load(open(os.path.join(ROOT, "assets", "manifest.json")))["assets"]
    return Image.open(os.path.join(ROOT, m[key]["file"])).convert("RGBA")


def value_noise(scale, octaves=4, seed=0):
    """Smooth fractal noise in [0, 1] over the canvas."""
    r = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        cells = max(2, int(scale * 2 ** o))
        grid = r.random((cells + 1, cells + 1)).astype(np.float32)
        small = Image.fromarray((grid * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        out += amp * np.asarray(small, np.float32) / 255
        tot += amp
        amp *= 0.5
    return out / tot


NOISE = value_noise(6, 5, 3)
FINE = value_noise(40, 3, 5)


# ---------------------------------------------------------------- brass shading
BRASS = np.array([[46, 26, 10], [104, 62, 20], [168, 112, 38], [214, 160, 66], [240, 204, 118], [255, 240, 196]], np.float32)


def ramp(t, cols):
    t = np.clip(t, 0, 1) * (len(cols) - 1)
    i = np.clip(t.astype(int), 0, len(cols) - 2)
    f = (t - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def shade(normal, mask, colors=BRASS, rough=0.35, patina=True):
    """Light a part from its normals; returns RGBA layer (premultiplied by mask)."""
    nx, ny, nz = normal
    diff = np.clip(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
    bounce = np.clip(-nx * 0.4 + ny * 0.6 + 0.1, 0, 1) * 0.18  # warm light from the soil below
    spec = np.clip(nx * HALF[0] + ny * HALF[1] + nz * HALF[2], 0, 1) ** (18 / rough)
    t = 0.12 + diff * 0.78 + bounce + (NOISE - 0.5) * 0.12 + (FINE - 0.5) * 0.06
    rgb = ramp(t, colors)
    rgb += spec[..., None] * np.array([255, 236, 190]) * 0.75
    if patina:
        # verdigris and dark tarnish gather in the shadowed, lower parts
        shadowed = np.clip(0.55 - diff, 0, 1)
        verd = np.clip((value_noise(14, 3, 9) - 0.62) * 4, 0, 1) * shadowed * 1.6
        rgb = rgb * (1 - verd[..., None] * 0.55) + np.array([92, 150, 120]) * verd[..., None] * 0.55
        tarnish = np.clip((NOISE - 0.6) * 2.5, 0, 1) * 0.25
        rgb *= (1 - tarnish[..., None])
    a = np.clip(mask, 0, 1)
    return np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.float32)


def capsule(ax, ay, bx, by, r0, r1=None):
    """Mask and normals of a round tube from a to b (radius may taper)."""
    r1 = r0 if r1 is None else r1
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / L2, 0, 1)
    px, py = ax + t * dx, ay + t * dy
    r = r0 + (r1 - r0) * t
    ox, oy = xx - px, yy - py
    d = np.sqrt(ox * ox + oy * oy)
    inside = d < r
    nz = np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1))
    nx, ny = ox / r, oy / r
    mask = np.clip((r - d) / 1.5, 0, 1)
    return mask, (nx * inside, ny * inside, nz * inside + (~inside) * 1.0)


def ellipsoid(cx, cy, rx, ry, squash=1.0):
    ox, oy = (xx - cx) / rx, (yy - cy) / ry
    d2 = ox * ox + oy * oy
    inside = d2 < 1
    nz = np.sqrt(np.clip(1 - d2, 0, 1)) * squash
    n = np.sqrt(ox * ox + oy * oy + nz * nz) + 1e-6
    mask = np.clip((1 - np.sqrt(d2)) * min(rx, ry) / 1.5, 0, 1)
    return mask, (ox / n * inside, oy / n * inside, nz / n * inside + (~inside))


def scratches(layer, mask, n=26, seed=4):
    r = np.random.default_rng(seed)
    img = Image.fromarray(layer.astype(np.uint8), "RGBA")
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    ys, xs = np.nonzero(mask > 0.9)
    if not len(xs):
        return layer
    for _ in range(n):
        i = r.integers(len(xs))
        x, y = xs[i], ys[i]
        ang = r.uniform(-0.6, 0.6)
        ln = r.uniform(6, 22) * S / 2
        d.line([(x, y), (x + np.cos(ang) * ln, y + np.sin(ang) * ln)], fill=(255, 236, 190, 70), width=max(1, S // 2))
    out = np.asarray(img, np.float32).copy()
    out[..., 3] = layer[..., 3]
    return out


def over(dst, src):
    a = src[..., 3:4] / 255
    dst[..., :3] = src[..., :3] * a + dst[..., :3] * (1 - a)
    dst[..., 3:4] = src[..., 3:4] + dst[..., 3:4] * (1 - a)
    return dst


def outline(mask, width=1.2 * S, color=(54, 32, 14)):
    """Thin warm-brown edge just outside a shape, like the painted props."""
    m = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8))
    grown = np.asarray(m.filter(ImageFilter.MaxFilter(int(width) * 2 + 1)).filter(ImageFilter.GaussianBlur(S * 0.5)), np.float32) / 255
    ring = np.clip(grown - mask, 0, 1) * 0.85
    return np.dstack([np.full((H, W, 3), color, np.float32), ring[..., None] * 255])


def paste(canvas, img, cx, bottom, width, flip=False, alpha=1.0):
    im = img.copy()
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    h = int(width * im.height / im.width)
    im = im.resize((int(width), h), Image.LANCZOS)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.alpha_composite(im, (int(cx - width / 2), int(bottom - h)))
    arr = np.asarray(layer, np.float32).copy()
    arr[..., 3] *= alpha
    return over(canvas, arr)


def main():
    canvas = np.zeros((H, W, 4), np.float32)
    cx = W / 2
    base_y = 300 * S  # where the pipe meets the ground

    # soft ground shadow
    sh = np.exp(-(((xx - cx - 10 * S) / (118 * S)) ** 2 + ((yy - base_y - 14 * S) / (34 * S)) ** 2) * 2.2)
    canvas = over(canvas, np.dstack([np.full((H, W, 3), (24, 34, 14), np.float32), sh[..., None] * 140]))

    # a patch of dark, damp tilled soil (the game's soil texture), with a wet ring
    soil = asset("plot.soil_dry").resize((240 * S, 220 * S), Image.LANCZOS)
    soil_arr = np.zeros((H, W, 4), np.float32)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.alpha_composite(soil, (int(cx - 120 * S), int(base_y - 110 * S)))
    soil_arr = np.asarray(layer, np.float32).copy()
    ell = ((xx - cx) / (92 * S)) ** 2 + ((yy - base_y) / (34 * S)) ** 2
    edge = np.clip((1 - ell) * 6 + (NOISE - 0.5) * 2.2, 0, 1)
    soil_arr[..., 3] = edge * 255 * (soil_arr[..., 3] > 0)
    wet = np.clip(1 - ell * 1.4, 0, 1) * 0.35
    soil_arr[..., :3] *= (1 - wet[..., None])
    canvas = over(canvas, soil_arr)

    # stones behind the riser, then grass behind
    rock = asset("foliage.rock_small")
    mossy = asset("foliage.rock_mossy")
    tall = asset("foliage.grass_tall")
    fern = asset("foliage.fern")
    canvas = paste(canvas, tall, cx - 92 * S, base_y - 6 * S, 120 * S)
    canvas = paste(canvas, fern, cx + 96 * S, base_y - 2 * S, 112 * S, flip=True)
    canvas = paste(canvas, rock, cx - 58 * S, base_y - 12 * S, 82 * S)
    canvas = paste(canvas, mossy, cx + 52 * S, base_y - 14 * S, 84 * S, flip=True)

    # ---------------- the sprinkler
    parts = []
    # riser pipe
    m, n = capsule(cx, base_y + 4 * S, cx, 182 * S, 12 * S)
    parts.append((m, shade(n, m)))
    # threaded collars
    for y, r in ((base_y - 6 * S, 21 * S), (238 * S, 17 * S), (196 * S, 16 * S)):
        m, n = ellipsoid(cx, y, r, 7 * S, 0.6)
        parts.append((m, shade(n, m, rough=0.3)))
    # arms: gently curved tubes tapering to the nozzles
    for side in (-1, 1):
        m1, n1 = capsule(cx, 172 * S, cx + side * 48 * S, 162 * S, 9 * S, 7.5 * S)
        m2, n2 = capsule(cx + side * 48 * S, 162 * S, cx + side * 88 * S, 168 * S, 7.5 * S, 6.5 * S)
        m = np.maximum(m1, m2)
        n = tuple(np.where(m1 >= m2, a, b) for a, b in zip(n1, n2))
        parts.append((m, shade(n, m)))
        # steel nozzle cap
        m, n = capsule(cx + side * 84 * S, 166 * S, cx + side * 100 * S, 172 * S, 8.5 * S)
        steel = np.array([[30, 34, 38], [70, 78, 86], [118, 128, 138], [168, 178, 186], [214, 222, 228], [250, 252, 255]], np.float32)
        parts.append((m, shade(n, m, colors=steel, rough=0.25, patina=False)))
    # hub (a squat dome) and its cap nut
    m, n = ellipsoid(cx, 172 * S, 25 * S, 20 * S, 0.9)
    parts.append((m, shade(n, m, rough=0.28)))
    m, n = ellipsoid(cx, 154 * S, 9 * S, 8 * S, 0.9)
    parts.append((m, shade(n, m, rough=0.25)))

    full = np.zeros((H, W), np.float32)
    for m, _ in parts:
        full = np.maximum(full, m)
    canvas = over(canvas, outline(full))
    for m, layer in parts:
        canvas = over(canvas, scratches(layer, m, n=10, seed=int(m.sum()) % 997))

    # contact shadow where the pipe enters the soil (ambient occlusion)
    ao = np.exp(-(((xx - cx) / (26 * S)) ** 2 + ((yy - base_y - 6 * S) / (8 * S)) ** 2) * 2) * (yy > base_y - 2 * S)
    canvas = over(canvas, np.dstack([np.full((H, W, 3), (30, 18, 8), np.float32), ao[..., None] * 120]))

    # stones and flowers in front of the riser
    canvas = paste(canvas, rock, cx - 20 * S, base_y + 40 * S, 70 * S, flip=True)
    canvas = paste(canvas, asset("foliage.flower_patch"), cx + 58 * S, base_y + 42 * S, 96 * S)
    canvas = paste(canvas, asset("foliage.flower_yellow"), cx - 84 * S, base_y + 38 * S, 84 * S, flip=True)

    # water beads on the nozzles: dark rim, light body, bright glint
    for bx, by, r in ((-104, 152, 6.5), (-112, 184, 5), (104, 150, 6), (114, 182, 5)):
        x0, y0, rr = cx + bx * S, by * S, r * S
        d = np.sqrt((xx - x0) ** 2 + (yy - y0) ** 2)
        body = np.clip((rr - d) / 1.5, 0, 1)
        shadeb = np.clip(((xx - x0) * 0.5 + (yy - y0) * 0.8) / rr, -1, 1)
        rgb = np.dstack([150 + shadeb * -40, 205 + shadeb * -30, 240 + shadeb * -10])
        canvas = over(canvas, outline(body, 0.8 * S, (40, 80, 110)))
        canvas = over(canvas, np.dstack([rgb, body[..., None] * 230]).astype(np.float32))
        g = np.clip((rr * 0.35 - np.sqrt((xx - x0 + rr * 0.35) ** 2 + (yy - y0 + rr * 0.35) ** 2)) / 1.2, 0, 1)
        canvas = over(canvas, np.dstack([np.full((H, W, 3), 255, np.float32), g[..., None] * 255]))

    img = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGBA").resize((W // S, H // S), Image.LANCZOS)
    img = img.crop(img.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox())
    out = os.path.join(ROOT, "assets", "derived", "props", "sprinkler.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, optimize=True)
    mpath = os.path.join(ROOT, "assets", "manifest.json")
    manifest = json.load(open(mpath))
    manifest["assets"]["prop.sprinkler"] = {
        "file": "assets/derived/props/sprinkler.png", "width": img.width, "height": img.height,
        "source": "tools/paint_sprinkler.py", "status": "painted-in-code",
        "notes": "Built from the game's painted rocks, soil, grass and flowers around a brass sprinkler shaded in code (normals, patina, scratches). No sprinkler art was supplied.",
    }
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(out, img.size)


if __name__ == "__main__":
    main()
