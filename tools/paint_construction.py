#!/usr/bin/env python3
"""Rebuild the four construction-site stages from the game's crisp painted art.

    python3 tools/paint_construction.py

The supplied stage sprites were soft upscales of a reference board. These are
assembled instead from the game's own painted pieces: the dirt ground
texture, timber cut from the wooden-bridge deck planks, the fallen log, water
barrel, crates, barrels and rocks. Timber gets a top-left light, a darker
underside and thin warm-brown edges to match the props. Painted at 2x and
reduced. Writes assets/derived/construction/stage1..4.png and points
building4.construction_stage1..4 at them.

Stages: 1 staked-out plot with materials, 2 plank floor and corner posts,
3 the full timber frame, 4 walls and roof boards going on.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = 2  # supersampling
W, H = 640 * K, 768 * K
EDGE = (58, 34, 14, 255)


def asset(key):
    m = json.load(open(os.path.join(ROOT, "assets", "manifest.json")))["assets"]
    return Image.open(os.path.join(ROOT, m[key]["file"])).convert("RGBA")


BRIDGE = asset("building.wooden_bridge")
PLANK = BRIDGE.crop((140, 52, 286, 76))  # one clean painted plank from the deck
DECK = BRIDGE.crop((140, 52, 286, 196))  # several planks side by side
rng = np.random.default_rng(21)


def noise_mask(w, h, scale, seed):
    r = np.random.default_rng(seed)
    cells = r.random((max(2, h // scale), max(2, w // scale)))
    return np.asarray(Image.fromarray((cells * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255


def ground():
    """An irregular patch of trodden dirt with soft, grassy edges."""
    tex = asset("terrain.dirt_detailed")
    m = int(min(tex.size) * 0.14)  # the sprite's border has grass tufts and gaps: use its clean centre
    core = tex.crop((m, m, tex.width - m, tex.height - m))
    arr0 = np.asarray(core, np.float32)
    base = np.median(arr0[arr0[..., 3] > 200][:, :3], axis=0)
    tile = core.resize((420 * K, int(420 * K * core.height / core.width)), Image.LANCZOS)
    quad = Image.new("RGBA", (tile.width * 2, tile.height * 2), (0, 0, 0, 0))
    quad.paste(tile, (0, 0))
    quad.paste(tile.transpose(Image.FLIP_LEFT_RIGHT), (tile.width, 0))
    quad.paste(tile.transpose(Image.FLIP_TOP_BOTTOM), (0, tile.height))
    quad.paste(tile.transpose(Image.ROTATE_180), (tile.width, tile.height))
    layer = Image.new("RGBA", (W, H), tuple(int(v) for v in base) + (255,))  # any gap shows plain dirt
    for y in range(0, H, quad.height):
        for x in range(0, W, quad.width):
            layer.alpha_composite(quad, (x, y))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy, rx, ry = W / 2, 570 * K, 300 * K, 180 * K
    d = ((xx - cx) / rx) ** 4 + ((yy - cy) / ry) ** 4  # a rounded square
    n = noise_mask(W, H, 40 * K, 3)
    alpha = np.clip((1 - d) * 5 + (n - 0.5) * 1.6, 0, 1)
    arr = np.asarray(layer, np.float32).copy()
    rim = np.clip(1 - np.abs(1 - d) * 3, 0, 1)
    arr[..., :3] *= (1 - 0.18 * rim[..., None]) * (0.92 + 0.12 * n[..., None])
    arr[..., 3] = alpha * 255
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def beam(length, thick, angle_deg, shade=1.0):
    """A painted timber of the given length/thickness, rotated, with edges and shading."""
    L, T = int(length), int(thick)
    strip = Image.new("RGBA", (L + 8, T), (0, 0, 0, 0))
    p = PLANK.resize((int(PLANK.width * T / PLANK.height), T), Image.LANCZOS)
    x = 0
    while x < L:
        strip.alpha_composite(p, (x, 0))
        x += p.width - 2
    strip = strip.crop((0, 0, L, T))
    arr = np.asarray(strip, np.float32).copy()
    yy = np.linspace(-1, 1, T)[:, None, None]
    arr[..., :3] *= (1.08 - 0.25 * (yy + 1) / 2) * shade  # lit from above, darker underside
    strip = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(strip)
    d.rectangle([0, 0, L - 1, T - 1], outline=EDGE, width=max(2, K + 1))
    return strip.rotate(angle_deg, resample=Image.BICUBIC, expand=True)


def put_beam(img, x0, y0, x1, y1, thick, shade=1.0):
    length = math.hypot(x1 - x0, y1 - y0)
    ang = -math.degrees(math.atan2(y1 - y0, x1 - x0))
    b = beam(length + thick * 0.6, thick, ang, shade)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    img.alpha_composite(b, (int(cx - b.width / 2), int(cy - b.height / 2)))


def put(img, key, cx, bottom, width, flip=False):
    im = asset(key)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    h = int(width * im.height / im.width)
    im = im.resize((int(width), h), Image.LANCZOS)
    img.alpha_composite(im, (int(cx - width / 2), int(bottom - h)))


def shadow(img, cx, cy, rx, ry, alpha=110):
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=alpha)
    sh = sh.filter(ImageFilter.GaussianBlur(14 * K))
    layer = Image.new("RGBA", (W, H), (30, 20, 8, 0))
    layer.putalpha(sh)
    img.alpha_composite(layer)


def polygon_fill(img, pts, texture, shade=1.0, rotate=0):
    """Fill a polygon with a texture (tiled), darkened by `shade`, with an edge."""
    tex = texture.rotate(rotate, expand=True) if rotate else texture
    tile = tex.resize((tex.width * K * 2, tex.height * K * 2), Image.LANCZOS)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for y in range(0, H, tile.height - 2):
        for x in range(0, W, tile.width - 2):
            layer.alpha_composite(tile, (x, y))
    arr = np.asarray(layer, np.float32).copy()
    arr[..., :3] *= shade
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    arr[..., 3] = np.asarray(mask, np.float32) * (arr[..., 3] / 255)
    img.alpha_composite(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA"))
    ImageDraw.Draw(img).polygon(pts, outline=EDGE, width=max(2, K + 1))


# --------------------------------------------------------------- the frame geometry (2x pixels)
FL, FR = 130 * K, 510 * K  # front wall left/right
BL, BR = 150 * K, 490 * K  # back wall (further away, so a little narrower and higher)
FY, BY = 650 * K, 535 * K  # floor front/back edges (shallow: the camera looks almost straight down)
WALL = 230 * K  # wall height
APEX = 130 * K  # gable height above the wall top


def floor(img, shade=0.9):
    pts = [(FL, FY), (FR, FY), (BR, BY), (BL, BY)]
    polygon_fill(img, pts, DECK, shade, rotate=0)


def posts(img, front=True, back=True, height=WALL, thick=22 * K):
    xs_f = [FL, (FL + FR) / 2, FR]
    xs_b = [BL, (BL + BR) / 2, BR]
    if back:
        for x in xs_b:
            put_beam(img, x, BY, x, BY - height * 0.92, thick * 0.9, 0.85)
    if front:
        for x in xs_f:
            put_beam(img, x, FY, x, FY - height, thick)


def frame(img):
    t = 20 * K
    # back wall: posts, top plate and gable
    posts(img, front=False)
    btop = BY - WALL * 0.92
    put_beam(img, BL, btop, BR, btop, t, 0.85)
    bmid = (BL + BR) / 2
    put_beam(img, BL, btop, bmid, btop - APEX * 0.9, t, 0.85)
    put_beam(img, BR, btop, bmid, btop - APEX * 0.9, t, 0.85)
    # side plates and ridge running front to back
    ftop = FY - WALL
    fmid = (FL + FR) / 2
    put_beam(img, FL, ftop, BL, btop, t * 0.9, 0.95)
    put_beam(img, FR, ftop, BR, btop, t * 0.9, 0.95)
    put_beam(img, fmid, ftop - APEX, bmid, btop - APEX * 0.9, t * 0.9, 1.0)
    # front wall: posts, top plate, gable rafters, a diagonal brace each side
    posts(img, back=False)
    put_beam(img, FL, ftop, FR, ftop, t)
    put_beam(img, FL, ftop, fmid, ftop - APEX, t)
    put_beam(img, FR, ftop, fmid, ftop - APEX, t)
    put_beam(img, FL + 10 * K, FY - 30 * K, fmid - 10 * K, ftop + 30 * K, t * 0.7)
    put_beam(img, FR - 10 * K, FY - 30 * K, fmid + 10 * K, ftop + 30 * K, t * 0.7)


def walls_and_roof(img):
    ftop, btop = FY - WALL, BY - WALL * 0.92
    fmid, bmid = (FL + FR) / 2, (BL + BR) / 2
    # left roof slope boarded, right one still open rafters
    polygon_fill(img, [(FL, ftop), (fmid, ftop - APEX), (bmid, btop - APEX * 0.9), (BL, btop)], DECK, 0.78, rotate=0)
    # front wall: lower planks on, a gap left for the door
    plank_rows = [(FY - 30 * K - r * 26 * K) for r in range(0, 5)]
    for y in plank_rows:
        put_beam(img, FL, y, fmid - 50 * K, y, 26 * K, 0.95)
        put_beam(img, fmid + 50 * K, y, FR, y, 26 * K, 0.95)


def materials(img, stage):
    put(img, "foliage.fallen_log", 470 * K, 730 * K, 230 * K)
    if stage <= 2:
        put(img, "foliage.fallen_log", 440 * K, 705 * K, 210 * K, flip=True)
    put(img, "building.water_barrel", 110 * K, 735 * K, 120 * K)
    if stage >= 2:
        put(img, "terrain2.wooden_crate", 230 * K, 742 * K, 96 * K)
    if stage >= 3:
        put(img, "terrain2.barrel", 560 * K, 640 * K, 80 * K)
    put(img, "foliage.rock_small", 330 * K, 748 * K, 90 * K)


def stakes(img):
    # four corner stakes with a taut string, marking out the walls
    corners = [(FL, FY), (FR, FY), (BR, BY), (BL, BY)]
    d = ImageDraw.Draw(img)
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        d.line([(a[0], a[1] - 34 * K), (b[0], b[1] - 34 * K)], fill=(240, 232, 205, 230), width=K * 2)
    for x, y in corners:
        put_beam(img, x, y, x, y - 52 * K, 16 * K)


def stage(n):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.alpha_composite(ground())
    shadow(img, W / 2 + 20 * K, 610 * K, 240 * K, 70 * K, 70)
    if n == 1:
        stakes(img)
    if n >= 2:
        floor(img, 0.88)
    if n == 2:
        posts(img, height=120 * K)
    if n >= 3:
        frame(img)
    if n >= 4:
        walls_and_roof(img)
        # a ladder leaning on the right wall
        put_beam(img, FR + 40 * K, FY + 10 * K, FR - 10 * K, FY - WALL + 20 * K, 12 * K)
        put_beam(img, FR + 70 * K, FY + 10 * K, FR + 20 * K, FY - WALL + 20 * K, 12 * K)
        for k in range(1, 7):
            f = k / 7
            y = FY + 10 * K - f * (WALL - 10 * K)
            x0 = FR + 40 * K - f * 50 * K
            put_beam(img, x0, y, x0 + 30 * K, y, 8 * K)
    materials(img, n)
    out = img.resize((W // K, H // K), Image.LANCZOS)
    box = out.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    return out.crop(box)


def main():
    out_dir = os.path.join(ROOT, "assets", "derived", "construction")
    os.makedirs(out_dir, exist_ok=True)
    mpath = os.path.join(ROOT, "assets", "manifest.json")
    manifest = json.load(open(mpath))
    for n in range(1, 5):
        img = stage(n)
        rel = f"assets/derived/construction/stage{n}.png"
        img.save(os.path.join(ROOT, rel), optimize=True)
        manifest["assets"][f"building4.construction_stage{n}"] = {
            "file": rel, "width": img.width, "height": img.height, "source": "tools/paint_construction.py",
            "status": "composited-from-game-art",
            "notes": "Built from the game's crisp painted pieces (dirt, bridge-deck planks, log, barrels, crates, rocks); replaces the soft reference-board upscale.",
        }
        print(f"stage{n} {img.size}")
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
