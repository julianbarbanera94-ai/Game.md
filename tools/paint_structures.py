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
def mat(kind, w, h, k=1.0, seed=3):
    key = (kind, w, h, k, seed)
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
        for yb in range(0, h, int(95 * S * k)):  # butt joints
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
    def sprite(self, key, cx, by, width, flip=False):
        s = img(key)
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
    def save(self, name, key, notes, final_w=None):
        out = self.im.crop(self.im.getbbox())
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
    bushes(sc, [("foliage.bush_green", 52, 470, 90, False), ("foliage.bush_flowering", 252, 474, 92, True), ("foliage.grass_tall", 150, 486, 80, False)])
    return sc.save("silo", "prop.silo", "Red plank silo with stone footing, iron hoops and slate dome, cut from the barn, well and roof art.")

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
    bushes(sc, [("foliage.bush_green", 140, 500, 120, False), ("foliage.bush_white_flowers", 392, 504, 120, True), ("foliage.grass_tall", 268, 512, 90, False)])
    return sc

def windmill():
    frames = []
    for i, ang in enumerate((8, 30, 52, 74)):     # a quarter turn covers the four-blade symmetry
        sc = windmill_frame(ang)
        frames.append(sc)
    # the frames must share one canvas size, so trim by the first and reuse its box
    box = frames[0].im.getbbox()
    outs = []
    for i, sc in enumerate(frames):
        sc.im = sc.im.crop(box)
        o = sc.save(f"windmill_f{i}", f"prop.windmill_f{i}", "Windmill with turning sails (frame %d of 4). Stone and plaster tower, clay-tile cap, canvas sails; cut from the well, cottage and barn art." % (i + 1))
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
    for x in np.linspace(x0 + 40, x1 - 40, 7):             # roof ribs
        t = (x - (x0 + 40)) / (x1 - x0 - 80)
        beam(x - (x - (x0 + 40)) * 0.0, roof_top, x + (x0 - 14 - (x0 + 40)) * (1 - t) * 0.0 + (t - 0.5) * 28, wall_top, 5, 0.8)
    beam(x0 - 14, wall_top, x1 + 14, wall_top, 9, 0.7)    # eave
    beam(x0 + 40, roof_top, x1 - 40, roof_top, 7, 0.82)
    beam(x0 + 50, ridge, x1 - 50, ridge, 7, 0.86)
    beam(x0, (wall_top + bot - 24) / 2 + 0, x1, (wall_top + bot - 24) / 2 + 0, 5, 0.8)
    sc.part(plinth, mat("stone", sc.w, sc.h, 1.1), vgrad(sc.w, sc.h, bot - 24, bot + 10, 1.05, 0.85))
    # door
    door = sc.mask(lambda d, P: d.rectangle([*P([(238, bot - 96)])[0], *P([(282, bot - 24)])[0]], fill=255))
    glass(door, 40)
    beam(238, bot - 96, 238, bot - 24, 6); beam(282, bot - 96, 282, bot - 24, 6); beam(238, bot - 96, 282, bot - 96, 6)
    bushes(sc, [("foliage.bush_flowering", 62, 356, 110, False), ("foliage.bush_green", 462, 360, 110, True), ("foliage.flower_patch", 380, 366, 100, False)])
    name = "greenhouse_planted" if planted else "greenhouse"
    return sc.save(name, "prop." + name, "Glass greenhouse on a stone plinth with a timber frame (%s). Wood and stone from the game's art, glass and crops painted in code." % ("planted" if planted else "empty"))

# ------------------------------------------------------------------ fruit trees
FRUITS = {
    "apple": ((206, 46, 38), (118, 22, 20), 17, "foliage.tree_oak"),
    "pear": ((196, 206, 70), (112, 124, 32), 15, "foliage.tree_oak"),
    "orange": ((240, 150, 38), (146, 80, 14), 17, "foliage.tree_oak"),
    "cherry": ((182, 22, 52), (96, 8, 26), 11, "foliage.tree_oak"),
}

def fruit_tree(name):
    col, dark, r0, base = FRUITS[name]
    t = img(base).copy()
    a = np.asarray(t).astype(np.float32)
    # fruit sits on the green canopy: pick leaf pixels (green dominant, opaque)
    green = (a[..., 3] > 250) & (a[..., 1] > a[..., 0] * 1.08) & (a[..., 1] > a[..., 2] * 1.2)
    ys, xs = np.nonzero(green)
    rng = np.random.default_rng(len(name) * 17)
    d = ImageDraw.Draw(t)
    n = 46
    chosen = rng.choice(len(xs), size=min(len(xs), n * 6), replace=False)
    placed = []
    s_ = t.width / 534
    r = max(4, int(r0 * s_ * 0.9))
    for i in chosen:
        x, y = int(xs[i]), int(ys[i])
        if y > t.height * 0.72 or y < t.height * 0.12: continue
        if any(abs(x - px) < r * 2.4 and abs(y - py) < r * 2.4 for px, py in placed): continue
        placed.append((x, y))
        pair = name == "cherry"
        offs = [(0, 0), (r * 1.7, r * 0.5)] if pair else [(0, 0)]
        for ox, oy in offs:
            cx, cy = x + ox, y + oy
            d.ellipse([cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2], fill=(52, 30, 14, 255))
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (255,))
            d.pieslice([cx - r, cy - r, cx + r, cy + r], 20, 200, fill=tuple(int(c * 0.8) for c in col) + (255,))
            d.ellipse([cx - r * 0.55, cy - r * 0.7, cx - r * 0.05, cy - r * 0.2], fill=tuple(min(255, int(c * 0.4 + 150)) for c in col) + (255,))
        if len(placed) >= n: break
    p = os.path.join(OUT, f"tree_{name}.png")
    t.save(p, optimize=True)
    A[f"foliage.tree_{name}"] = {"file": f"assets/derived/props/tree_{name}.png", "width": t.width, "height": t.height,
                                  "source": "tools/paint_structures.py", "status": "painted-in-code",
                                  "notes": f"The game's oak with {name}s painted among the leaves."}
    return t

# ------------------------------------------------------------------ waterfall
def waterfall(frame):
    sc = Scene(520, 520)
    sc.skirt(260, 470, 220, 40)
    x0, x1, top, bot = 90, 430, 70, 430
    # cliff face (stone) with rough top edge
    cliff = sc.mask(lambda d, P: d.polygon(P([(x0 - 30, bot), (x0 + 4, top + 24), (x0 + 50, top + 4), (x0 + 120, top + 14), (x1 - 100, top + 6), (x1 - 40, top + 22), (x1 + 4, top + 12), (x1 + 34, bot)]), fill=255))
    yy, xx = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
    u = (xx - 260 * S) / (170 * S)
    shade = np.clip(1.05 - 0.3 * np.clip(u + 0.5, 0, 2) ** 2, 0.55, 1.1) * vgrad(sc.w, sc.h, top, bot, 1.08, 0.78)
    sc.part(cliff, mat("stone", sc.w, sc.h, 1.7), shade)
    # grass cap
    cap = sc.mask(lambda d, P: d.polygon(P([(x0 - 24, top + 26), (x0 + 4, top - 6), (x0 + 50, top - 18), (x0 + 120, top - 8), (x1 - 100, top - 14), (x1 - 40, top - 2), (x1 + 4, top - 8), (x1 + 28, top + 26), (x1 + 6, top + 38), (x1 - 40, top + 26), (x1 - 100, top + 16), (x0 + 120, top + 22), (x0 + 50, top + 10), (x0 + 6, top + 32)]), fill=255))
    sc.part(cap, fill("grass", sc.w, sc.h, 0.9), vgrad(sc.w, sc.h, top - 18, top + 38, 1.12, 0.86))
    # the water sheet: striped falls, animated by shifting the streak phase
    fx0, fx1 = 205, 315
    sheet = sc.mask(lambda d, P: d.polygon(P([(fx0 - 8, top + 12), (fx1 + 8, top + 12), (fx1 + 14, bot - 4), (fx0 - 14, bot - 4)]), fill=255))
    wa = np.zeros((sc.h, sc.w, 4), np.float32)
    wa[..., 3] = 255
    v = np.clip((yy - top * S) / ((bot - top) * S), 0, 1)
    colr = np.array([54, 150, 214], np.float32) * (1 - v[..., None] * 0.2) + np.array([120, 200, 240], np.float32) * v[..., None] * 0.2
    wa[..., :3] = colr
    rs = np.random.default_rng(21)
    ph = frame / 4.0
    for i in range(34):                                  # falling streaks, each loops every 4 frames
        sx = rs.uniform(fx0 + 4, fx1 - 4) * S
        ln = rs.uniform(30, 90) * S
        sp = rs.uniform(0.7, 1.3)
        y0 = ((rs.uniform(0, 1) + ph * sp) % 1.0) * ((bot - top) * S + ln) + top * S - ln
        wd = max(2, int(rs.uniform(1.2, 3) * S))
        light = rs.random() < 0.6
        yy0, yy1 = int(max(0, y0)), int(min(sc.h, y0 + ln))
        xx0 = int(sx - wd / 2)
        if yy1 > yy0:
            wa[yy0:yy1, xx0:xx0 + wd, :3] = np.array([226, 246, 255] if light else [28, 104, 178], np.float32)
    shade_x = 1.0 - 0.18 * np.abs((xx - (fx0 + fx1) / 2 * S) / ((fx1 - fx0) / 2 * S)) ** 2
    wa[..., :3] = wa[..., :3] * shade_x[..., None]
    foam = np.clip((v - 0.8) / 0.2, 0, 1)[..., None]
    wa[..., :3] = wa[..., :3] * (1 - 0.55 * foam) + np.array([240, 250, 255], np.float32) * 0.55 * foam
    sc.part(sheet, Image.fromarray(np.clip(wa, 0, 255).astype(np.uint8)), None)
    # plunge pool
    pool = sc.mask(lambda d, P: d.ellipse([*P([(130, bot - 22)])[0], *P([(390, bot + 44)])[0]], fill=255))
    pyy, pxx = np.mgrid[0:sc.h, 0:sc.w].astype(np.float32)
    pr = np.hypot((pxx - 260 * S) / (130 * S), (pyy - (bot + 11) * S) / (33 * S))
    pa = np.zeros((sc.h, sc.w, 4), np.float32); pa[..., 3] = 255
    pa[..., :3] = np.array([58, 156, 214], np.float32) * (0.78 + 0.3 * np.clip(pr, 0, 1))[..., None] + 30 * (0.5 + 0.5 * np.sin(pr * 26 - frame * 1.57))[..., None] * (pr < 0.9)[..., None]
    sc.part(pool, Image.fromarray(np.clip(pa, 0, 255).astype(np.uint8)), None)
    d = ImageDraw.Draw(sc.im)
    rng = np.random.default_rng(frame + 1)
    for k in range(4):                                  # ripples spreading from the plunge
        rr_ = ((frame * 0.25 + k * 0.3) % 1.0)
        rx, ry = 20 + rr_ * 96, 6 + rr_ * 26
        d.ellipse([(260 - rx) * S, (bot + 6 - ry) * S, (260 + rx) * S, (bot + 6 + ry) * S], outline=(236, 250, 255, int(220 * (1 - rr_))), width=S * 2)
    for _ in range(26):                                 # spray and foam
        px, py = 260 + rng.normal(0, 40), bot - rng.random() * 30
        r = rng.integers(2, 6)
        d.ellipse([(px - r) * S, (py - r) * S, (px + r) * S, (py + r) * S], fill=(240, 252, 255, 200))
    bushes(sc, [("foliage.rock_mossy", 120, 470, 120, False), ("foliage.rock_cluster", 410, 468, 110, True), ("foliage.fern", 70, 460, 90, False), ("foliage.bush_green", 460, 452, 100, True)])
    return sc

def waterfalls():
    scs = [waterfall(i) for i in range(4)]
    box = scs[0].im.getbbox()
    for i, sc in enumerate(scs):
        sc.im = sc.im.crop(box)
        sc.save(f"waterfall_f{i}", f"prop.waterfall_f{i}", "Waterfall over a stone cliff with a grass cap (frame %d of 4), made from the game's stone, grass and pond water." % (i + 1))
    A["prop.waterfall"] = dict(A["prop.waterfall_f0"])
    return None

JOBS = {"silo": silo, "clock": clock_tower, "windmill": windmill, "greenhouse": lambda: (greenhouse(False), greenhouse(True)),
        "trees": lambda: [fruit_tree(n) for n in FRUITS], "waterfall": waterfalls}

if __name__ == "__main__":
    want = sys.argv[1:] or list(JOBS)
    for k in want:
        JOBS[k]()
        print("painted", k)
    json.dump(M, open(MPATH, "w"), indent=2)
