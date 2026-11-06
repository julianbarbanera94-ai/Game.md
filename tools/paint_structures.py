#!/usr/bin/env python3
"""Paint the farm and village structures that had no art: silo, clock tower, windmill
(4 sail frames), greenhouse (empty and planted), waterfall (4 water frames) and the
four fruit trees.

    python3 tools/paint_structures.py            # all
    python3 tools/paint_structures.py silo       # one

No art was supplied for these, so every surface is cut from the game's own painted
buildings and terrain (barn planks, slate and clay roof tiles, well stone, pond
water, oak and blossom canopies), tiled and shaded in code with a top-left key
light, a warm-brown edge and a grass skirt like the other props.
Writes assets/derived/props/*.png and registers them in the manifest.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MPATH = os.path.join(ROOT, "assets", "manifest.json")
M = json.load(open(MPATH))
A = M["assets"]
S = 3
EDGE = (62, 38, 18, 255)
OUT = os.path.join(ROOT, "assets", "derived", "props")
os.makedirs(OUT, exist_ok=True)

_cache = {}
def img(k):
    if k not in _cache:
        _cache[k] = Image.open(os.path.join(ROOT, A[k]["file"])).convert("RGBA")
    return _cache[k]

BOXES = {  # (asset, box) patches that are solid material
    "plank": ("building.small_barn", (72, 160, 110, 200)),
    "slate": ("building.small_barn", (95, 50, 150, 100)),
    "bluslate": ("building.well_building", (80, 45, 185, 100)),
    "clay": ("building.starter_house", (250, 120, 420, 175)),
    "stone": ("building.well_building", (127, 310, 293, 340)),
    "grass": ("terrain.grass_detailed", (40, 40, 400, 430)),
    "soil": ("terrain.tilled_soil_detailed", (60, 60, 400, 380)),
    "water": ("terrain2.pond_water", (40, 40, 430, 400)),
}

def patch(name, scale=1.0):
    k, b = BOXES[name]
    p = img(k).crop(b)
    if scale != 1:
        p = p.resize((max(2, int(p.width * scale)), max(2, int(p.height * scale))), Image.LANCZOS)
    return p

def fill(name, w, h, scale=1.0):
    """Mirror-tile a painted patch over w x h (mirroring hides the seams)."""
    p = patch(name, scale)
    out = Image.new("RGBA", (w, h))
    pw, ph = p.size
    for iy, y in enumerate(range(0, h, ph)):
        for ix, x in enumerate(range(0, w, pw)):
            t = p
            if ix % 2: t = t.transpose(Image.FLIP_LEFT_RIGHT)
            if iy % 2: t = t.transpose(Image.FLIP_TOP_BOTTOM)
            out.paste(t, (x, y))
    return out


# ---- painted materials: blocks, planks and tiles drawn in the game's palette
PAL = {
    "stone": ((176, 164, 144), (214, 204, 184), (116, 104, 90), (70, 56, 44)),
    "plank": ((176, 54, 34), (212, 82, 48), (112, 30, 20), (66, 20, 12)),
    "clay": ((204, 86, 46), (238, 128, 74), (130, 48, 26), (84, 30, 16)),
    "bluslate": ((92, 116, 172), (136, 162, 210), (54, 68, 112), (34, 42, 74)),
}
def _jit(c, r, amt):
    d = (r.random() - 0.5) * 2 * amt
    return tuple(int(max(0, min(255, v + d))) for v in c)
def _mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))
_matcache = {}
def mat(kind, w, h, k=1.0, seed=3, joints=True):
    key = (kind, w, h, k, seed, joints)
    if key in _matcache:
        return _matcache[key]
    base, light, dark, line = PAL[kind]
    r = np.random.default_rng(seed)
    im = Image.new("RGBA", (w, h), line + (255,))
    d = ImageDraw.Draw(im)
    if kind == "stone":
        rh = int(20 * S * k); y = 0; row = 0
        while y < h:
            x = -int(r.random() * 40 * S * k)
            while x < w:
                bw = int((34 + r.random() * 16) * S * k)
                c = _jit(base, r, 18)
                x0, y0, x1, y1 = x + S, y + S, x + bw - S, y + rh - S
                d.rounded_rectangle([x0, y0, x1, y1], radius=int(5 * S * k), fill=c)
                d.rounded_rectangle([x0, y0, x1, y0 + int(7 * S * k)], radius=int(5 * S * k), fill=_mix(c, light, 0.55))
                d.rounded_rectangle([x0, y1 - int(5 * S * k), x1, y1], radius=int(4 * S * k), fill=_mix(c, dark, 0.45))
                d.line([(x0 + S * 2, y0 + S * 2), (x0 + S * 2, y1 - S * 3)], fill=_mix(c, light, 0.35), width=S)
                x += bw
            y += rh; row += 1
    elif kind == "plank":
        pw = int(17 * S * k); x = 0
        while x < w:
            c = _jit(base, r, 16)
            d.rectangle([x + S, 0, x + pw - S, h], fill=c)
            d.rectangle([x + S, 0, x + S * 3, h], fill=_mix(c, light, 0.5))
            d.rectangle([x + pw - S * 4, 0, x + pw - S, h], fill=_mix(c, dark, 0.4))
            for _ in range(5):
                gx = x + S * 3 + r.random() * (pw - S * 8); y = r.random() * h; L = (20 + r.random() * 60) * S
                d.line([(gx, y), (gx + (r.random() - 0.5) * S * 2, y + L)], fill=_mix(c, dark, 0.4), width=max(1, S // 2))
            if r.random() < 0.18:
                ky = r.random() * h; kx = x + pw / 2
                d.ellipse([kx - S * 3, ky - S * 4, kx + S * 3, ky + S * 4], fill=_mix(c, dark, 0.55))
            x += pw
        for yb in (range(0, h, int(95 * S * k)) if joints else ()):  # butt joints
            d.line([(0, yb), (w, yb)], fill=line, width=S)
    else:  # roof tiles, overlapping rows
        th = int(15 * S * k); tw = int(20 * S * k); y = 0; row = 0
        while y < h + th:
            x = -(tw // 2) * (row % 2)
            while x < w:
                c = _jit(base, r, 18)
                d.rounded_rectangle([x + S, y - th, x + tw - S, y + th - S], radius=int(7 * S * k), fill=c)
                d.rounded_rectangle([x + S, y - th, x + tw - S, y - th + int(10 * S * k)], radius=int(6 * S * k), fill=_mix(c, light, 0.45))
                d.arc([x + S, y - th * 0.1, x + tw - S, y + th * 1.1], 0, 180, fill=line, width=S * 2)
                d.line([(x + S, y - th), (x + S, y + th * 0.6)], fill=_mix(c, dark, 0.5), width=S)
                x += tw
            y += th; row += 1
    n = (np.asarray(Image.fromarray((r.random((h // (3 * S) + 2, w // (3 * S) + 2)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255 - 0.5) * 22
    a = np.asarray(im).astype(np.float32)
    a[..., :3] = np.clip(a[..., :3] + n[..., None], 0, 255)
    out = Image.fromarray(a.astype(np.uint8))
    _matcache[key] = out
    return out

def noise(w, h, cells, seed):
    r = np.random.default_rng(seed)
    g = Image.fromarray((r.random((cells, max(2, int(cells * h / w)))) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(g, np.float32) / 255

class Scene:
    def __init__(self, w, h):
        self.w, self.h = w * S, h * S
        self.im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
    def mask(self, fn):
        m = Image.new("L", (self.w, self.h), 0)
        d = ImageDraw.Draw(m)
        fn(d, lambda pts: [(x * S, y * S) for x, y in pts])
        return m
    def part(self, m, tex, shade=None, edge=True):
        m = m.filter(ImageFilter.GaussianBlur(S * 0.3))
        a = np.asarray(tex.convert("RGBA")).astype(np.float32)
        if shade is not None:
            sh_ = np.asarray(shade, np.float32)
            a[..., :3] *= sh_ if sh_.ndim == 0 else sh_[..., None]
        mm = np.asarray(m, np.float32) / 255
        lit = np.clip(mm - np.asarray(ImageChops.offset(m, 2 * S, 2 * S), np.float32) / 255, 0, 1)
        dk = np.clip(mm - np.asarray(ImageChops.offset(m, -2 * S, -2 * S), np.float32) / 255, 0, 1)
        gr = noise(self.w, self.h, 7, 11)
        a[..., :3] *= (1 + 0.2 * lit - 0.3 * dk)[..., None] * (0.9 + 0.2 * gr)[..., None]
        part = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        part.putalpha(ImageChops.multiply(part.getchannel("A"), m))
        if edge:
            e = m.point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MaxFilter(2 * S + 1)).filter(ImageFilter.GaussianBlur(S * 0.3))
            eimg = Image.new("RGBA", (self.w, self.h), EDGE)
            eimg.putalpha(e)
            self.im.alpha_composite(eimg)
        self.im.alpha_composite(part)
    def solid(self, m, rgb, shade=None, edge=True):
        self.part(m, Image.new("RGBA", (self.w, self.h), rgb + (255,)), shade, edge)
    def sprite(self, key, cx, by, width, flip=False, shadow=True):
        s = img(key)
        if shadow:   # soft contact shadow, light from the top-left so it falls right and down
            sh = Image.new("L", (self.w, self.h), 0)
            ImageDraw.Draw(sh).ellipse([(cx - width * 0.42 + width * 0.08) * S, (by - 7) * S, (cx + width * 0.5 + width * 0.12) * S, (by + 9) * S], fill=120)
            sh = sh.filter(ImageFilter.GaussianBlur(S * 3.5))
            shim = Image.new("RGBA", (self.w, self.h), (26, 34, 18, 255)); shim.putalpha(sh)
            self.im.alpha_composite(shim)
        h = int(s.height * width * S / s.width)
        s = s.resize((int(width * S), h), Image.LANCZOS)
        if flip: s = s.transpose(Image.FLIP_LEFT_RIGHT)
        self.im.alpha_composite(s, (int(cx * S - s.width / 2), int(by * S - h)))
    def skirt(self, cx, cy, rx, ry):
        """Soft shadow and a feathered patch of the game's grass under a structure."""
        sh = Image.new("L", (self.w, self.h), 0)
        ImageDraw.Draw(sh).ellipse(((cx - rx * 1.05) * S, (cy - ry * 0.85) * S, (cx + rx * 1.15) * S, (cy + ry * 1.1) * S), fill=95)
        sh = sh.filter(ImageFilter.GaussianBlur(S * 6))
        shim = Image.new("RGBA", (self.w, self.h), (30, 40, 20, 255)); shim.putalpha(sh)
        self.im.alpha_composite(shim)
        gm = Image.new("L", (self.w, self.h), 0)
        ImageDraw.Draw(gm).ellipse(((cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S), fill=255)
        gm = gm.filter(ImageFilter.GaussianBlur(S * 4))
        g = fill("grass", self.w, self.h, 0.8); g.putalpha(ImageChops.multiply(g.getchannel("A"), gm))
        self.im.alpha_composite(g)
    def save(self, name, key, notes, final_w=None, keep=False):
        out = self.im if keep else self.im.crop(self.im.getbbox())
        f = (final_w or out.width / S * 2) / out.width  # export at 2x of the design size
        out = out.resize((max(1, int(out.width * f)), max(1, int(out.height * f))), Image.LANCZOS)
        out.save(os.path.join(OUT, f"{name}.png"), optimize=True)
        A[key] = {"file": f"assets/derived/props/{name}.png", "width": out.width, "height": out.height,
                  "source": "tools/paint_structures.py", "status": "painted-in-code", "notes": notes}
        return out

def hshade(w, h, x0, x1, lo=0.6, hi=1.12):
    """Cylinder-ish shading: key light from the top-left."""
    u = (np.arange(w, dtype=np.float32) - x0 * S) / max(1.0, (x1 - x0) * S) * 2 - 1
    f = hi - (hi - lo) * np.clip((u + 0.35) / 1.35, 0, 1.6) ** 2
    f = np.where(u < -0.35, hi - (hi - lo) * 0.35 * np.clip((-0.35 - u) / 0.65, 0, 1), f)
    f = np.clip(f, lo, hi)
    return np.tile(f[None, :], (h, 1))

def vgrad(w, h, y0, y1, a=1.08, b=0.82):
    v = np.clip((np.arange(h, dtype=np.float32) - y0 * S) / max(1.0, (y1 - y0) * S), 0, 1)
    return np.tile((a + (b - a) * v)[:, None], (1, w))

def mortar(w, h, rows, y0, y1, dark=0.78, thick=2):
    """Horizontal plank/band lines."""
    f = np.ones((h, w), np.float32)
    for i in range(rows + 1):
        y = int((y0 + (y1 - y0) * i / rows) * S)
        f[max(0, y - thick):y + thick, :] = dark
        f[max(0, y + thick):y + thick * 2, :] = np.minimum(f[max(0, y + thick):y + thick * 2, :], 1.0) * 1.08
    return f

def bushes(sc, items):
    for key, cx, by, w, flip in items:
        sc.sprite(key, cx, by, w, flip)



def overlay(sc, mask, rgb, alpha):
    """Tint a region: alpha is a 0..1 array over the canvas, clipped to mask."""
    a = np.clip(np.asarray(alpha, np.float32), 0, 1) * (np.asarray(mask, np.float32) / 255)
    layer = np.zeros((sc.h, sc.w, 4), np.uint8)
    layer[..., 0], layer[..., 1], layer[..., 2] = rgb
    layer[..., 3] = (a * 255).astype(np.uint8)
    sc.im.alpha_composite(Image.fromarray(layer))

def strokes(sc, mask, n, vertical=True, seed=1, light=(255, 178, 112), dark=(58, 20, 12), length=(10, 30), width=(1.6, 3.6)):
    """Short brush strokes over a surface so it reads as painted, not flat-filled."""
    r = np.random.default_rng(seed)
    m = np.asarray(mask)
    ys, xs = np.nonzero(m > 128)
    layer = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in r.choice(len(xs), size=min(n, len(xs)), replace=False):
        x, y = xs[i], ys[i]
        ln = r.uniform(*length) * S
        col = light if r.random() < 0.5 else dark
        al = int(r.uniform(14, 34))
        dx, dy = (r.uniform(-0.12, 0.12), 1) if vertical else (1, r.uniform(-0.12, 0.12))
        d.line([(x, y), (x + dx * ln, y + dy * ln)], fill=col + (al,), width=max(2, int(r.uniform(*width) * S)))
    la = np.asarray(layer).copy()
    la[..., 3] = np.minimum(la[..., 3], m)
    sc.im.alpha_composite(Image.fromarray(la))

def cast_shadow(sc, pts, alpha=100, blur=7):
    """Ground shadow projected away from the key light (top-left): falls right and down."""
    sh = Image.new("L", (sc.w, sc.h), 0)
    ImageDraw.Draw(sh).polygon([(x * S, y * S) for x, y in pts], fill=alpha)
    sh = sh.filter(ImageFilter.GaussianBlur(S * blur))
    shim = Image.new("RGBA", (sc.w, sc.h), (24, 32, 18, 255)); shim.putalpha(sh)
    sc.im.alpha_composite(shim)

# ---- detail helpers: everything is clipped to the structure's own silhouette
def clipped(sc, fn):
    layer = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    fn(ImageDraw.Draw(layer))
    la = np.asarray(layer).copy()
    la[..., 3] = np.minimum(la[..., 3], np.asarray(sc.im)[..., 3])
    sc.im.alpha_composite(Image.fromarray(la))

def free(sc, fn):
    """Draw anywhere (details that stand proud of the silhouette)."""
    layer = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    fn(ImageDraw.Draw(layer))
    sc.im.alpha_composite(layer)

def ivy(sc, x, y0, y1, seed=1, spread=9, dens=1.0, clip=False):
    r = np.random.default_rng(seed)
    def go(d):
        px, y = x, y1
        while y > y0:
            y -= r.uniform(4, 8) / dens
            px = x + math.sin(y / 23 + seed) * spread + r.uniform(-4, 4)
            for k in range(2):
                ang = r.uniform(0, math.tau)
                lx, ly = px + r.uniform(-8, 8), y + r.uniform(-5, 5)
                L, Wd = r.uniform(5.5, 9), r.uniform(3.5, 5.5)
                col = [(48, 104, 42), (78, 142, 56), (126, 188, 78)][int(r.integers(0, 3))]
                pts = [(lx + math.cos(ang) * L * S, ly * S + math.sin(ang) * L * S)]
                pts = [((lx + math.cos(ang) * L * c) * S, (ly + math.sin(ang) * L * c * 0.8) * S) if False else (0, 0) for c in (0,)]
                poly = []
                for t in range(0, 360, 45):
                    rr = math.radians(t)
                    ex, ey = math.cos(rr) * L, math.sin(rr) * Wd
                    poly.append(((lx + ex * math.cos(ang) - ey * math.sin(ang)) * S, (ly + ex * math.sin(ang) + ey * math.cos(ang)) * S))
                d.polygon(poly, fill=col + (255,), outline=(30, 70, 28, 255))
                d.line([poly[0], poly[4]], fill=(160, 214, 110, 200), width=max(1, S // 2))
            if r.random() < 0.06 * dens:
                fx, fy = px + r.uniform(-6, 6), y
                for t in range(5):
                    rr = math.tau * t / 5
                    d.ellipse([(fx + math.cos(rr) * 2.6 - 1.7) * S, (fy + math.sin(rr) * 2.6 - 1.7) * S, (fx + math.cos(rr) * 2.6 + 1.7) * S, (fy + math.sin(rr) * 2.6 + 1.7) * S], fill=(250, 244, 232, 255))
                d.ellipse([(fx - 1.6) * S, (fy - 1.6) * S, (fx + 1.6) * S, (fy + 1.6) * S], fill=(244, 200, 64, 255))
    (clipped if clip else free)(sc, go)

def moss(sc, x0, y0, x1, y1, n=60, seed=2):
    r = np.random.default_rng(seed)
    def go(d):
        for _ in range(n):
            cx, cy = r.uniform(x0, x1), y0 + (y1 - y0) * r.random() ** 0.7
            rad = r.uniform(1.8, 4.2)
            for col, dx in (((52, 100, 40), 0), ((92, 152, 58), -0.8), ((142, 196, 90), -1.5)):
                d.ellipse([(cx + dx - rad) * S, (cy + dx - rad * 0.7) * S, (cx + dx + rad) * S, (cy + dx + rad * 0.7) * S], fill=col + (235,))
    clipped(sc, go)

def grime(sc, x0, x1, y0, y1, n=40, seed=3, alpha=46):
    """Rain streaks running down a wall."""
    r = np.random.default_rng(seed)
    def go(d):
        for _ in range(n):
            x = r.uniform(x0, x1); ya = r.uniform(y0, y1 - 20); ln = r.uniform(12, 70)
            d.line([(x * S, ya * S), (x * S, min(y1, ya + ln) * S)], fill=(40, 28, 18, int(alpha * r.uniform(0.5, 1))), width=int(r.uniform(1, 3) * S))
    clipped(sc, go)

def nails(sc, pts, r=1.6):
    def go(d):
        for x, y in pts:
            d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=(46, 40, 38, 255))
            d.ellipse([(x - r * 0.7) * S, (y - r * 0.8) * S, (x - r * 0.1) * S, (y - r * 0.2) * S], fill=(176, 170, 160, 255))
    free(sc, go)

def lantern(sc, x, y, bracket=-1):
    def go(d):
        d.line([(x * S, (y - 14) * S), ((x + bracket * 14) * S, (y - 14) * S), ((x + bracket * 14) * S, (y + 8) * S)], fill=(46, 36, 30, 255), width=3 * S)
        d.rounded_rectangle([(x - 7) * S, (y - 12) * S, (x + 7) * S, (y + 10) * S], radius=3 * S, fill=(60, 44, 34, 255))
        d.rounded_rectangle([(x - 5) * S, (y - 9) * S, (x + 5) * S, (y + 7) * S], radius=2 * S, fill=(255, 214, 104, 255))
        d.rounded_rectangle([(x - 3) * S, (y - 7) * S, (x + 1) * S, (y + 2) * S], radius=S, fill=(255, 250, 200, 255))
        d.polygon([((x - 9) * S, (y - 12) * S), ((x + 9) * S, (y - 12) * S), (x * S, (y - 20) * S)], fill=(60, 44, 34, 255))
    free(sc, go)
    glow = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([(x - 18) * S, (y - 18) * S, (x + 18) * S, (y + 18) * S], fill=(255, 214, 120, 70))
    sc.im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S * 5)))

def sack(sc, x, y, w=34, seed=1):
    r = np.random.default_rng(seed)
    def go(d):
        h = w * 1.15
        body = [(x - w / 2, y), (x - w / 2 - 2, y - h * 0.55), (x - w * 0.3, y - h * 0.82), (x - w * 0.14, y - h * 0.9), (x + w * 0.14, y - h * 0.9), (x + w * 0.3, y - h * 0.82), (x + w / 2 + 2, y - h * 0.55), (x + w / 2, y)]
        d.polygon([(a * S, b * S) for a, b in body], fill=(214, 190, 138, 255), outline=(82, 58, 30, 255))
        d.polygon([((x + w * 0.1) * S, (y - 2) * S), ((x + w / 2) * S, y * S), ((x + w / 2 + 2) * S, (y - h * 0.55) * S), ((x + w * 0.18) * S, (y - h * 0.5) * S)], fill=(168, 142, 96, 140))
        d.line([((x - w * 0.16) * S, (y - h * 0.86) * S), ((x + w * 0.16) * S, (y - h * 0.86) * S)], fill=(120, 84, 44, 255), width=2 * S)
        d.ellipse([(x - w * 0.28) * S, (y - h * 0.5) * S, (x + w * 0.1) * S, (y - h * 0.2) * S], outline=(120, 88, 50, 140), width=S)
    free(sc, go)

def vane(sc, x, y, h=44, seed=1):
    def go(d):
        d.line([(x * S, y * S), (x * S, (y - h) * S)], fill=(46, 38, 34, 255), width=2 * S)
        d.polygon([((x - 18) * S, (y - h + 6) * S), ((x + 12) * S, (y - h + 6) * S), ((x + 12) * S, (y - h + 1) * S), ((x + 22) * S, (y - h + 8) * S), ((x + 12) * S, (y - h + 15) * S), ((x + 12) * S, (y - h + 10) * S), ((x - 18) * S, (y - h + 10) * S)], fill=(204, 156, 58, 255), outline=(70, 48, 22, 255))
        d.polygon([((x - 24) * S, (y - h + 2) * S), ((x - 14) * S, (y - h + 8) * S), ((x - 24) * S, (y - h + 14) * S)], fill=(204, 156, 58, 255), outline=(70, 48, 22, 255))
        d.ellipse([(x - 3) * S, (y - h * 0.55 - 3) * S, (x + 3) * S, (y - h * 0.55 + 3) * S], fill=(204, 156, 58, 255))
    free(sc, go)

def flower_box(sc, x, y, w=30):
    def go(d):
        d.rectangle([(x - w / 2) * S, y * S, (x + w / 2) * S, (y + 10) * S], fill=(120, 76, 38, 255), outline=(60, 36, 18, 255))
        d.line([((x - w / 2 + 2) * S, (y + 3) * S), ((x + w / 2 - 2) * S, (y + 3) * S)], fill=(168, 112, 60, 255), width=S)
        r = np.random.default_rng(int(x))
        for i in range(7):
            fx = x - w / 2 + 3 + i * (w - 6) / 6
            d.ellipse([(fx - 4) * S, (y - 6) * S, (fx + 4) * S, (y + 2) * S], fill=(70, 138, 54, 255))
            col = [(236, 76, 94), (252, 220, 80), (250, 248, 240), (176, 120, 220)][int(r.integers(0, 4))]
            d.ellipse([(fx - 2.4) * S, (y - 9) * S, (fx + 2.4) * S, (y - 4.2) * S], fill=col + (255,))
    free(sc, go)

# ------------------------------------------------------------------ silo
def silo():
    sc = Scene(300, 520)
    sc.skirt(150, 470, 130, 34)
    x0, x1, top, bot = 70, 230, 130, 450
    body = sc.mask(lambda d, P: (d.rectangle([*P([(x0, top)])[0], *P([(x1, bot)])[0]], fill=255), d.ellipse([*P([(x0, bot - 22)])[0], *P([(x1, bot + 22)])[0]], fill=255)))
    plank = mat("plank", sc.w, sc.h, 1.0)
    sh = hshade(sc.w, sc.h, x0, x1) * vgrad(sc.w, sc.h, top, bot, 1.02, 0.9)
    f = mortar(sc.w, sc.h, 8, top, bot, 0.72, 2)
    sc.part(body, plank, sh * f)
    # stone footing
    foot = sc.mask(lambda d, P: (d.rectangle([*P([(x0 - 4, bot - 42)])[0], *P([(x1 + 4, bot)])[0]], fill=255), d.ellipse([*P([(x0 - 4, bot - 20)])[0], *P([(x1 + 4, bot + 24)])[0]], fill=255)))
    sc.part(foot, mat("stone", sc.w, sc.h, 1.0), hshade(sc.w, sc.h, x0, x1, 0.55, 1.05))
    # iron hoops
    for y in (top + 70, top + 150, top + 230):
        hoop = sc.mask(lambda d, P, y=y: d.rectangle([*P([(x0 - 1, y)])[0], *P([(x1 + 1, y + 7)])[0]], fill=255))
        sc.solid(hoop, (74, 70, 72), hshade(sc.w, sc.h, x0, x1, 0.55, 1.25), edge=False)
    # dome roof
    dome = sc.mask(lambda d, P: (d.ellipse([*P([(x0 - 8, top - 60)])[0], *P([(x1 + 8, top + 44)])[0]], fill=255), d.rectangle([*P([(x0 - 8, top - 8)])[0], *P([(x1 + 8, top + 8)])[0]], fill=0)))
    dome = sc.mask(lambda d, P: (d.pieslice([*P([(x0 - 8, top - 70)])[0], *P([(x1 + 8, top + 60)])[0]], 180, 360, fill=255)))
    sc.part(dome, mat("bluslate", sc.w, sc.h, 1.0), hshade(sc.w, sc.h, x0 - 8, x1 + 8, 0.55, 1.2) * vgrad(sc.w, sc.h, top - 70, top, 1.12, 0.9))
    rim = sc.mask(lambda d, P: d.rectangle([*P([(x0 - 10, top - 4)])[0], *P([(x1 + 10, top + 8)])[0]], fill=255))
    sc.solid(rim, (112, 70, 36), hshade(sc.w, sc.h, x0 - 10, x1 + 10, 0.6, 1.15))
    cap = sc.mask(lambda d, P: (d.ellipse([*P([(140, top - 92)])[0], *P([(160, top - 72)])[0]], fill=255)))
    sc.solid(cap, (200, 190, 170), None)
    # door and ladder
    door = sc.mask(lambda d, P: (d.rounded_rectangle([*P([(124, bot - 100)])[0], *P([(176, bot - 4)])[0]], radius=18 * S, fill=255)))
    sc.part(door, mat("plank", sc.w, sc.h, 0.8), vgrad(sc.w, sc.h, bot - 100, bot, 0.9, 0.6) * 0.72)
    fr = sc.mask(lambda d, P: (d.rounded_rectangle([*P([(120, bot - 106)])[0], *P([(180, bot)])[0]], radius=20 * S, fill=255), d.rounded_rectangle([*P([(125, bot - 100)])[0], *P([(175, bot - 4)])[0]], radius=17 * S, fill=0)))
    sc.solid(fr, (214, 196, 160), None)
    extras_silo(sc)
    bushes(sc, [("foliage.bush_green", 52, 470, 90, False), ("foliage.bush_flowering", 252, 474, 92, True), ("foliage.grass_tall", 150, 486, 80, False)])
    return sc.save("silo", "prop.silo", "Red plank silo with stone footing, iron hoops and slate dome, cut from the barn, well and roof art.")


def silo_v2():
    """Test asset for the updated art direction: same silo, with form shading, cast
    shadows, ambient occlusion, painterly strokes and a darker hand-drawn outline."""
    global EDGE
    old_edge, EDGE = EDGE, (40, 22, 12, 255)
    sc = Scene(360, 520)
    ox = 30                                              # canvas margin for the long cast shadow
    x0, x1, top, bot = 70 + ox, 230 + ox, 130, 450
    sc.skirt(150 + ox, 470, 140, 34)
    cast_shadow(sc, [(x0 + 8, bot - 4), (x1 - 4, bot - 4), (x1 + 160, bot + 40), (x0 + 120, bot + 44)], 135, 7)   # trunk of the shadow
    cast_shadow(sc, [(x1 + 70, bot + 6), (x1 + 160, bot + 28), (x1 + 70, bot + 48)], 70, 9)                       # dome end of it
    body = sc.mask(lambda d, P: (d.rectangle([*P([(x0, top)])[0], *P([(x1, bot)])[0]], fill=255), d.ellipse([*P([(x0, bot - 22)])[0], *P([(x1, bot + 22)])[0]], fill=255)))
    sh = hshade(sc.w, sc.h, x0, x1, 0.5, 1.15) * vgrad(sc.w, sc.h, top, bot, 1.04, 0.88)
    sc.part(body, mat("plank", sc.w, sc.h, 1.0, joints=False), sh)
    yy, xx = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
    X0, X1, T, B = x0 * S, x1 * S, top * S, bot * S
    strokes(sc, body, 900, True, 3)
    # form: lit left edge, warm bounce on the right edge, dark core shadow before it
    overlay(sc, body, (255, 232, 176), 0.6 * np.clip(1 - (xx - X0) / (22 * S), 0, 1) ** 1.0)
    overlay(sc, body, (40, 18, 52), 0.86 * np.clip((xx - (X1 - 104 * S)) / (96 * S), 0, 1) ** 1.25)
    overlay(sc, body, (255, 150, 70), 0.38 * np.clip(1 - np.abs(xx - (X1 - 5 * S)) / (7 * S), 0, 1))
    # the dome's overhang shades the top of the wall; ambient occlusion where it meets the ground
    overlay(sc, body, (30, 14, 10), 0.8 * np.clip(1 - (yy - T) / (52 * S), 0, 1) ** 1.3)
    overlay(sc, body, (30, 14, 10), 0.5 * np.clip((yy - (B - 90 * S)) / (90 * S), 0, 1) ** 1.5)
    # stone footing
    foot = sc.mask(lambda d, P: (d.rectangle([*P([(x0 - 4, bot - 42)])[0], *P([(x1 + 4, bot)])[0]], fill=255), d.ellipse([*P([(x0 - 4, bot - 20)])[0], *P([(x1 + 4, bot + 24)])[0]], fill=255)))
    sc.part(foot, mat("stone", sc.w, sc.h, 1.0), hshade(sc.w, sc.h, x0, x1, 0.5, 1.1))
    overlay(sc, foot, (36, 18, 48), 0.45 * np.clip((xx - (X1 - 50 * S)) / (50 * S), 0, 1))
    overlay(sc, foot, (20, 24, 12), 0.35 * np.clip((yy - (B - 6 * S)) / (26 * S), 0, 1))
    # iron hoops with a shadow band under and a highlight above
    for y in (top + 70, top + 150, top + 230):
        sb = sc.mask(lambda d, P, y=y: d.rectangle([*P([(x0, y + 7)])[0], *P([(x1, y + 22)])[0]], fill=255))
        overlay(sc, sb & body if False else sb, (28, 12, 8), 0.55 * np.clip(1 - (yy - (y + 7) * S) / (15 * S), 0, 1) ** 1.3)
        hoop = sc.mask(lambda d, P, y=y: d.rectangle([*P([(x0 - 1, y)])[0], *P([(x1 + 1, y + 7)])[0]], fill=255))
        sc.solid(hoop, (66, 62, 66), hshade(sc.w, sc.h, x0, x1, 0.5, 1.35), edge=False)
        overlay(sc, hoop, (255, 240, 220), 0.35 * np.clip(1 - (yy - y * S) / (3 * S), 0, 1) * np.clip(1 - (xx - X0) / (90 * S), 0.2, 1))
    # slate dome: crest highlight, dark lower-right, soft specular
    dome = sc.mask(lambda d, P: d.pieslice([*P([(x0 - 8, top - 70)])[0], *P([(x1 + 8, top + 60)])[0]], 180, 360, fill=255))
    sc.part(dome, mat("bluslate", sc.w, sc.h, 1.0), hshade(sc.w, sc.h, x0 - 8, x1 + 8, 0.5, 1.2) * vgrad(sc.w, sc.h, top - 70, top, 1.12, 0.82))
    overlay(sc, dome, (20, 18, 60), 0.5 * np.clip((xx - (x0 + 70) * S) / (100 * S), 0, 1) ** 1.3)
    spec = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    ImageDraw.Draw(spec).ellipse([(x0 + 24) * S, (top - 50) * S, (x0 + 74) * S, (top - 30) * S], fill=(255, 255, 255, 120))
    spec = spec.filter(ImageFilter.GaussianBlur(S * 5)); sc.im.alpha_composite(spec)
    strokes(sc, dome, 220, False, 5, light=(210, 226, 255), dark=(14, 18, 58), length=(8, 20))
    rim = sc.mask(lambda d, P: d.rectangle([*P([(x0 - 10, top - 4)])[0], *P([(x1 + 10, top + 8)])[0]], fill=255))
    sc.solid(rim, (112, 70, 36), hshade(sc.w, sc.h, x0 - 10, x1 + 10, 0.55, 1.2))
    cap = sc.mask(lambda d, P: d.ellipse([*P([(140 + ox, top - 92)])[0], *P([(160 + ox, top - 72)])[0]], fill=255))
    sc.solid(cap, (206, 196, 176), None)
    # arched door: deep inner shadow, frame, and the frame's own shadow on the wall
    door = sc.mask(lambda d, P: d.rounded_rectangle([*P([(124 + ox, bot - 100)])[0], *P([(176 + ox, bot - 4)])[0]], radius=18 * S, fill=255))
    cast_shadow(sc, [(176 + ox, bot - 98), (186 + ox, bot - 90), (186 + ox, bot - 2), (176 + ox, bot - 2)], 90, 3)
    sc.part(door, mat("plank", sc.w, sc.h, 0.8), vgrad(sc.w, sc.h, bot - 100, bot, 0.9, 0.6) * 0.62)
    overlay(sc, door, (10, 6, 6), 0.7 * np.clip(1 - (yy - (bot - 100) * S) / (46 * S), 0, 1))
    fr = sc.mask(lambda d, P: (d.rounded_rectangle([*P([(120 + ox, bot - 106)])[0], *P([(180 + ox, bot)])[0]], radius=20 * S, fill=255), d.rounded_rectangle([*P([(125 + ox, bot - 100)])[0], *P([(175 + ox, bot - 4)])[0]], radius=17 * S, fill=0)))
    sc.solid(fr, (214, 196, 160), 0.95 - 0.35 * np.clip((xx - (150 + ox) * S) / (30 * S), 0, 1))
    # ladder with its own shadow thrown on the wall (right and down)
    def ladder(d, off=0, col=(104, 66, 34, 255), rung=(138, 90, 46, 255), edge=(52, 30, 14, 255)):
        for xr in (206 + ox + off, 222 + ox + off):
            d.rectangle([xr * S, (top + 34 + off) * S, (xr + 4) * S, (bot - 46 + off) * S], fill=col, outline=edge)
        for y in range(top + 44, bot - 52, 15):
            d.rectangle([(206 + ox + off) * S, (y + off) * S, (226 + ox + off) * S, (y + 4 + off) * S], fill=rung, outline=edge)
    clipped(sc, lambda d: ladder(d, 5, (20, 8, 6, 120), (20, 8, 6, 120), (20, 8, 6, 0)))
    free(sc, ladder)
    ivy(sc, x0 + 4, top + 50, bot - 6, 7, 8, 1.1)
    moss(sc, x0, bot - 44, x1, bot + 8, 70, 6)
    nails(sc, [(x0 + 10 + i * 14, y + 3.5) for y in (top + 70, top + 150, top + 230) for i in range(11)], 1.4)
    lantern(sc, 112 + ox, bot - 62, -1)
    vane(sc, 150 + ox, top - 80, 46)
    sc.sprite("terrain2.barrel", 100 + ox, bot + 20, 46)
    sc.sprite("terrain2.wooden_crate", 202 + ox, bot + 22, 48)
    sack(sc, 176 + ox, bot + 20, 28, 2)
    sc.sprite("foliage.bush_green", 52 + ox, 470, 90, False)
    sc.sprite("foliage.bush_flowering", 252 + ox, 474, 92, True)
    sc.sprite("foliage.grass_tall", 150 + ox, 486, 80, False)
    EDGE = old_edge
    return sc.save("silo_v2", "prop.silo_v2", "Test asset for the updated art direction: form shading, cast and contact shadows, ambient occlusion, painterly strokes.")


# ---- barrel-style rendering: bold dark outline, chunky boards with a lit left edge, steel hoops
OUT_DARK = (38, 20, 12)
def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * max(0.0, min(1.0, t))) for i in range(3))

def silo_v3():
    """The silo drawn like the game's own barrel and crate: near-overhead view, each plank an
    individually lit shape, steel hoops with rivets, roof seen from above, thick outline."""
    sc = Scene(460, 500)
    cx, R, ry = 220, 104, 66                           # wall radius and how much of the top/bottom curve shows
    ytop, ybot = 150, 384                              # centres of the wall's top and bottom ellipses
    sc.skirt(cx, 440, 196, 40)
    cast_shadow(sc, [(cx - 40, 446), (cx + 130, 430), (cx + 232, 454), (cx + 60, 474)], 125, 6)
    im = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    P = lambda x, y: (x * S, y * S)
    rng = np.random.default_rng(9)
    base_light, base_dark = (232, 84, 56), (122, 30, 24)
    N = 15
    th = [math.radians(-90 + 180 * i / N) for i in range(N + 1)]
    xs = [cx + R * math.sin(t) for t in th]
    yt = [ytop + ry * math.cos(t) for t in th]
    yb = [ybot + ry * math.cos(t) for t in th]
    # planks: each is its own lit shape
    for i in range(N):
        mid = (th[i] + th[i + 1]) / 2
        f = 0.5 + 0.55 * math.cos(mid + 0.75) - 0.12     # light from the top-left
        f += (rng.random() - 0.5) * 0.14
        col = lerp(base_dark, base_light, f)
        quad = [P(xs[i], yt[i]), P(xs[i + 1], yt[i + 1]), P(xs[i + 1], yb[i + 1]), P(xs[i], yb[i])]
        d.polygon(quad, fill=col)
        w = xs[i + 1] - xs[i]
        # lit left edge and top, shaded right edge and bottom, like the barrel's boards
        hl = [P(xs[i] + w * 0.04, yt[i] + 3), P(xs[i] + w * 0.30, yt[i + 1] + 3), P(xs[i] + w * 0.30, yb[i + 1] - 4), P(xs[i] + w * 0.04, yb[i] - 4)]
        d.polygon(hl, fill=lerp(col, (255, 170, 110), 0.40))
        sh = [P(xs[i] + w * 0.78, yt[i + 1]), P(xs[i + 1], yt[i + 1]), P(xs[i + 1], yb[i + 1]), P(xs[i] + w * 0.78, yb[i + 1])]
        d.polygon(sh, fill=lerp(col, (50, 14, 12), 0.45))
        for _ in range(3):                                  # grain
            gx = xs[i] + w * rng.uniform(0.35, 0.75)
            y0 = yt[i] + rng.uniform(10, 60); y1 = y0 + rng.uniform(26, 80)
            d.line([P(gx, y0), P(gx + rng.uniform(-1, 1), y1)], fill=lerp(col, (60, 16, 12), 0.45) + (255,), width=max(1, S // 2))
        d.line([P(xs[i], yt[i]), P(xs[i], yb[i])], fill=OUT_DARK + (255,), width=int(S * 2.2))
    d.line([P(xs[-1], yt[-1]), P(xs[-1], yb[-1])], fill=OUT_DARK + (255,), width=int(S * 2.2))
    # a shadow band under the roof, and darkening toward the ground
    shade = Image.new("L", (sc.w, sc.h), 0)
    ImageDraw.Draw(shade).ellipse([P(cx - R - 20, ytop - 70), P(cx + R + 26, ytop + ry + 78)], fill=170)
    shade = np.asarray(shade.filter(ImageFilter.GaussianBlur(S * 8)), np.float32) / 255
    wallA = np.asarray(im)[..., 3].astype(np.float32) / 255
    yy_, xx_ = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
    gl = np.zeros((sc.h, sc.w, 4), np.uint8); gl[..., 0], gl[..., 1], gl[..., 2] = 26, 8, 20
    gl[..., 3] = (np.clip(shade * 0.75 + np.clip((yy_ / S - (ybot + ry - 90)) / 90, 0, 1) * 0.35, 0, 0.85) * wallA * 255).astype(np.uint8)
    im.alpha_composite(Image.fromarray(gl))
    d = ImageDraw.Draw(im)
    # steel hoops with rivets (the barrel's blue-grey bands)
    def hoop(h, half=9):
        top, bot = [], []
        for k in range(61):
            t = math.radians(-90 + 180 * k / 60)
            x = cx + R * math.sin(t)
            y = ybot - h + ry * math.cos(t)
            top.append(P(x, y - half)); bot.append(P(x, y + half))
        d.polygon(top + bot[::-1], fill=(58, 98, 138))
        d.polygon(top + [P(cx + R * math.sin(math.radians(-90 + 180 * k / 60)), ybot - h + ry * math.cos(math.radians(-90 + 180 * k / 60)) - half + 5) for k in range(60, -1, -1)], fill=(116, 160, 202))
        d.line(top, fill=OUT_DARK + (255,), width=int(S * 2.2)); d.line(bot, fill=OUT_DARK + (255,), width=int(S * 2.2))
        for k in range(1, N):
            t = th[k]; x = cx + R * math.sin(t); y = ybot - h + ry * math.cos(t)
            d.ellipse([P(x - 3.2, y - 3.2), P(x + 3.2, y + 3.2)], fill=(206, 214, 222), outline=OUT_DARK)
            d.ellipse([P(x - 1.8, y - 2.4), P(x - 0.2, y - 0.8)], fill=(255, 255, 255))
    hoop(34); hoop(108); hoop(182)
    # stone footing along the base curve
    for k in range(27):
        t = math.radians(-88 + 176 * k / 26)
        x = cx + R * 1.02 * math.sin(t); y = ybot + ry * math.cos(t) - 2
        wd = 5 + 6 * math.cos(t)
        d.rounded_rectangle([P(x - wd, y - 10), P(x + wd, y + 9)], radius=6 * S, fill=lerp((120, 112, 100), (190, 180, 164), 0.5 + 0.4 * math.cos(t + 0.7) - 0.2 * (k % 2)), outline=OUT_DARK, width=int(S * 2))
        d.rounded_rectangle([P(x - wd + 3, y - 14), P(x + wd - 3, y - 7)], radius=3 * S, fill=(214, 206, 190))
    # arched door facing the viewer
    dx0, dx1, dy1 = cx - 34, cx + 34, yb[N // 2] - 2
    dy0 = dy1 - 104
    d.rounded_rectangle([P(dx0 - 6, dy0 - 6), P(dx1 + 6, dy1 + 2)], radius=26 * S, fill=(120, 74, 40), outline=OUT_DARK, width=int(S * 2.6))
    d.rounded_rectangle([P(dx0, dy0), P(dx1, dy1)], radius=22 * S, fill=(176, 104, 56), outline=OUT_DARK, width=int(S * 2))
    for k in range(1, 4):
        d.line([P(dx0 + k * 17, dy0 + 8), P(dx0 + k * 17, dy1)], fill=OUT_DARK + (255,), width=int(S * 1.6))
    d.rounded_rectangle([P(dx0 + 2, dy0 + 3), P(dx0 + 15, dy1 - 2)], radius=6 * S, fill=(232, 160, 96))
    for yy_ in (dy0 + 30, dy1 - 24):
        d.rectangle([P(dx0, yy_), P(dx1, yy_ + 9)], fill=(58, 98, 138), outline=OUT_DARK, width=int(S * 1.6))
        d.rectangle([P(dx0, yy_), P(dx1, yy_ + 3)], fill=(116, 160, 202))
        for rx_ in (dx0 + 8, dx1 - 8):
            d.ellipse([P(rx_ - 2.4, yy_ + 2), P(rx_ + 2.4, yy_ + 7)], fill=(206, 214, 222), outline=OUT_DARK)
    d.ellipse([P(dx1 - 14, dy0 + 62), P(dx1 - 7, dy0 + 69)], fill=(206, 214, 222), outline=OUT_DARK, width=int(S * 1.4))
    struct = im
    # roof from above: radial slate wedges with a rim, like the barrel's boarded lid
    rim_rx, rim_ry, rcx, rcy = R + 14, 92, cx, 156
    roof = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    rd = ImageDraw.Draw(roof)
    rd.ellipse([P(rcx - rim_rx - 7, rcy - rim_ry - 6), P(rcx + rim_rx + 7, rcy + rim_ry + 8)], fill=(178, 112, 56), outline=OUT_DARK, width=int(S * 3))
    rd.ellipse([P(rcx - rim_rx - 3, rcy - rim_ry - 3), P(rcx + rim_rx + 3, rcy + rim_ry + 4)], outline=(236, 176, 104), width=int(S * 1.6))
    apx, apy = rcx - 6, rcy - 8
    NW = 22
    for i in range(NW):
        a0, a1 = math.tau * i / NW, math.tau * (i + 1) / NW
        am = (a0 + a1) / 2
        lite = 0.5 + 0.5 * math.cos(am - math.radians(225))           # facing the top-left light
        col = lerp((44, 62, 128), (132, 168, 226), lite) if True else None
        col = lerp(col, (214, 232, 255), 0.10 * (i % 2))
        pts = [P(apx, apy), P(rcx + rim_rx * math.cos(a0), rcy + rim_ry * math.sin(a0)), P(rcx + rim_rx * math.cos((a0 + a1) / 2), rcy + rim_ry * math.sin((a0 + a1) / 2)), P(rcx + rim_rx * math.cos(a1), rcy + rim_ry * math.sin(a1))]
        rd.polygon(pts, fill=col)
        edge = lerp(col, (22, 30, 78), 0.6)
        rd.line([P(apx, apy), P(rcx + rim_rx * math.cos(a0), rcy + rim_ry * math.sin(a0))], fill=edge, width=int(S * 1.8))
        for rr in (0.38, 0.62, 0.82):                                  # slate courses
            px, py = apx + (rcx + rim_rx * math.cos(am) - apx) * rr, apy + (rcy + rim_ry * math.sin(am) - apy) * rr
            wdt = rim_rx * rr * math.tau / NW * 0.5
            rd.arc([P(px - wdt, py - wdt * 0.8), P(px + wdt, py + wdt * 0.8)], 0, 180, fill=edge, width=int(S * 1.3))
    rd.ellipse([P(rcx - rim_rx, rcy - rim_ry), P(rcx + rim_rx, rcy + rim_ry)], outline=OUT_DARK, width=int(S * 3))
    spec = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    ImageDraw.Draw(spec).ellipse([P(rcx - 70, rcy - 60), P(rcx - 8, rcy - 24)], fill=(255, 255, 255, 120))
    roof.alpha_composite(spec.filter(ImageFilter.GaussianBlur(S * 6)))
    rd = ImageDraw.Draw(roof)
    rd.ellipse([P(apx - 15, apy - 14), P(apx + 15, apy + 12)], fill=(222, 170, 66), outline=OUT_DARK, width=int(S * 2.4))
    rd.ellipse([P(apx - 9, apy - 9), P(apx - 1, apy - 2)], fill=(255, 238, 170))
    struct.alpha_composite(roof)
    sa = np.asarray(struct)[..., 3]
    sil = Image.fromarray(((sa > 40) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * S + 1))
    ol = Image.new("RGBA", (sc.w, sc.h), OUT_DARK + (255,)); ol.putalpha(sil)
    sc.im.alpha_composite(ol)
    sc.im.alpha_composite(struct)
    # a lantern, a barrel and a crate (the game's own) at the foot, grass fringe like theirs
    lantern(sc, cx - 62, 372, -1)
    sc.sprite("terrain2.barrel", cx - 130, 470, 64)
    sc.sprite("terrain2.wooden_crate", cx + 130, 472, 64)
    for gx, w_, fl in ((cx - 66, 70, False), (cx + 8, 84, True), (cx + 82, 70, False), (cx - 172, 60, True), (cx + 178, 60, False)):
        sc.sprite("foliage.grass_tall", gx, 478, w_, fl, shadow=False)
    return sc.save("silo_v3", "prop.silo_v3", "Silo in the barrel and crate style: near-overhead view, lit planks, steel hoops, slate roof seen from above, bold outline.")

# ------------------------------------------------------------------ clock tower
def clock_tower():
    sc = Scene(300, 640)
    sc.skirt(150, 592, 130, 34)
    x0, x1, top, bot = 85, 215, 190, 580
    body = sc.mask(lambda d, P: d.rectangle([*P([(x0, top)])[0], *P([(x1, bot)])[0]], fill=255))
    sc.part(body, mat("stone", sc.w, sc.h, 1.3), hshade(sc.w, sc.h, x0, x1, 0.7, 1.1) * vgrad(sc.w, sc.h, top, bot, 1.05, 0.88))
    for y in (top + 120, top + 300):     # timber belts
        belt = sc.mask(lambda d, P, y=y: d.rectangle([*P([(x0 - 6, y)])[0], *P([(x1 + 6, y + 14)])[0]], fill=255))
        sc.part(belt, mat("plank", sc.w, sc.h, 0.8), mortar(sc.w, sc.h, 1, y, y + 14, 0.8) * 0.82, edge=True)
    # clock face
    cx, cy, R = 150, top + 60, 48
    ring = sc.mask(lambda d, P: d.ellipse([*P([(cx - R - 8, cy - R - 8)])[0], *P([(cx + R + 8, cy + R + 8)])[0]], fill=255))
    sc.solid(ring, (134, 86, 44), None)
    face = sc.mask(lambda d, P: d.ellipse([*P([(cx - R, cy - R)])[0], *P([(cx + R, cy + R)])[0]], fill=255))
    yy, xx = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
    rr = np.hypot(xx - cx * S, yy - cy * S) / (R * S)
    sc.solid(face, (246, 236, 208), 1.02 - 0.22 * rr ** 2, edge=True)
    d = ImageDraw.Draw(sc.im)
    for i in range(12):
        a = i / 12 * 2 * math.pi
        r0, r1 = (0.76 if i % 3 else 0.68), 0.9
        d.line([(cx * S + math.sin(a) * R * S * r0, cy * S - math.cos(a) * R * S * r0), (cx * S + math.sin(a) * R * S * r1, cy * S - math.cos(a) * R * S * r1)], fill=(58, 36, 20, 255), width=int(S * (3 if i % 3 == 0 else 2)))
    for ang, ln, wd in ((-60, 0.55, 5), (50, 0.78, 4)):  # hands (about 10:10)
        a = math.radians(ang)
        d.line([(cx * S, cy * S), (cx * S + math.sin(a) * R * S * ln, cy * S - math.cos(a) * R * S * ln)], fill=(48, 30, 18, 255), width=int(S * wd))
    d.ellipse([(cx - 4) * S, (cy - 4) * S, (cx + 4) * S, (cy + 4) * S], fill=(176, 126, 52, 255))
    # belfry arch
    arch = sc.mask(lambda d_, P: (d_.rectangle([*P([(130, top + 175)])[0], *P([(170, top + 225)])[0]], fill=255), d_.pieslice([*P([(130, top + 155)])[0], *P([(170, top + 195)])[0]], 180, 360, fill=255)))
    sc.solid(arch, (38, 30, 28), vgrad(sc.w, sc.h, top + 155, top + 225, 1.1, 0.7))
    bell = sc.mask(lambda d_, P: d_.pieslice([*P([(140, top + 185)])[0], *P([(160, top + 215)])[0]], 180, 360, fill=255))
    sc.solid(bell, (196, 150, 58), None, edge=False)
    # arched door and steps
    door = sc.mask(lambda d_, P: (d_.rectangle([*P([(130, bot - 70)])[0], *P([(170, bot)])[0]], fill=255), d_.pieslice([*P([(130, bot - 90)])[0], *P([(170, bot - 50)])[0]], 180, 360, fill=255)))
    sc.part(door, mat("plank", sc.w, sc.h, 0.8), 0.66 * vgrad(sc.w, sc.h, bot - 90, bot, 1.0, 0.8))
    step = sc.mask(lambda d_, P: d_.rectangle([*P([(120, bot)])[0], *P([(180, bot + 14)])[0]], fill=255))
    sc.part(step, mat("stone", sc.w, sc.h, 1.2), 0.95)
    # pyramid roof
    roof = sc.mask(lambda d_, P: d_.polygon(P([(x0 - 22, top), (x1 + 22, top), (150, top - 150)]), fill=255))
    clay = mat("clay", sc.w, sc.h, 1.0)
    sc.part(roof, clay, hshade(sc.w, sc.h, x0 - 22, x1 + 22, 0.6, 1.1) * vgrad(sc.w, sc.h, top - 150, top, 1.12, 0.86))
    eave = sc.mask(lambda d_, P: d_.rectangle([*P([(x0 - 26, top - 2)])[0], *P([(x1 + 26, top + 10)])[0]], fill=255))
    sc.solid(eave, (108, 66, 34), None)
    fin = sc.mask(lambda d_, P: (d_.rectangle([*P([(147, top - 176)])[0], *P([(153, top - 148)])[0]], fill=255), d_.ellipse([*P([(141, top - 166)])[0], *P([(159, top - 148)])[0]], fill=255)))
    sc.solid(fin, (196, 150, 58), None)
    extras_clock(sc)
    bushes(sc, [("foliage.bush_flowering", 70, 596, 100, False), ("foliage.bush_white_flowers", 238, 600, 100, True)])
    return sc.save("clock_tower", "prop.clock_tower", "Stone clock tower with timber belts, painted clock face and clay-tile pyramid roof, cut from the well, barn and cottage art.")

# ------------------------------------------------------------------ windmill
def windmill_frame(angle_deg, static_name=None):
    sc = Scene(520, 560)
    sc.skirt(260, 500, 150, 36)
    cx = 260
    bt, bb = 480, 190            # tower bottom y, top y
    bw, tw = 200, 130            # bottom width, top width
    tower_pts = [(cx - bw / 2, bt), (cx + bw / 2, bt), (cx + tw / 2, bb), (cx - tw / 2, bb)]
    tower = sc.mask(lambda d, P: d.polygon(P(tower_pts), fill=255))
    yy, xx = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
    u = (xx - cx * S) / (bw / 2 * S)
    shade = np.clip(1.1 - 0.4 * np.clip((u + 0.3) / 1.3, 0, 1.4) ** 2 - np.where(u < -0.3, 0.1 * (-0.3 - u), 0), 0.58, 1.12) * vgrad(sc.w, sc.h, bb, bt, 1.08, 0.88)
    sc.part(tower, mat("stone", sc.w, sc.h, 1.4), shade)
    plaster_h = (bt - bb) * 0.55
    plaster = sc.mask(lambda d, P: d.polygon(P([(cx - (bw / 2 - (bw - tw) / 2 * ((bt - bb - plaster_h) / (bt - bb))), bb + plaster_h), (cx + (bw / 2 - (bw - tw) / 2 * ((bt - bb - plaster_h) / (bt - bb))), bb + plaster_h), (cx + tw / 2, bb), (cx - tw / 2, bb)]), fill=255))
    nz = noise(sc.w, sc.h, 40, 3)
    pl = np.zeros((sc.h, sc.w, 4), np.uint8)
    pl[..., 0] = np.clip(232 + nz * 14, 0, 255); pl[..., 1] = np.clip(220 + nz * 14, 0, 255); pl[..., 2] = np.clip(190 + nz * 16, 0, 255); pl[..., 3] = 255
    sc.part(plaster, Image.fromarray(pl), shade)
    # timber band between stone and plaster
    band_y = bb + plaster_h
    band = sc.mask(lambda d, P: d.polygon(P([(cx - 92, band_y - 2), (cx + 92, band_y - 2), (cx + 91, band_y + 10), (cx - 91, band_y + 10)]), fill=255))
    sc.part(band, mat("plank", sc.w, sc.h, 0.8), 0.75)
    # door and window
    door = sc.mask(lambda d, P: (d.rectangle([*P([(cx - 24, bt - 76)])[0], *P([(cx + 24, bt)])[0]], fill=255), d.pieslice([*P([(cx - 24, bt - 100)])[0], *P([(cx + 24, bt - 52)])[0]], 180, 360, fill=255)))
    sc.part(door, mat("plank", sc.w, sc.h, 0.8), 0.7 * vgrad(sc.w, sc.h, bt - 100, bt, 1.0, 0.82))
    win = sc.mask(lambda d, P: d.rectangle([*P([(cx - 14, bb + 40)])[0], *P([(cx + 14, bb + 78)])[0]], fill=255))
    sc.solid(win, (88, 150, 176), vgrad(sc.w, sc.h, bb + 40, bb + 78, 1.15, 0.8))
    dd = ImageDraw.Draw(sc.im)
    dd.line([cx * S, (bb + 40) * S, cx * S, (bb + 78) * S], fill=EDGE, width=S * 2)
    dd.line([(cx - 14) * S, (bb + 59) * S, (cx + 14) * S, (bb + 59) * S], fill=EDGE, width=S * 2)
    # cap (clay-tile dome with a point)
    cap = sc.mask(lambda d, P: d.polygon(P([(cx - tw / 2 - 12, bb + 4), (cx + tw / 2 + 12, bb + 4), (cx + 40, bb - 70), (cx, bb - 108), (cx - 40, bb - 70)]), fill=255))
    sc.part(cap, mat("clay", sc.w, sc.h, 1.0), hshade(sc.w, sc.h, cx - 80, cx + 80, 0.6, 1.1) * vgrad(sc.w, sc.h, bb - 108, bb + 4, 1.12, 0.84))
    ledge = sc.mask(lambda d, P: d.rectangle([*P([(cx - tw / 2 - 14, bb + 2)])[0], *P([(cx + tw / 2 + 14, bb + 12)])[0]], fill=255))
    sc.solid(ledge, (108, 66, 34), None)
    extras_windmill_body(sc)
    # sails: four lattice blades on the front of the cap
    hx, hy = cx, bb - 36
    a0 = math.radians(angle_deg)
    for k in range(4):
        a = a0 + k * math.pi / 2
        ux, uy = math.sin(a), -math.cos(a)           # along the blade
        px, py = -uy, ux                              # across the blade
        arm = [(hx + px * 4, hy + py * 4), (hx + ux * 215 + px * 4, hy + uy * 215 + py * 4), (hx + ux * 215 - px * 4, hy + uy * 215 - py * 4), (hx - px * 4, hy - py * 4)]
        sc.solid(sc.mask(lambda d, P, arm=arm: d.polygon(P(arm), fill=255)), (116, 72, 36), None)
        # lattice frame off the leading edge
        o0, o1, w_ = 40, 205, 38
        fr = [(hx + ux * o0 + px * 6, hy + uy * o0 + py * 6), (hx + ux * o1 + px * 6, hy + uy * o1 + py * 6), (hx + ux * o1 + px * (6 + w_), hy + uy * o1 + py * (6 + w_)), (hx + ux * o0 + px * (6 + w_), hy + uy * o0 + py * (6 + w_))]
        cloth = sc.mask(lambda d, P, fr=fr: d.polygon(P(fr), fill=255))
        cl = np.zeros((sc.h, sc.w, 4), np.uint8); cl[..., 0] = 236; cl[..., 1] = 224; cl[..., 2] = 196; cl[..., 3] = 255
        sc.part(cloth, Image.fromarray(cl), 0.95)
        dr = ImageDraw.Draw(sc.im)
        for t in np.linspace(o0, o1, 9):                 # slats
            dr.line([((hx + ux * t + px * 6) * S, (hy + uy * t + py * 6) * S), ((hx + ux * t + px * (6 + w_)) * S, (hy + uy * t + py * (6 + w_)) * S)], fill=(112, 70, 36, 255), width=S * 2)
        for s_ in (6, 6 + w_):
            dr.line([((hx + ux * o0 + px * s_) * S, (hy + uy * o0 + py * s_) * S), ((hx + ux * o1 + px * s_) * S, (hy + uy * o1 + py * s_) * S)], fill=(98, 60, 30, 255), width=S * 3)
    hub = sc.mask(lambda d, P: d.ellipse([*P([(hx - 14, hy - 14)])[0], *P([(hx + 14, hy + 14)])[0]], fill=255))
    sc.solid(hub, (96, 64, 36), None)
    sc.im.alpha_composite(Image.new("RGBA", sc.im.size, (0, 0, 0, 0)))
    bushes(sc, [("foliage.bush_green", 128, 506, 110, False), ("foliage.bush_white_flowers", 404, 508, 110, True), ("foliage.grass_tall", 268, 514, 90, False)])
    return sc

def windmill():
    frames = []
    for i, ang in enumerate((8, 30, 52, 74)):     # a quarter turn covers the four-blade symmetry
        sc = windmill_frame(ang)
        frames.append(sc)
    # the frames must share one canvas size, so trim by the first and reuse its box
    boxes = [f.im.getbbox() for f in frames]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    outs = []
    for i, sc in enumerate(frames):
        sc.im = sc.im.crop(box)
        o = sc.save(f"windmill_f{i}", f"prop.windmill_f{i}", "Windmill with turning sails (frame %d of 4). Stone and plaster tower, clay-tile cap, canvas sails; cut from the well, cottage and barn art." % (i + 1), keep=True)
        outs.append(o)
    A["prop.windmill"] = dict(A["prop.windmill_f0"])
    return outs[0]

# ------------------------------------------------------------------ greenhouse
def greenhouse(planted):
    sc = Scene(520, 400)
    sc.skirt(260, 350, 225, 30)
    x0, x1, wall_top, bot = 70, 450, 170, 340
    # back wall interior (soil bed visible through the glass)
    inner = sc.mask(lambda d, P: d.rectangle([*P([(x0, wall_top)])[0], *P([(x1, bot)])[0]], fill=255))
    nzb = noise(sc.w, sc.h, 14, 5)
    bg = np.zeros((sc.h, sc.w, 4), np.uint8)
    bg[..., 0] = 74 + nzb * 40; bg[..., 1] = 110 + nzb * 50; bg[..., 2] = 92 + nzb * 40; bg[..., 3] = 255
    sc.part(inner, Image.fromarray(bg), vgrad(sc.w, sc.h, wall_top, bot, 1.0, 0.7), edge=False)
    # planting beds + crops inside
    bed = sc.mask(lambda d, P: d.rectangle([*P([(x0 + 14, bot - 66)])[0], *P([(x1 - 14, bot - 24)])[0]], fill=255))
    sc.part(bed, fill("soil", sc.w, sc.h, 0.9), 0.85, edge=True)
    if planted:
        for i in range(8):
            cx = x0 + 48 + i * 46
            sc.sprite("foliage.bush_green" if i % 2 == 0 else "foliage.fern", cx, bot - 28, 64)
        dr = ImageDraw.Draw(sc.im)
        rng = np.random.default_rng(8)
        for i in range(8):
            if i % 2: continue
            cx = x0 + 48 + i * 46
            for _ in range(4):
                px, py = cx + rng.integers(-18, 18), bot - 56 + rng.integers(-10, 14)
                dr.ellipse([(px - 5) * S, (py - 5) * S, (px + 5) * S, (py + 5) * S], fill=(210, 48, 36, 255), outline=(110, 24, 18, 255), width=S)
                dr.ellipse([(px - 3) * S, (py - 3) * S, (px - 1) * S, (py - 1) * S], fill=(255, 200, 190, 255))
    extras_greenhouse_inside(sc, planted)
    # roof glass panels (gable seen from the front: the eave line then the ridge)
    roof_top, ridge = 78, 52
    # glass: translucent pale panes with diagonal highlights
    def glass(m, alpha=70):
        gl = np.zeros((sc.h, sc.w, 4), np.float32)
        yy, xx = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
        base = np.array([196, 232, 236], np.float32)
        gl[..., :3] = base
        diag = ((xx + yy * 0.8) / (S * 22)) % 1.0
        gl[..., 3] = alpha + 40 * (diag < 0.12) + 14 * np.sin(xx / (S * 30))
        part = Image.fromarray(np.clip(gl, 0, 255).astype(np.uint8))
        part.putalpha(ImageChops.multiply(part.getchannel("A"), m.filter(ImageFilter.GaussianBlur(S * 0.3))))
        sc.im.alpha_composite(part)
    # low stone plinth
    plinth = sc.mask(lambda d, P: d.rectangle([*P([(x0 - 8, bot - 24)])[0], *P([(x1 + 8, bot + 10)])[0]], fill=255))
    glass_front = sc.mask(lambda d, P: d.rectangle([*P([(x0, wall_top)])[0], *P([(x1, bot - 24)])[0]], fill=255))
    glass(glass_front, 66)
    # roof: two sloped planes drawn as a front gable with glass
    gable = sc.mask(lambda d, P: d.polygon(P([(x0 - 14, wall_top), (x1 + 14, wall_top), (x1 - 40, roof_top), (x0 + 40, roof_top)]), fill=255))
    glass(gable, 96)
    ridge_m = sc.mask(lambda d, P: d.polygon(P([(x0 + 30, roof_top), (x1 - 30, roof_top), (x1 - 50, ridge), (x0 + 50, ridge)]), fill=255))
    glass(ridge_m, 110)
    wood = mat("plank", sc.w, sc.h, 0.8)
    def beam(x_a, y_a, x_b, y_b, w=7, shade=0.78):
        dx, dy = x_b - x_a, y_b - y_a
        L = math.hypot(dx, dy) or 1
        px, py = -dy / L * w / 2, dx / L * w / 2
        sc.part(sc.mask(lambda d, P: d.polygon(P([(x_a + px, y_a + py), (x_b + px, y_b + py), (x_b - px, y_b - py), (x_a - px, y_a - py)]), fill=255)), wood, shade, edge=True)
    for x in np.linspace(x0, x1, 9):                       # uprights
        beam(x, wall_top, x, bot - 24, 7)
    for x in np.linspace(x0 + 40, x1 - 40, 9):             # roof ribs
        t = (x - (x0 + 40)) / (x1 - x0 - 80)
        beam(x, roof_top, x0 - 14 + t * (x1 - x0 + 28), wall_top, 5, 0.8)
    beam(x0 - 14, wall_top, x1 + 14, wall_top, 9, 0.7)    # eave
    beam(x0 + 40, roof_top, x1 - 40, roof_top, 7, 0.82)
    beam(x0 + 50, ridge, x1 - 50, ridge, 7, 0.86)
    beam(x0, (wall_top + bot - 24) / 2 + 0, x1, (wall_top + bot - 24) / 2 + 0, 5, 0.8)
    sc.part(plinth, mat("stone", sc.w, sc.h, 1.1), vgrad(sc.w, sc.h, bot - 24, bot + 10, 1.05, 0.85))
    # door
    door = sc.mask(lambda d, P: d.rectangle([*P([(238, bot - 96)])[0], *P([(282, bot - 24)])[0]], fill=255))
    glass(door, 40)
    beam(238, bot - 96, 238, bot - 24, 6); beam(282, bot - 96, 282, bot - 24, 6); beam(238, bot - 96, 282, bot - 96, 6)
    extras_greenhouse(sc, planted)
    bushes(sc, [("foliage.bush_flowering", 62, 356, 110, False), ("foliage.flower_patch", 380, 366, 100, False)])
    name = "greenhouse_planted" if planted else "greenhouse"
    return sc.save(name, "prop." + name, "Glass greenhouse on a stone plinth with a timber frame (%s). Wood and stone from the game's art, glass and crops painted in code." % ("planted" if planted else "empty"))


# ------------------------------------------------------------------ per-structure detail
def extras_silo(sc):
    x0, x1, top, bot = 70, 230, 130, 450
    grime(sc, x0 + 6, x1 - 6, top + 8, bot - 40, 46, 5)
    moss(sc, x0, bot - 44, x1, bot + 8, 70, 6)
    nails(sc, [(x0 + 10 + i * 14, y + 3.5) for y in (top + 70, top + 150, top + 230) for i in range(11)], 1.4)
    def ladder(d):
        for xr in (206, 222):
            d.rectangle([xr * S, (top + 34) * S, (xr + 4) * S, (bot - 46) * S], fill=(104, 66, 34, 255), outline=(52, 30, 14, 255))
        for y in range(top + 44, bot - 52, 15):
            d.rectangle([206 * S, y * S, 226 * S, (y + 4) * S], fill=(138, 90, 46, 255), outline=(52, 30, 14, 255))
    free(sc, ladder)
    ivy(sc, x0 + 4, top + 50, bot - 6, 7, 8, 1.1)
    lantern(sc, 112, bot - 62, -1)
    vane(sc, 150, top - 80, 46)
    sc.sprite("terrain2.barrel", 100, bot + 20, 46)
    sc.sprite("terrain2.wooden_crate", 202, bot + 22, 48)
    sack(sc, 176, bot + 20, 28, 2)

def extras_clock(sc):
    x0, x1, top, bot = 85, 215, 190, 580
    # corner quoins: lighter dressed stones up both edges
    def quoins(d):
        y = top + 4; i = 0
        while y < bot - 6:
            h = 26 if i % 2 == 0 else 22
            for side in (0, 1):
                w = 19 if (i + side) % 2 == 0 else 14
                xa = x0 if side == 0 else x1 - w
                d.rounded_rectangle([xa * S, y * S, (xa + w) * S, (y + h - 2) * S], radius=2 * S, fill=(212, 202, 182, 255), outline=(98, 84, 66, 255), width=S)
                d.rectangle([(xa + 1) * S, (y + 1) * S, (xa + w - 1) * S, (y + 5) * S], fill=(236, 228, 208, 255))
            y += h; i += 1
    clipped(sc, quoins)
    grime(sc, x0 + 18, x1 - 18, top + 10, bot - 20, 50, 8, 40)
    moss(sc, x0, bot - 50, x1, bot + 4, 70, 9)
    # dentil course under the roof
    def dentils(d):
        for i in range(8):
            d.rectangle([(x0 - 14 + i * 20.5) * S, (top + 1) * S, (x0 - 14 + i * 20.5 + 11) * S, (top + 11) * S], fill=(214, 202, 178, 255), outline=(96, 80, 60, 255))
    free(sc, dentils)
    def arrow_slits(d):
        for sx in (110, 190):
            d.rectangle([(sx - 7) * S, (top + 318) * S, (sx + 7) * S, (top + 372) * S], fill=(36, 28, 26, 255))
            d.pieslice([(sx - 7) * S, (top + 311) * S, (sx + 7) * S, (top + 325) * S], 180, 360, fill=(36, 28, 26, 255))
            d.rectangle([(sx - 12) * S, (top + 372) * S, (sx + 12) * S, (top + 380) * S], fill=(214, 202, 178, 255), outline=(96, 80, 60, 255))
    free(sc, arrow_slits)
    flower_box(sc, 110, top + 380, 28)
    flower_box(sc, 190, top + 380, 28)
    # clock: gold ring and numerals at the quarters
    def gold(d):
        cx, cy, R = 150, top + 60, 48
        d.ellipse([(cx - R - 3) * S, (cy - R - 3) * S, (cx + R + 3) * S, (cy + R + 3) * S], outline=(222, 176, 70, 255), width=3 * S)
        d.ellipse([(cx - R + 7) * S, (cy - R + 7) * S, (cx + R - 7) * S, (cy + R - 7) * S], outline=(130, 96, 50, 200), width=S)
        for i in (0, 3, 6, 9):
            a = i / 12 * math.tau; px, py = cx + math.sin(a) * R * 0.58, cy - math.cos(a) * R * 0.58
            d.ellipse([(px - 3.4) * S, (py - 3.4) * S, (px + 3.4) * S, (py + 3.4) * S], fill=(170, 40, 36, 255))
        for i in range(12):
            a = i / 12 * math.tau
            d.ellipse([(cx + math.sin(a) * R * 1.12 - 2) * S, (cy - math.cos(a) * R * 1.12 - 2) * S, (cx + math.sin(a) * R * 1.12 + 2) * S, (cy - math.cos(a) * R * 1.12 + 2) * S], fill=(222, 176, 70, 255))
    free(sc, gold)
    lantern(sc, 114, bot - 56, -1)
    lantern(sc, 186, bot - 56, 1)
    ivy(sc, x1 - 4, top + 240, bot - 6, 12, 7, 1.0)
    ivy(sc, x0 + 3, top + 420, bot - 6, 14, 5, 0.8)
    vane(sc, 150, top - 150, 50)

def extras_windmill_body(sc):
    cx = 260; bt, bb = 480, 190
    grime(sc, cx - 80, cx + 80, bb + 20, bt - 40, 50, 3, 36)
    moss(sc, cx - 100, bt - 70, cx + 100, bt + 4, 80, 4)
    def details(d):
        wy = bb + 40
        for side in (-1, 1):                                    # shutters
            x = cx + side * 22 - (0 if side > 0 else 11)
            d.rectangle([(x) * S, wy * S, (x + 11) * S, (wy + 38) * S], fill=(78, 124, 98, 255), outline=(36, 54, 44, 255))
            for k in range(1, 6):
                d.line([((x + 1) * S, (wy + k * 6.2) * S), ((x + 10) * S, (wy + k * 6.2 - 1.5) * S)], fill=(40, 68, 54, 255), width=S)
        d.rectangle([(cx - 18) * S, (bb + 78) * S, (cx + 18) * S, (bb + 85) * S], fill=(214, 202, 178, 255), outline=(96, 80, 60, 255))
        for i, w in enumerate((70, 58)):                           # steps
            d.rectangle([(cx - w / 2) * S, (bt + i * 7) * S, (cx + w / 2) * S, (bt + 7 + i * 7) * S], fill=(188, 178, 158, 255), outline=(86, 72, 56, 255))
        for hy in (bt - 66, bt - 34):                              # strap hinges and ring
            d.rectangle([(cx - 24) * S, hy * S, (cx - 4) * S, (hy + 4) * S], fill=(50, 46, 46, 255))
        d.ellipse([(cx + 8) * S, (bt - 44) * S, (cx + 16) * S, (bt - 36) * S], outline=(54, 50, 50, 255), width=2 * S)
    free(sc, details)
    # gallery: planked ring with a rail
    def gallery(d):
        gy = bb + (bt - bb) * 0.55 + 2
        d.rectangle([(cx - 112) * S, gy * S, (cx + 112) * S, (gy + 9) * S], fill=(138, 90, 46, 255), outline=(56, 32, 14, 255))
        for i in range(0, 224, 16):
            d.line([((cx - 112 + i) * S, gy * S), ((cx - 112 + i) * S, (gy + 9) * S)], fill=(76, 46, 22, 255), width=S)
        for i in range(0, 225, 28):
            d.rectangle([(cx - 112 + i - 2) * S, (gy - 22) * S, (cx - 112 + i + 2) * S, gy * S], fill=(104, 66, 34, 255))
        d.rectangle([(cx - 112) * S, (gy - 24) * S, (cx + 112) * S, (gy - 19) * S], fill=(120, 76, 38, 255), outline=(56, 32, 14, 255))
    free(sc, gallery)
    ivy(sc, cx - 92, bt - 120, bt - 4, 21, 6, 1.0)
    lantern(sc, cx + 52, bt - 62, 1)
    sc.sprite("terrain2.barrel", cx + 104, bt + 18, 52)
    sack(sc, cx - 104, bt + 20, 34, 3)
    sack(sc, cx - 84, bt + 22, 30, 4)

def extras_greenhouse_inside(sc, planted):
    x0, x1, wall_top, bot = 70, 450, 170, 340
    def shelves(d):
        r = np.random.default_rng(6)
        for sy in (bot - 118,):
            d.rectangle([(x0 + 12) * S, sy * S, (x1 - 12) * S, (sy + 6) * S], fill=(124, 80, 40, 255), outline=(60, 36, 18, 255))
            for i in range(10):
                px = x0 + 34 + i * 36
                d.polygon([((px - 10) * S, (sy - 16) * S), ((px + 10) * S, (sy - 16) * S), ((px + 7) * S, sy * S), ((px - 7) * S, sy * S)], fill=(196, 100, 60, 255), outline=(92, 40, 20, 255))
                d.rectangle([(px - 11) * S, (sy - 18) * S, (px + 11) * S, (sy - 13) * S], fill=(214, 116, 70, 255), outline=(92, 40, 20, 255))
                if planted or i % 2:
                    for k in range(3):
                        d.ellipse([(px - 9 + k * 6) * S, (sy - 30 - r.integers(0, 6)) * S, (px - 1 + k * 6) * S, (sy - 17) * S], fill=(70, 150, 60, 255), outline=(32, 82, 32, 255))
                    if planted and i % 3 == 0:
                        d.ellipse([(px - 3) * S, (sy - 34) * S, (px + 3) * S, (sy - 28) * S], fill=(240, 90, 110, 255))
    free(sc, shelves)

def extras_greenhouse(sc, planted):
    x0, x1, wall_top, bot = 70, 450, 170, 340
    # rain gutter and downspout
    def gutter(d):
        d.rectangle([(x0 - 18) * S, (wall_top + 4) * S, (x1 + 18) * S, (wall_top + 12) * S], fill=(96, 98, 104, 255), outline=(40, 42, 48, 255))
        d.line([((x0 - 18) * S, (wall_top + 6) * S), ((x1 + 18) * S, (wall_top + 6) * S)], fill=(170, 174, 182, 255), width=S)
        d.rectangle([(x1 + 12) * S, (wall_top + 10) * S, (x1 + 20) * S, (bot - 4) * S], fill=(96, 98, 104, 255), outline=(40, 42, 48, 255))
    free(sc, gutter)
    # open roof vents
    def vents(d):
        for vx in (150, 330):
            d.polygon([((vx) * S, 70 * S), ((vx + 44) * S, 70 * S), ((vx + 52) * S, 50 * S), ((vx + 8) * S, 50 * S)], fill=(206, 238, 240, 190), outline=(110, 62, 30, 255))
            d.line([(vx * S, 70 * S), ((vx + 44) * S, 70 * S)], fill=(80, 50, 26, 255), width=3 * S)
    free(sc, vents)
    # hanging baskets
    def baskets(d):
        for bx in (170, 260, 350):
            d.line([(bx * S, (wall_top + 12) * S), (bx * S, (wall_top + 34) * S)], fill=(80, 56, 30, 255), width=S)
            d.pieslice([(bx - 14) * S, (wall_top + 26) * S, (bx + 14) * S, (wall_top + 50) * S], 0, 180, fill=(138, 92, 48, 255), outline=(60, 36, 18, 255))
            for k in range(6):
                lx = bx - 12 + k * 5
                d.ellipse([(lx - 4) * S, (wall_top + 22) * S, (lx + 4) * S, (wall_top + 32) * S], fill=(74, 150, 60, 255), outline=(30, 80, 30, 255))
                if k % 2 == 0:
                    d.ellipse([(lx - 2) * S, (wall_top + 20) * S, (lx + 2) * S, (wall_top + 25) * S], fill=[(236, 76, 94, 255), (252, 220, 80, 255), (250, 246, 240, 255)][k // 2 % 3])
            for k in range(3):
                d.line([((bx - 6 + k * 6) * S, (wall_top + 48) * S), ((bx - 8 + k * 7) * S, (wall_top + 66 + k * 5) * S)], fill=(70, 140, 56, 255), width=2 * S)
    free(sc, baskets)
    # glass shine and dirt
    def shine(d):
        for k in range(7):
            bx = x0 + 20 + k * 54
            d.polygon([(bx * S, wall_top * S), ((bx + 20) * S, wall_top * S), ((bx + 4) * S, (bot - 26) * S), ((bx - 16) * S, (bot - 26) * S)], fill=(255, 255, 255, 34))
    clipped(sc, shine)
    moss(sc, x0 - 8, bot - 24, x1 + 8, bot + 10, 70, 15)
    ivy(sc, x0 + 6, wall_top - 8, bot - 28, 31, 7, 1.1)
    ivy(sc, x1 - 6, wall_top + 10, bot - 28, 32, 7, 0.9)
    sc.sprite("terrain2.wooden_crate", 112, bot + 18, 44)
    sc.sprite("prop.flower_crate", 154, bot + 20, 54)
    sc.sprite("building.water_barrel", x1 + 34, bot + 14, 54)

# ------------------------------------------------------------------ fruit trees
FRUITS = {
    "apple": ((206, 46, 38), (118, 22, 20), 17, "foliage.tree_oak"),
    "pear": ((196, 206, 70), (112, 124, 32), 15, "foliage.tree_oak"),
    "orange": ((240, 150, 38), (146, 80, 14), 17, "foliage.tree_oak"),
    "cherry": ((182, 22, 52), (96, 8, 26), 11, "foliage.tree_oak"),
}

def fruit_tree(name):
    col, dark, r0, base = FRUITS[name]
    orig = img(base)
    t = orig.copy()
    a = np.asarray(t).astype(np.float32)
    green = (a[..., 3] > 250) & (a[..., 1] > a[..., 0] * 1.08) & (a[..., 1] > a[..., 2] * 1.2)
    ys, xs = np.nonzero(green)
    rng = np.random.default_rng(len(name) * 17)
    d = ImageDraw.Draw(t)
    n = 56
    chosen = rng.choice(len(xs), size=min(len(xs), n * 6), replace=False)
    placed = []
    s_ = t.width / 534
    r = max(4, int(r0 * s_ * 0.9))
    gmask = Image.fromarray((green * 255).astype(np.uint8))
    for i in chosen:
        x, y = int(xs[i]), int(ys[i])
        if y > t.height * 0.72 or y < t.height * 0.12: continue
        if any(abs(x - px) < r * 2.4 and abs(y - py) < r * 2.4 for px, py in placed): continue
        placed.append((x, y))
        offs = [(0, 0), (r * 1.7, r * 0.5)] if name == "cherry" else [(0, 0)]
        for ox, oy in offs:
            cx, cy = x + ox, y + oy
            d.ellipse([cx - r * 1.1, cy - r * 0.9 + 3, cx + r * 1.1 + 2, cy + r * 1.2 + 3], fill=(24, 44, 22, 120))   # soft shadow on the leaves
            d.ellipse([cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2], fill=(52, 30, 14, 255))
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (255,))
            d.pieslice([cx - r, cy - r, cx + r, cy + r], 20, 200, fill=tuple(int(c * 0.78) for c in col) + (255,))
            d.pieslice([cx - r * 0.8, cy - r * 0.8, cx + r * 0.8, cy + r * 0.8], 200, 290, fill=tuple(min(255, int(c * 1.12 + 14)) for c in col) + (255,))
            d.ellipse([cx - r * 0.55, cy - r * 0.7, cx - r * 0.05, cy - r * 0.2], fill=tuple(min(255, int(c * 0.4 + 150)) for c in col) + (255,))
            d.line([(cx, cy - r), (cx + 2, cy - r - 4)], fill=(70, 46, 22, 255), width=2)             # stalk
            d.ellipse([cx + 1, cy - r - 6, cx + 7, cy - r - 2], fill=(86, 150, 56, 255))             # leaf
        if len(placed) >= n: break
    # fallen fruit and a basket at the roots
    gx, gy = t.width * 0.5, t.height * 0.93
    for k in range(6):
        fx = gx + rng.uniform(-t.width * 0.22, t.width * 0.22); fy = gy + rng.uniform(-6, 10)
        rr = r * 0.8
        d.ellipse([fx - rr - 1, fy - rr - 1, fx + rr + 1, fy + rr + 1], fill=(52, 30, 14, 255))
        d.ellipse([fx - rr, fy - rr, fx + rr, fy + rr], fill=col + (255,))
        d.ellipse([fx - rr * 0.5, fy - rr * 0.7, fx - rr * 0.05, fy - rr * 0.2], fill=tuple(min(255, int(c * 0.4 + 150)) for c in col) + (255,))
    bx, by, bw = t.width * 0.78, t.height * 0.95, t.width * 0.17
    crate = img("terrain2.wooden_crate").resize((int(bw), int(bw * 0.95)), Image.LANCZOS)
    t.alpha_composite(crate, (int(bx - bw / 2), int(by - bw * 0.95)))
    for k in range(5):
        fx = bx - bw * 0.3 + k * bw * 0.15
        d.ellipse([fx - r * 0.7, by - bw * 0.95 - r * 0.5, fx + r * 0.7, by - bw * 0.95 + r * 0.9], fill=col + (255,), outline=(52, 30, 14, 255))
    p = os.path.join(OUT, f"tree_{name}.png")
    t.save(p, optimize=True)
    A[f"foliage.tree_{name}"] = {"file": f"assets/derived/props/tree_{name}.png", "width": t.width, "height": t.height,
                                  "source": "tools/paint_structures.py", "status": "painted-in-code",
                                  "notes": f"The game's oak with {name}s painted among the leaves, fallen fruit and a crate."}
    return t

# ------------------------------------------------------------------ waterfall
def waterfall(frame):
    sc = Scene(560, 540)
    sc.skirt(280, 488, 235, 42)
    x0, x1, top, bot = 100, 460, 80, 440
    r = np.random.default_rng(5)
    def jag(pts, amp):
        out = []
        for i, (x, y) in enumerate(pts):
            out.append((x + r.uniform(-amp, amp), y + r.uniform(-amp, amp)))
        return out
    # back cliff: rough rock wall with a ragged silhouette
    left = [(x0 - 34 + (i * 6) // 7, bot - i * 40) for i in range(9)]
    right = [(x1 + 34 - (i * 6) // 7, bot - i * 40) for i in range(9)]
    edge = jag(left[1:], 9) + [(x0 + 30, top + 8), (x0 + 80, top - 6), (x0 + 150, top + 10), (280, top - 2), (x1 - 150, top + 12), (x1 - 80, top - 4), (x1 - 30, top + 10)] + jag(right[:0:-1][:-1], 9)
    poly = [left[0]] + edge + [right[0]]
    cliff = sc.mask(lambda d, P: d.polygon(P(poly), fill=255))
    yy, xx = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
    u = (xx - 280 * S) / (180 * S)
    shade = np.clip(1.05 - 0.3 * np.clip(u + 0.5, 0, 2) ** 2, 0.55, 1.1) * vgrad(sc.w, sc.h, top, bot, 1.1, 0.74)
    sc.part(cliff, mat("stone", sc.w, sc.h, 1.7), shade)
    # ledges that break up the wall
    for lx0, ly, lw, lh in ((x0 - 20, 190, 90, 34), (x1 - 70, 250, 100, 38), (x0 - 6, 330, 110, 40), (x1 - 80, 360, 90, 34)):
        led = sc.mask(lambda d, P, lx0=lx0, ly=ly, lw=lw, lh=lh: d.rounded_rectangle([*P([(lx0, ly)])[0], *P([(lx0 + lw, ly + lh)])[0]], radius=10 * S, fill=255))
        sc.part(led, mat("stone", sc.w, sc.h, 2.0, seed=9), vgrad(sc.w, sc.h, ly, ly + lh, 1.18, 0.8))
    grime(sc, x0 - 20, x1 + 20, top + 10, bot - 10, 60, 14, 50)
    moss(sc, x0 - 30, top + 20, x1 + 30, bot, 140, 15)
    # grass cap with a tuft fringe
    cap = sc.mask(lambda d, P: d.polygon(P([(x0 - 30, top + 34), (x0 + 6, top - 8), (x0 + 60, top - 22), (x0 + 130, top - 10), (280, top - 18), (x1 - 130, top - 8), (x1 - 56, top - 20), (x1 - 4, top - 8), (x1 + 32, top + 34), (x1 + 4, top + 44), (x1 - 56, top + 30), (280, top + 22), (x0 + 120, top + 28), (x0 + 50, top + 14), (x0 + 6, top + 40)]), fill=255))
    sc.part(cap, fill("grass", sc.w, sc.h, 0.9), vgrad(sc.w, sc.h, top - 22, top + 44, 1.12, 0.86))
    # the water sheet: striped falls, animated by shifting the streak phase
    fx0, fx1 = 225, 335
    sheet = sc.mask(lambda d, P: d.polygon(P([(fx0 - 8, top + 12), (fx1 + 8, top + 12), (fx1 + 14, bot - 4), (fx0 - 14, bot - 4)]), fill=255))
    wa = np.zeros((sc.h, sc.w, 4), np.float32)
    wa[..., 3] = 255
    v = np.clip((yy - top * S) / ((bot - top) * S), 0, 1)
    wa[..., :3] = np.array([54, 150, 214], np.float32) * (1 - v[..., None] * 0.2) + np.array([120, 200, 240], np.float32) * v[..., None] * 0.2
    rs = np.random.default_rng(21)
    ph = frame / 4.0
    for i in range(46):
        sx = rs.uniform(fx0 + 4, fx1 - 4) * S
        ln = rs.uniform(30, 100) * S
        sp = rs.uniform(0.7, 1.3)
        y0_ = ((rs.uniform(0, 1) + ph * sp) % 1.0) * ((bot - top) * S + ln) + top * S - ln
        wd = max(2, int(rs.uniform(1.2, 3.2) * S))
        light = rs.random() < 0.6
        yy0, yy1 = int(max(0, y0_)), int(min(sc.h, y0_ + ln))
        xx0 = int(sx - wd / 2)
        if yy1 > yy0:
            wa[yy0:yy1, xx0:xx0 + wd, :3] = np.array([226, 246, 255] if light else [28, 104, 178], np.float32)
    wa[..., :3] *= (1.0 - 0.18 * np.abs((xx - (fx0 + fx1) / 2 * S) / ((fx1 - fx0) / 2 * S)) ** 2)[..., None]
    foam = np.clip((v - 0.84) / 0.16, 0, 1)[..., None]
    wa[..., :3] = wa[..., :3] * (1 - 0.55 * foam) + np.array([240, 250, 255], np.float32) * 0.55 * foam
    sc.part(sheet, Image.fromarray(np.clip(wa, 0, 255).astype(np.uint8)), None)
    d = ImageDraw.Draw(sc.im)
    # lip of the fall and foam bursts where the water hits each ledge
    d.ellipse([(fx0 - 6) * S, (top + 8) * S, (fx1 + 6) * S, (top + 20) * S], fill=(236, 248, 255, 120))
    for ly in (224, 288, 372):
        for k in range(9):
            ang = (k / 8) * math.pi
            px = (fx0 + fx1) / 2 + math.cos(ang) * 62 * (1 + 0.02 * frame)
            py = ly - math.sin(ang) * 10 + 2 * math.sin(frame * 1.57 + k)
            d.ellipse([(px - 4) * S, (py - 3) * S, (px + 4) * S, (py + 3) * S], fill=(244, 252, 255, 150))
    # plunge pool with ripples and lily pads
    pool = sc.mask(lambda d_, P: d_.ellipse([*P([(140, bot - 22)])[0], *P([(420, bot + 48)])[0]], fill=255))
    pyy, pxx = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
    pr = np.hypot((pxx - 280 * S) / (140 * S), (pyy - (bot + 13) * S) / (35 * S))
    pa = np.zeros((sc.h, sc.w, 4), np.float32); pa[..., 3] = 255
    pa[..., :3] = np.array([58, 156, 214], np.float32) * (0.78 + 0.3 * np.clip(pr, 0, 1))[..., None] + 30 * (0.5 + 0.5 * np.sin(pr * 26 - frame * 1.57))[..., None] * (pr < 0.9)[..., None]
    sc.part(pool, Image.fromarray(np.clip(pa, 0, 255).astype(np.uint8)), None)
    d = ImageDraw.Draw(sc.im)
    for k in range(4):
        rr_ = ((frame * 0.25 + k * 0.3) % 1.0)
        rx, ry = 20 + rr_ * 106, 6 + rr_ * 28
        d.ellipse([(280 - rx) * S, (bot + 8 - ry) * S, (280 + rx) * S, (bot + 8 + ry) * S], outline=(236, 250, 255, int(220 * (1 - rr_))), width=S * 2)
    for lx, ly in ((180, bot + 24), (372, bot + 30), (206, bot + 38)):
        d.ellipse([(lx - 13) * S, (ly - 6) * S, (lx + 13) * S, (ly + 6) * S], fill=(72, 150, 62, 255), outline=(30, 80, 30, 255))
        d.polygon([(lx * S, ly * S), ((lx + 14) * S, (ly - 4) * S), ((lx + 14) * S, (ly + 2) * S)], fill=(58, 156, 214, 255))
        d.ellipse([(lx - 3) * S, (ly - 6) * S, (lx + 3) * S, (ly - 1) * S], fill=(250, 244, 232, 255))
    rng = np.random.default_rng(frame + 1)
    for _ in range(40):
        px, py = 280 + rng.normal(0, 46), bot - rng.random() * 40
        rd = rng.integers(2, 6)
        d.ellipse([(px - rd) * S, (py - rd) * S, (px + rd) * S, (py + rd) * S], fill=(240, 252, 255, 200))
    mist = Image.new("RGBA", (sc.w, sc.h), (0, 0, 0, 0))
    ImageDraw.Draw(mist).ellipse([(190) * S, (bot - 50) * S, (370) * S, (bot + 20) * S], fill=(240, 250, 255, 70 + 10 * (frame % 2)))
    sc.im.alpha_composite(mist.filter(ImageFilter.GaussianBlur(S * 9)))
    # vines hanging over the cliff, reeds and rocks round the pool
    for vx, seed in ((x0 + 20, 41), (x0 + 70, 42), (x1 - 20, 43), (x1 - 80, 44), (190, 45)):
        ivy(sc, vx, top + 10, top + 90 + (seed % 3) * 36, seed, 6, 1.0)
    def reeds(dd):
        for bx in (116, 130, 428, 444, 150, 410):
            for k in range(4):
                tx = bx + k * 4
                dd.line([(tx * S, (bot + 22) * S), ((tx + (k - 2) * 3) * S, (bot - 20 - k * 6) * S)], fill=(72, 124, 56, 255), width=2 * S)
            dd.rounded_rectangle([(bx + 3) * S, (bot - 38) * S, (bx + 8) * S, (bot - 18) * S], radius=2 * S, fill=(108, 66, 34, 255), outline=(54, 30, 14, 255))
    free(sc, reeds)
    bushes(sc, [("foliage.rock_mossy", 130, 486, 120, False), ("foliage.rock_cluster", 432, 484, 110, True), ("foliage.fern", 80, 476, 90, False), ("foliage.bush_green", 486, 470, 100, True), ("foliage.rock_small", 330, 500, 60, False)])
    return sc

def waterfalls():
    scs = [waterfall(i) for i in range(4)]
    boxes = [f.im.getbbox() for f in scs]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    for i, sc in enumerate(scs):
        sc.im = sc.im.crop(box)
        sc.save(f"waterfall_f{i}", f"prop.waterfall_f{i}", "Waterfall over a stone cliff with a grass cap (frame %d of 4), made from the game's stone, grass and pond water." % (i + 1), keep=True)
    A["prop.waterfall"] = dict(A["prop.waterfall_f0"])
    return None

JOBS = {"silo": silo, "silo_v2": silo_v2, "silo_v3": silo_v3, "clock": clock_tower, "windmill": windmill, "greenhouse": lambda: (greenhouse(False), greenhouse(True)),
        "trees": lambda: [fruit_tree(n) for n in FRUITS], "waterfall": waterfalls}

if __name__ == "__main__":
    want = sys.argv[1:] or list(JOBS)
    for k in want:
        JOBS[k]()
        print("painted", k)
    json.dump(M, open(MPATH, "w"), indent=2)
