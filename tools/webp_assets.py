#!/usr/bin/env python3
"""Re-encode the game's larger PNG sprites as lossless WebP (smaller download and APK).

    python3 tools/webp_assets.py [--min-kb 40]

Every visible pixel is kept exactly (checked for each file); only the colour
of fully transparent pixels may change, which is never drawn. The manifest is
pointed at the .webp and the .png is removed. Files that HTML, CSS or code name
directly keep their PNG.
"""
import argparse
import io
import json
import os
import re

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def direct_refs():
    refs = set()
    paths = ["index.html", "styles.css"] + [os.path.join(d, f) for d, _, fs in os.walk(os.path.join(ROOT, "src")) for f in fs]
    for p in paths:
        text = open(os.path.join(ROOT, p)).read()
        refs.update(os.path.normpath(u) for u in re.findall(r"assets/[\w./-]+\.png", text))
    return refs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-kb", type=int, default=40)
    args = ap.parse_args()
    mpath = os.path.join(ROOT, "assets", "manifest.json")
    manifest = json.load(open(mpath))
    keep = direct_refs()
    before = after = n = 0
    for key, e in manifest["assets"].items():
        f = e.get("file", "")
        src = os.path.join(ROOT, f)
        if not f.endswith(".png") or os.path.normpath(f) in keep or not os.path.exists(src):
            continue
        size = os.path.getsize(src)
        if size < args.min_kb * 1024:
            continue
        im = Image.open(src)
        im.load()
        buf = io.BytesIO()
        im.save(buf, "WEBP", lossless=True, method=6)
        a = np.asarray(im.convert("RGBA")).astype(int)
        b = np.asarray(Image.open(io.BytesIO(buf.getvalue())).convert("RGBA")).astype(int)
        vis = a[..., 3] > 0
        if not np.array_equal(a[..., 3], b[..., 3]) or (vis.any() and np.abs(a[vis][:, :3] - b[vis][:, :3]).max() > 0):
            print(f"skip {key}: not pixel-identical")
            continue
        if buf.tell() >= size:
            continue
        dst = src[:-4] + ".webp"
        open(dst, "wb").write(buf.getvalue())
        os.remove(src)
        e["file"] = f[:-4] + ".webp"
        before += size
        after += buf.tell()
        n += 1
    # other manifest entries pointing at the same PNG follow it
    for e in manifest["assets"].values():
        f = e.get("file", "")
        if f.endswith(".png") and not os.path.exists(os.path.join(ROOT, f)) and os.path.exists(os.path.join(ROOT, f[:-4] + ".webp")):
            e["file"] = f[:-4] + ".webp"
    with open(mpath, "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print(f"{n} sprites: {before // 1024} KB -> {after // 1024} KB")


if __name__ == "__main__":
    main()
