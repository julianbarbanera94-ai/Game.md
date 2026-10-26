#!/usr/bin/env python3
"""Import redrawn, one-object-per-file sprites into the game.

    python3 -I tools/import_redrawn.py <folder of PNGs> [--dry-run] [--min-ratio 0.5]

Each file must be named after its manifest key (e.g. building4.house_l2.png,
see docs/ART_SIZES.csv). For every file the tool:

  1. keys out a flat magenta (#FF00FF) background if the PNG has no transparency,
  2. trims the empty margin,
  3. checks the object is big enough: long edge >= min-ratio x the target size
     in docs/ART_SIZES.csv (default 0.5, the brief's "minimum acceptable"),
  4. checks the detail is real: the image must not be a smooth enlargement
     (effective detail >= min-ratio x target). With --upscaled this check is
     skipped on purpose (the pack is a known high-resolution export of existing
     art) and the sprites are marked "hires-upscaled", not "redrawn",
  5. downsizes (never enlarges) anything larger than the target, with no sharpening,
  6. saves it to assets/redrawn/<key>.png and points the manifest at it.

Files that fail a check are reported and left out; the old sprite stays in use.
Nothing is enlarged and nothing is sharpened. Sprites larger than a sensible
on-screen size are downsized (buildings 768 px, trees 640 px) to save memory.
"""
import argparse
import csv
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import audit_assets as audit  # noqa: E402  (effective_factor)

ROOT = os.path.dirname(HERE)


def load_targets(root):
    out = {}
    with open(os.path.join(root, "docs", "ART_SIZES.csv")) as f:
        for r in csv.DictReader(f):
            w, h = r["target_canvas_px"].split("x")
            out[r["file_name"]] = (int(w), int(h), r["group"])
    return out


def key_magenta(im):
    """Make flat magenta (and its anti-aliased fringe) transparent."""
    a = np.asarray(im.convert("RGBA")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dist = np.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2)
    alpha = np.clip((dist - 40) / 90, 0, 1)  # soft ramp so edges stay smooth
    # un-premultiply the magenta tint out of fringe pixels
    fringe = (alpha > 0) & (alpha < 1)
    for c, base in ((0, 255), (1, 0), (2, 255)):
        ch = a[..., c].astype(np.float32)
        ch[fringe] = np.clip((ch[fringe] - base * (1 - alpha[fringe])) / alpha[fringe], 0, 255)
        a[..., c] = ch.astype(np.int32)
    a[..., 3] = (a[..., 3] * alpha).astype(np.int32)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def prepare(path):
    im = Image.open(path).convert("RGBA")
    alpha = np.asarray(im)[..., 3]
    if alpha.min() > 250:  # opaque file: expect the flat magenta background
        border = np.concatenate([np.asarray(im)[0], np.asarray(im)[-1], np.asarray(im)[:, 0], np.asarray(im)[:, -1]])[:, :3].astype(int)
        magenta = ((border[:, 0] > 200) & (border[:, 2] > 200) & (border[:, 1] < 90)).mean()
        if magenta < 0.8:
            return None, "opaque background that is not flat magenta (#FF00FF); send a transparent PNG or a magenta background"
        im = key_magenta(im)
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return None, "empty image"
    pad = 2
    box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(im.size[0], bbox[2] + pad), min(im.size[1], bbox[3] + pad))
    return im.crop(box), None


# Long-edge caps (px): bigger than this is wasted memory on a phone screen.
CAPS = {"1 Buildings": 768, "2 Trees": 640}


def check(im, target, min_ratio, upscaled=False):
    tw, th, _ = target
    w, h = im.size
    ratio = max(w / tw, h / th)
    if ratio < min_ratio:
        return f"too small: object is {w}x{h}, needs about {tw}x{th} (at least {round(min_ratio * 100)}% of that)"
    if upscaled:
        return None
    f, _ = audit.effective_factor(im)
    if f >= 2.0 and max(w, h) / f < min_ratio * max(tw, th):
        return f"looks like an enlargement (real detail ~{round(max(w, h) / f)} px of {max(w, h)}); needs more genuine detail"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--root", default=ROOT, help="game repo root (default: this repo)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-ratio", type=float, default=0.5)
    ap.add_argument("--upscaled", action="store_true", help="accept known high-resolution exports of existing art (skips the enlargement check)")
    args = ap.parse_args()
    root = args.root
    targets = load_targets(root)
    mpath = os.path.join(root, "assets", "manifest.json")
    manifest = json.load(open(mpath))
    outdir = os.path.join(root, "assets", "redrawn")
    index_path = os.path.join(outdir, "redrawn.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}

    accepted, rejected, unknown = [], [], []
    for dp, _, files in os.walk(args.folder):
        for fn in sorted(files):
            if not fn.lower().endswith(".png"):
                continue
            key = fn[:-4]
            path = os.path.join(dp, fn)
            if key not in targets or key not in manifest["assets"]:
                unknown.append(fn)
                continue
            im, err = prepare(path)
            err = err or check(im, targets[key], args.min_ratio, args.upscaled)
            if err:
                rejected.append((key, err))
                continue
            tw, th, group = targets[key]
            scale = min(1.0, tw / im.size[0], th / im.size[1])
            if group in CAPS:
                scale = min(scale, CAPS[group] / max(im.size))
            if scale < 1.0:
                im = im.resize((round(im.size[0] * scale), round(im.size[1] * scale)), Image.LANCZOS)
            accepted.append((key, im))

    for key, im in accepted:
        print(f"OK       {key:34s} {im.size[0]}x{im.size[1]}")
    for key, err in rejected:
        print(f"REJECTED {key:34s} {err}")
    for fn in unknown:
        print(f"UNKNOWN  {fn:34s} not a game asset name (see docs/ART_SIZES.csv)")
    print(f"\n{len(accepted)} accepted, {len(rejected)} rejected, {len(unknown)} unknown")
    if args.dry_run or not accepted:
        return 0 if not rejected else 1

    os.makedirs(outdir, exist_ok=True)
    for key, im in accepted:
        dst = os.path.join(outdir, f"{key}.png")
        im.save(dst, optimize=True)
        entry = {"file": os.path.relpath(dst, root).replace(os.sep, "/"), "width": im.size[0], "height": im.size[1],
                 "source": "hires-export" if args.upscaled else "redrawn", "status": "hires-upscaled" if args.upscaled else "redrawn",
                 "notes": ("High-resolution export of the previous sprite (supplied by the project owner; an upscale, not new detail)"
                           if args.upscaled else "Redrawn sprite supplied by the project owner")
                 + "; margins trimmed, downsized only if larger than needed."}
        manifest["assets"][key] = entry
        index[key] = entry
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    with open(index_path, "w") as f:
        json.dump(index, f, indent=1)
    print(f"manifest updated: {len(accepted)} sprites now come from assets/redrawn/")
    return 0 if not rejected else 1


if __name__ == "__main__":
    sys.exit(main())
