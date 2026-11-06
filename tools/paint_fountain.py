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
# ---- detail: lily pads and coins in the basin, moss on the stone, carved spouts
rng2 = np.random.default_rng(12)
ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(ov)
for lx, ly in ((250, OY + 150), (610, OY + 158), (330, OY + 178), (560, OY + 184)):
    od.ellipse([lx - 30, ly - 12, lx + 30, ly + 12], fill=(72, 150, 62, 255), outline=(30, 80, 30, 255), width=3)
    od.polygon([(lx, ly), (lx + 32, ly - 8), (lx + 32, ly + 5)], fill=(60, 120, 150, 255))
    od.ellipse([lx - 6, ly - 12, lx + 6, ly - 2], fill=(250, 244, 232, 255))
for _ in range(14):
    cx_, cy_ = 300 + rng2.integers(0, 280), OY + 150 + rng2.integers(0, 50)
    od.ellipse([cx_ - 5, cy_ - 3, cx_ + 5, cy_ + 3], fill=(222, 178, 70, 255), outline=(120, 84, 30, 255))
for gx in (cx - 150, cx, cx + 150):                                     # lion-head spouts on the lower bowl
    od.ellipse([gx - 22, OY + 78, gx + 22, OY + 116], fill=(176, 164, 144, 255), outline=(70, 56, 44, 255), width=3)
    od.ellipse([gx - 8, OY + 92, gx + 8, OY + 106], fill=(36, 30, 28, 255))
    od.line([(gx, OY + 104), (gx, OY + 150)], fill=(150, 215, 240, 210), width=7)
mossl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
md = ImageDraw.Draw(mossl)
for _ in range(110):
    mx, my = rng2.integers(110, 790), OY + 300 + int(rng2.random() ** 0.6 * 160)
    rr = int(rng2.integers(5, 12))
    for col, dd in (((52, 100, 40, 235), 0), ((92, 152, 58, 235), -2), ((142, 196, 90, 235), -4)):
        md.ellipse([mx + dd - rr, my + dd - rr * 0.7, mx + dd + rr, my + dd + rr * 0.7], fill=col)
ma = np.asarray(mossl).copy(); ma[..., 3] = np.minimum(ma[..., 3], np.asarray(canvas)[..., 3])
canvas.alpha_composite(ov)
canvas.alpha_composite(Image.fromarray(ma))
out = canvas.crop(canvas.getbbox())
out = out.resize((int(out.width / 1.5), int(out.height / 1.5)), Image.LANCZOS)
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
