#!/usr/bin/env python3
"""Paint the village fountain from the game's own painted well stonework.

    python3 tools/paint_fountain.py

No fountain art was supplied. The round stone basin is cut from the painted well
(its real stone blocks, outlines and lighting), the bucket is replaced by pond
water from the game's own water texture, and a two-tier stone pedestal (the same
blocks, rebuilt) carries shaded water jets. Writes assets/derived/props/fountain.png
and registers prop.fountain.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = json.load(open(os.path.join(ROOT, "assets", "manifest.json")))
A = M["assets"]
img = lambda k: Image.open(os.path.join(ROOT, A[k]["file"])).convert("RGBA")
K = 3  # work at 3x the well's pixels
well = img("building.well_building").crop((60, 190, 360, 400)).resize((900, 630), Image.LANCZOS)
W, H = 900, 1000
OY = 370  # basin sits low in the canvas so the pedestal and spray fit above it

def mask(fn):
    m = Image.new("L", (W, H), 0)
    fn(ImageDraw.Draw(m))
    return m.filter(ImageFilter.GaussianBlur(1.6))

# ---- basin: the well's stonework inside a hand-drawn silhouette
def sil(d):
    d.ellipse((95, 22 + OY - 370 + 0, 790, 330), fill=255) if False else None
bm = Image.new("L", (900, 630), 0)
d = ImageDraw.Draw(bm)
d.ellipse((95, 95, 785, 345), fill=255)                     # rim top
d.rectangle((108, 230, 772, 400), fill=255)                  # wall
d.ellipse((108, 330, 772, 540), fill=255)                    # rounded bottom
bm = bm.filter(ImageFilter.GaussianBlur(1.4))
basin = well.copy()
# water over the bucket: pond water seen through the opening
pond = img("terrain2.pond_water").resize((900, 630), Image.LANCZOS)
wm = Image.new("L", (900, 630), 0)
ImageDraw.Draw(wm).ellipse((262, 62, 622, 222), fill=255)
wm = wm.filter(ImageFilter.GaussianBlur(3))
pa = np.asarray(pond, np.float32)
tint = np.array([0.6, 0.85, 0.95, 1.0], np.float32)
pa[..., :3] = np.clip(pa[..., :3] * tint[:3] * 0.95 + 18, 0, 255)
pond = Image.fromarray(pa.astype(np.uint8))
basin.paste(pond, (0, 0), wm)
a = np.asarray(basin).copy()
a[..., 3] = np.minimum(a[..., 3], np.asarray(bm))
basin = Image.fromarray(a)

canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
canvas.alpha_composite(basin, (0, OY))

# stone sampled from the basin rim for tiers
rim = well.crop((200, 360, 700, 480))  # solid front-wall blocks
def stone_tier(cx, top, rx, ry, height):
    """A drum of rebuilt stone: rim ellipse on top, wall of tiled blocks below."""
    t = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wall = Image.new("RGBA", (2 * rx, height + 2 * ry), (0, 0, 0, 0))
    for r_, y in enumerate(range(0, height + 2 * ry, 56)):
        for x in range(-70 * (r_ % 2), 2 * rx, 150):
            wall.alpha_composite(rim.resize((150, 60)), (x, y))
    wm_ = Image.new("L", wall.size, 0)
    dd = ImageDraw.Draw(wm_)
    dd.rectangle((0, ry, 2 * rx, ry + height), fill=255)
    dd.ellipse((0, height, 2 * rx, height + 2 * ry), fill=255)
    wm_ = wm_.filter(ImageFilter.GaussianBlur(1.2))
    wa = np.asarray(wall).copy()
    wa[..., 3] = np.minimum(wa[..., 3], np.asarray(wm_))
    # curve shading: darker toward the sides
    xs = np.linspace(-1, 1, wall.width)[None, :, None]
    wa[..., :3] = (wa[..., :3] * (1 - 0.35 * xs ** 2)).astype(np.uint8)
    t.alpha_composite(Image.fromarray(wa), (cx - rx, top))
    # top rim ellipse (lit)
    top_e = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(top_e).ellipse((cx - rx, top, cx + rx, top + 2 * ry), fill=(176, 168, 152, 255), outline=(70, 54, 40, 255), width=4)
    ImageDraw.Draw(top_e).ellipse((cx - rx + 18, top + 10, cx + rx - 18, top + 2 * ry - 10), fill=(86, 140, 150, 255))
    return t, top_e

# pedestal: wide bowl, narrow column, small bowl
cx = 440
col = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(col)
for y in range(OY - 30, OY + 120):
    pass
t1, e1 = stone_tier(cx, OY + 20, 205, 55, 70)        # lower bowl
t2, e2 = stone_tier(cx, OY - 175, 52, 16, 245)       # column, standing in the lower bowl
t3, e3 = stone_tier(cx, OY - 215, 125, 32, 34)       # upper bowl
canvas.alpha_composite(t1); canvas.alpha_composite(e1)
canvas.alpha_composite(t2); canvas.alpha_composite(e2)
canvas.alpha_composite(t3); canvas.alpha_composite(e3)

# ---- water: jets and falling sheets, soft blue-white with a highlight edge
spray = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(spray)
def jet(x0, y0, x1, y1, lift, w):
    pts = []
    for i in range(41):
        t = i / 40
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t - lift * 4 * t * (1 - t)
        pts.append((x, y))
    sd.line(pts, fill=(150, 215, 240, 205), width=w, joint="curve")
    sd.line([(px - w * 0.2, py - w * 0.2) for px, py in pts], fill=(240, 252, 255, 235), width=max(2, w // 3), joint="curve")
for dx in (-95, -55, -20, 20, 55, 95):
    jet(cx + dx * 0.15, OY - 200, cx + dx * 1.15, OY - 110 + abs(dx) * 0.1, 90 + (60 - abs(dx)) * 0.7, 9)
jet(cx, OY - 200, cx, OY - 320, 0, 12)           # central spout
for dx in (-185, -140, -90, 90, 140, 185):       # sheets over the lower bowl lip
    jet(cx + dx * 0.62, OY - 190, cx + dx, OY + 60, 30, 8)
spray = spray.filter(ImageFilter.GaussianBlur(1.1))
canvas.alpha_composite(spray)
# droplets
rng = np.random.default_rng(4)
dr = ImageDraw.Draw(canvas)
for _ in range(60):
    x = cx + rng.normal(0, 70); y = OY - 300 + abs(rng.normal(0, 60)) + rng.random() * 150
    r = rng.integers(2, 5)
    dr.ellipse((x - r, y - r, x + r, y + r), fill=(235, 250, 255, 190))
out = canvas.crop(canvas.getbbox())
out = out.resize((out.width // 3, out.height // 3), Image.LANCZOS)
dest = os.path.join(ROOT, "assets", "derived", "props", "fountain.png")
os.makedirs(os.path.dirname(dest), exist_ok=True)
out.save(dest, optimize=True)
A["prop.fountain"] = {
    "file": "assets/derived/props/fountain.png", "width": out.width, "height": out.height,
    "source": "tools/paint_fountain.py", "status": "painted-in-code",
    "notes": "Basin cut from the game's painted well, pond water texture, stone tiers rebuilt from the well's blocks, jets painted in code. No fountain art was supplied.",
}
json.dump(M, open(os.path.join(ROOT, "assets", "manifest.json"), "w"), indent=2)
print(out.size)
