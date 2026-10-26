#!/usr/bin/env python3
"""Import vehicles from the Farmstead Vehicle Angles pack.

    python3 -I tools/import_vehicle_angles.py <Farmstead_Vehicle_Angles_Pack folder>

The pack is 8 view crops (N, NE, ... NW) per vehicle, each only ~92x108 px, cut from
one generated atlas, with the atlas's grey direction label bar and checkerboard
background still in the pixels. For each vehicle this tool takes the "S" crop (the
true overhead view: the machine faces up/north), cuts off the label bar, removes the
checkerboard by flood-filling from the border, trims it, enlarges it 2x with Lanczos
(only so the game can rotate it smoothly; no detail is added) and registers
`vehicle.<id>` in assets/manifest.json. The game rotates this one sprite to any
heading instead of swapping the angled crops.
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "vehicles")

# game id -> pack name; the "S" view is used for all of them
USED = {
    "tractor_small": "tractor_red",
    "tractor_large": "tractor_blue",
    "crop_trailer": "trailer_wooden",
    "plough": "plough_4",
    "seeder": "seeder",
}
LABEL_ROWS = 13  # px of dark direction label at the top of every crop


def is_background(px):
    r, g, b = int(px[0]), int(px[1]), int(px[2])
    return min(r, g, b) > 205 and max(r, g, b) - min(r, g, b) < 18


def cut_out(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).copy()
    # drop the grey direction-label bar (and anything above it): rows that are mostly mid-dark grey
    lum = a[..., :3].astype(float).mean(axis=2)
    spread = a[..., :3].astype(float).max(axis=2) - a[..., :3].astype(float).min(axis=2)
    darkgrey = (lum > 40) & (lum < 135) & (spread < 40)
    bar_rows = [y for y in range(min(34, a.shape[0])) if darkgrey[y].mean() > 0.5]
    a = a[(bar_rows[-1] + 1) if bar_rows else 0:]
    h, w, _ = a.shape
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or bg[y, x]:
            continue
        if not is_background(a[y, x]):
            continue
        bg[y, x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([a[..., :3], alpha]).astype(np.uint8), "RGBA")
    # shave the light halo left by the checkerboard and soften the edge a touch
    mask = out.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out.putalpha(mask)
    box = out.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    return out.crop(box)


def main():
    pack = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(ROOT, "assets", "manifest.json")
    manifest = json.load(open(mpath))
    for key in [k for k in manifest["assets"] if k.startswith("vehicle.")]:
        del manifest["assets"][key]
    for gid, name in USED.items():
        sprite = cut_out(os.path.join(pack, f"{name}_S.png"))
        native = sprite.size
        sprite = sprite.resize((native[0] * 2, native[1] * 2), Image.LANCZOS)
        dst = os.path.join(OUT, f"{gid}.png")
        sprite.save(dst, optimize=True)
        manifest["assets"][f"vehicle.{gid}"] = {
            "file": os.path.relpath(dst, ROOT).replace(os.sep, "/"),
            "width": sprite.size[0], "height": sprite.size[1],
            "source": f"Farmstead_Vehicle_Angles_Pack/{name}_S.png", "status": "temporary-reference-derived",
            "notes": f"Native crop {native[0]}x{native[1]} px from a generated atlas (label bar and checkerboard removed), "
                     "enlarged 2x for smooth rotation. Low resolution: replace with a properly exported sprite.",
        }
        print(f"vehicle.{gid}: native {native[0]}x{native[1]} -> {sprite.size[0]}x{sprite.size[1]}")
    manifest["assets"] = dict(sorted(manifest["assets"].items()))
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
