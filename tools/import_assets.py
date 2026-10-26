#!/usr/bin/env python3
"""Farmstead asset import pipeline.

Copies approved runtime sprites out of the supplied phase packs into
``assets/`` and derives temporary sprites from Phase 3 reference boards.
Writes ``assets/manifest.json`` describing every runtime asset.

Usage (paths point at extracted phase ZIPs, each in its own folder):

    python3 -I tools/import_assets.py --phase1 <dir> --phase2 <dir> --phase3 <dir>

Requires Pillow + numpy. Source packs are not committed; re-run this tool to
regenerate the runtime assets if a pack is updated.
"""
import argparse
import json
import os
import shutil
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")

manifest = {"version": 1, "assets": {}}


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def register(key, path, source, status, **extra):
    im = Image.open(path)
    entry = {"file": rel(path), "width": im.size[0], "height": im.size[1],
             "source": source, "status": status}
    entry.update(extra)
    manifest["assets"][key] = entry


def ensure(d):
    os.makedirs(d, exist_ok=True)
    return d


# ---------------------------------------------------------------- cleanup

def clean_spill(im):
    """Recolour dark magenta/purple key spill on sprite edges to a neutral
    shadow tone. Bright pinks (e.g. blossom petals) are left untouched."""
    a = np.asarray(im.convert("RGBA")).astype(np.int32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    lum = (r * 3 + g * 6 + b) // 10
    purple = (al > 0) & (r - g > 20) & (b - g > 20) & (lum < 140)
    # only near transparency (within 6px)
    transparent = al == 0
    near = np.zeros_like(transparent)
    for dy in range(-6, 7, 2):
        for dx in range(-6, 7, 2):
            near |= np.roll(np.roll(transparent, dy, 0), dx, 1)
    mask = purple & near
    count = int(mask.sum())
    if count:
        shade = np.clip(lum * 0.55, 0, 255)
        a[..., 0] = np.where(mask, shade * 0.85, r)
        a[..., 1] = np.where(mask, shade * 1.0, g)
        a[..., 2] = np.where(mask, shade * 0.55, b)
    return Image.fromarray(a.astype(np.uint8), "RGBA"), count


def trim(im, pad=2):
    bb = im.getchannel("A").getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    return im.crop((max(0, x0 - pad), max(0, y0 - pad),
                    min(im.size[0], x1 + pad), min(im.size[1], y1 + pad)))


def key_background(im, seeds, tol):
    """Flood-fill the background from seed points (colour distance <= tol from
    the seed colour) and make it transparent. Returns RGBA image."""
    rgb = np.asarray(im.convert("RGB")).astype(np.int32)
    h, w, _ = rgb.shape
    bg = np.zeros((h, w), bool)
    for sx, sy in seeds:
        if bg[sy, sx]:
            continue
        ref = rgb[sy, sx]
        q = deque([(sx, sy)])
        bg[sy, sx] = True
        while q:
            x, y = q.popleft()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and not bg[ny, nx]:
                    if np.abs(rgb[ny, nx] - ref).sum() <= tol:
                        bg[ny, nx] = True
                        q.append((nx, ny))
    # soften: pixels bordering background get partial alpha
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    edge = (~bg) & (np.roll(bg, 1, 0) | np.roll(bg, -1, 0) | np.roll(bg, 1, 1) | np.roll(bg, -1, 1))
    alpha = np.where(edge, 170, alpha).astype(np.uint8)
    out = np.dstack([rgb.astype(np.uint8), alpha])
    return Image.fromarray(out, "RGBA")


def largest_component(im):
    """Keep only the largest opaque connected component (drops label text)."""
    a = np.asarray(im)
    op = a[..., 3] > 0
    h, w = op.shape
    labels = np.zeros((h, w), np.int32)
    sizes = {}
    cur = 0
    for y in range(h):
        for x in range(w):
            if op[y, x] and not labels[y, x]:
                cur += 1
                q = deque([(x, y)])
                labels[y, x] = cur
                n = 0
                while q:
                    cx, cy = q.popleft()
                    n += 1
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and op[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = cur
                            q.append((nx, ny))
                sizes[cur] = n
    if not sizes:
        return im
    keep = max(sizes, key=sizes.get)
    out = a.copy()
    out[..., 3] = np.where(labels == keep, a[..., 3], 0)
    return Image.fromarray(out, "RGBA")


def border_seeds(w, h, step=6):
    s = []
    for x in range(0, w, step):
        s += [(x, 0), (x, h - 1)]
    for y in range(0, h, step):
        s += [(0, y), (w - 1, y)]
    return s


# ---------------------------------------------------------------- phase 1

P1_BUILDINGS = ["starter_house", "tool_shed", "market_stall", "well_building", "mailbox",
                "signpost", "workbench", "water_barrel", "wooden_bridge", "fence_segment",
                "chicken_coop", "small_barn"]
P1_FOLIAGE = ["bush_berries", "bush_flowering", "bush_green", "bush_white_flowers",
              "bush_yellow_flowers", "fallen_log", "fern", "flower_patch", "flower_yellow",
              "grass_tall", "mushrooms", "rock_cluster", "rock_mossy", "rock_small",
              "tree_autumn", "tree_birch", "tree_blossom", "tree_oak", "tree_pine", "tree_stump"]
P1_TERRAIN = ["grass_detailed", "dirt_detailed", "sand_path_detailed", "water_pond_detailed",
              "fence_horizontal_detailed", "fence_vertical_detailed", "fence_gate_detailed",
              "shoreline", "cobblestone_detailed", "tilled_soil_detailed", "grass_tuft_tile",
              "flower_patch_tile"]
P1_AUDIO = ["coin_pickup", "footstep", "harvest", "plant_seed", "ui_click", "watering"]


def import_sprite(src, dst, key, source, do_trim=True, **extra):
    im = Image.open(src).convert("RGBA")
    im, spill = clean_spill(im)
    if do_trim:
        im = trim(im)
    im.save(dst, optimize=True)
    notes = extra.pop("notes", "")
    if spill:
        notes = (notes + " " if notes else "") + f"Cleaned {spill} magenta-spill edge pixels."
    register(key, dst, source, "approved", notes=notes, **extra)


def phase1(root):
    a = os.path.join(root, "assets")
    d = ensure(os.path.join(OUT, "phase1", "buildings"))
    for n in P1_BUILDINGS:
        import_sprite(os.path.join(a, "03_buildings", n + ".png"), os.path.join(d, n + ".png"),
                      "building." + n, "phase1/assets/03_buildings (v2 detailed)")
    d = ensure(os.path.join(OUT, "phase1", "foliage"))
    for n in P1_FOLIAGE:
        import_sprite(os.path.join(a, "02_environment", "foliage", n + ".png"), os.path.join(d, n + ".png"),
                      "foliage." + n, "phase1/assets/02_environment/foliage (v2 detailed)")
    d = ensure(os.path.join(OUT, "phase1", "terrain"))
    for n in P1_TERRAIN:
        import_sprite(os.path.join(a, "01_terrain", "reference_tiles", n + ".png"), os.path.join(d, n + ".png"),
                      "terrain." + n, "phase1/assets/01_terrain/reference_tiles (v2 detailed)",
                      notes="Illustrative tile vignette with ragged edges; used as a texture stamp source, not a seamless tile.")
    d = ensure(os.path.join(OUT, "phase1", "audio"))
    for n in P1_AUDIO:
        dst = os.path.join(d, n + ".wav")
        shutil.copyfile(os.path.join(a, "10_audio", n + ".wav"), dst)
        manifest["assets"]["audio." + n] = {"file": rel(dst), "source": "phase1/assets/10_audio",
                                            "status": "placeholder",
                                            "notes": "Pack-supplied placeholder SFX; replace before release."}


# ---------------------------------------------------------------- phase 2

P2_PLAYER = ["idle_front", "idle_back", "idle_right", "idle_right_alt", "walk_front_1", "walk_front_2",
             "walk_back_1", "walk_back_2", "walk_left_1", "walk_left_2", "walk_right_1", "walk_right_2",
             "hoe_action", "water_action", "harvest_action", "carry_action"]
P2_TERRAIN = ["dirt_path", "sand_path", "pond_water", "shoreline_water", "grass_flower", "tall_grass",
              "flower_patch", "fence_straight", "fence_corner", "wooden_gate", "wooden_crate", "barrel",
              "berry_bush", "flowering_bush", "rock_cluster", "tree_stump", "oak_tree", "pine_tree",
              "autumn_tree", "blossom_tree", "cliff_grass_edge", "wooden_bridge", "cobblestone_path",
              "tilled_soil_sprouts"]


def phase2(root):
    base = root
    sub = os.path.join(root, "Farmstead_Phase_2_Character_Terrain")
    if os.path.isdir(sub):
        base = sub
    a = os.path.join(base, "assets")
    d = ensure(os.path.join(OUT, "phase2", "player"))
    for n in P2_PLAYER:
        # Player frames keep their uniform 320x320 canvas so feet stay aligned.
        import_sprite(os.path.join(a, "characters", "player", n + ".png"), os.path.join(d, n + ".png"),
                      "player." + n, "phase2/assets/characters/player", do_trim=False,
                      anchor=[0.5, 306 / 320])
    d = ensure(os.path.join(OUT, "phase2", "terrain"))
    for n in P2_TERRAIN:
        import_sprite(os.path.join(a, "terrain", "tiles", n + ".png"), os.path.join(d, n + ".png"),
                      "terrain2." + n, "phase2/assets/terrain/tiles")
    ref = ensure(os.path.join(ROOT, "docs", "reference"))
    im = Image.open(os.path.join(base, "source_sheets", "approved_starting_area_reference.png")).convert("RGB")
    im.save(os.path.join(ref, "approved_starting_area_reference.jpg"), quality=88)


# ---------------------------------------------------------------- phase 3 (derived)

P3_CROPS = ["carrot", "tomato", "lettuce", "potato", "corn", "wheat", "pumpkin", "strawberry"]
P3_ROWS = [(38, 107), (119, 186), (200, 270), (283, 353), (366, 439), (451, 522), (536, 605), (618, 689)]
P3_STAGE_COLS = {"tilled": 0, "planted": 1, "sprout": 2, "growing1": 3, "growing2": 4,
                 "mature": 5, "ready": 6, "ready_alt": 7, "harvested": 8}
DERIVED_NOTE = ("TEMPORARY: sliced from a Phase 3 reference board (~80px cells, keyed background). "
                "Replace with properly exported production sprites.")


def plot_mask(cell, size=None):
    """Crop a plot cell to its stone-rimmed soil square and apply a rounded
    rectangle alpha mask so no board background survives."""
    a = np.asarray(cell.convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    brown = (r > 50) & (r < 200) & (g < 140) & (b < 100) & (r > g + 12)
    ys, xs = np.nonzero(brown)
    # robust bbox: ignore stray pixels using percentiles
    x0, x1 = np.percentile(xs, [0.5, 99.5]).astype(int)
    y0, y1 = np.percentile(ys, [0.5, 99.5]).astype(int)
    im = cell.convert("RGBA").crop((x0, y0, x1 + 1, y1 + 1))
    if size:
        im = im.resize(size, Image.LANCZOS)
    w, h = im.size
    mask = Image.new("L", (w * 4, h * 4), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle((2, 2, w * 4 - 3, h * 4 - 3), radius=int(min(w, h) * 4 * 0.14), fill=255)
    im.putalpha(mask.resize((w, h), Image.LANCZOS))
    return im


def cut_cell(img, box):
    return plot_mask(img.crop(box))


def phase3(root):
    grid = Image.open(os.path.join(root, "01_crop_growth_reference", "crop_growth_stages_all.png")).convert("RGB")
    d = ensure(os.path.join(OUT, "derived", "phase3", "plots"))
    x_start, x_end = 98, 838
    cw = (x_end - x_start) / 9.0
    for ri, crop in enumerate(P3_CROPS):
        y0, y1 = P3_ROWS[ri]
        for stage, ci in P3_STAGE_COLS.items():
            if crop != "carrot" and stage in ("tilled", "harvested"):
                continue
            x0 = int(round(x_start + ci * cw)) - 3
            box = (x0, y0 - 6, int(round(x0 + cw)) + 2, y1 + 6)
            im = cut_cell(grid, box)
            name = f"{crop}_{stage}" if stage not in ("tilled", "harvested") else f"soil_{stage}"
            dst = os.path.join(d, name + ".png")
            im.save(dst, optimize=True)
            register("plot." + name, dst, "phase3/01_crop_growth_reference/crop_growth_stages_all.png",
                     "temporary-reference-derived", notes=DERIVED_NOTE)
    # untilled + wet soil from soil variations board (2 cols x 3 rows)
    soil = Image.open(os.path.join(root, "04_soil_and_crop_states", "soil_variations.png")).convert("RGB")
    sw, sh = soil.size
    # Only "dry" is used (untilled plot). Resized to the crop-cell size so all
    # plot states share one footprint (slight non-uniform scale, noted).
    cells = {"dry": (23, 6, 136, 90)}
    for name, box in cells.items():
        im = plot_mask(soil.crop((box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4)), size=(80, 75))
        dst = os.path.join(d, f"soil_{name}.png")
        im.save(dst, optimize=True)
        register(f"plot.soil_{name}", dst, "phase3/04_soil_and_crop_states/soil_variations.png",
                 "temporary-reference-derived", notes=DERIVED_NOTE)
    # produce icons from the left column of the growth grid (drop label text)
    d = ensure(os.path.join(OUT, "derived", "phase3", "icons"))
    for ri, crop in enumerate(P3_CROPS):
        y0, y1 = P3_ROWS[ri]
        cell = grid.crop((2, y0 - 6, 94, y1 - 10))
        w, h = cell.size
        im = trim(largest_component(key_background(cell, border_seeds(w, h, 3), 60)), 1)
        dst = os.path.join(d, f"produce_{crop}.png")
        im.save(dst, optimize=True)
        register(f"icon.produce_{crop}", dst, "phase3/01_crop_growth_reference/crop_growth_stages_all.png",
                 "temporary-reference-derived", notes=DERIVED_NOTE)
    # seed packets: 4 x 2 grid
    seeds = Image.open(os.path.join(root, "02_seed_items_reference", "seed_items_all.png")).convert("RGB")
    order = ["carrot", "tomato", "lettuce", "potato", "corn", "wheat", "pumpkin", "strawberry"]
    for i, crop in enumerate(order):
        cx, cy = i % 4, i // 4
        box = (cx * 95 + 2, cy * 140 + 2, (cx + 1) * 95 - 2, cy * 140 + 108)
        cell = seeds.crop(box)
        w, h = cell.size
        im = trim(largest_component(key_background(cell, border_seeds(w, h, 3), 50)), 1)
        dst = os.path.join(d, f"seed_{crop}.png")
        im.save(dst, optimize=True)
        register(f"icon.seed_{crop}", dst, "phase3/02_seed_items_reference/seed_items_all.png",
                 "temporary-reference-derived", notes=DERIVED_NOTE)
    # tools: hoe, watering can, basket (full)
    tools = Image.open(os.path.join(root, "06_farming_tools", "farming_tools.png")).convert("RGB")
    tool_boxes = {"hoe": (4, 38, 82, 128), "watering_can": (88, 38, 172, 128),
                  "basket": (92, 158, 176, 232)}
    for name, box in tool_boxes.items():
        cell = tools.crop(box)
        w, h = cell.size
        im = trim(largest_component(key_background(cell, border_seeds(w, h, 3), 50)), 1)
        dst = os.path.join(d, f"tool_{name}.png")
        im.save(dst, optimize=True)
        register(f"icon.tool_{name}", dst, "phase3/06_farming_tools/farming_tools.png",
                 "temporary-reference-derived", notes=DERIVED_NOTE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase1")
    ap.add_argument("--phase2")
    ap.add_argument("--phase3")
    ap.add_argument("--phase4")
    ap.add_argument("--phase5")
    ap.add_argument("--interior", action="store_true", help="derive indoor props from already-imported crisp sprites")
    args = ap.parse_args()
    mpath = os.path.join(OUT, "manifest.json")
    if os.path.exists(mpath):
        with open(mpath) as f:
            manifest["assets"].update(json.load(f).get("assets", {}))
    if args.phase1:
        phase1(args.phase1)
    if args.phase2:
        phase2(args.phase2)
    if args.phase3:
        phase3(args.phase3)
    if args.phase4:
        phase4(args.phase4)
    if args.phase5:
        phase5(args.phase5)
    if args.interior:
        interior_props()
    redrawn = os.path.join(OUT, "redrawn", "redrawn.json")
    if os.path.exists(redrawn):  # sprites imported by tools/import_redrawn.py win over derived ones
        manifest["assets"].update(json.load(open(redrawn)))
    ensure(OUT)
    manifest["assets"] = dict(sorted(manifest["assets"].items()))
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"wrote {len(manifest['assets'])} assets to {rel(mpath)}")



# ---------------------------------------------------------------- phase 4 (derived)

def components(im, min_area):
    """Bounding boxes of opaque connected components larger than min_area."""
    a = np.asarray(im)[..., 3] > 0
    h, w = a.shape
    seen = np.zeros((h, w), bool)
    boxes = []
    for y in range(h):
        for x in range(w):
            if a[y, x] and not seen[y, x]:
                q = deque([(x, y)])
                seen[y, x] = True
                x0 = x1 = x
                y0 = y1 = y
                n = 0
                while q:
                    cx, cy = q.popleft()
                    n += 1
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and a[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((nx, ny))
                if n >= min_area:
                    boxes.append((x0, y0, x1 + 1, y1 + 1, n))
    return boxes


def enlarge(sp, k):
    """Lanczos enlargement followed by an unsharp mask that restores edge
    contrast lost in the upscale (RGB only; alpha is kept as resampled)."""
    big = sp.resize((sp.size[0] * k, sp.size[1] * k), Image.LANCZOS)
    rgb = big.convert("RGB").filter(ImageFilter.UnsharpMask(radius=0.9 * k, percent=130, threshold=2))
    out = rgb.convert("RGBA")
    out.putalpha(big.getchannel("A"))
    return out


def segment_panel(path, top, min_area, tol=48, upscale=1):
    """Key out a reference panel's cream background below `top` and return
    the large objects left-to-right (top-to-bottom within a row)."""
    img = Image.open(path).convert("RGB")
    body = img.crop((0, top, img.size[0], img.size[1]))
    w, h = body.size
    keyed = key_background(body, border_seeds(w, h, 2), tol)
    boxes = components(keyed, min_area)
    boxes.sort(key=lambda b: (round(b[1] / 40), b[0]))
    out = []
    for x0, y0, x1, y1, _ in boxes:
        sprite = keyed.crop((x0, y0, x1, y1))
        sprite = largest_component(sprite)
        if upscale != 1:
            sprite = enlarge(sprite, upscale)
        out.append(sprite)
    return out


def level_columns(path, top):
    """Split an upgrade panel into its level columns using the light 2-3px
    separators between the "Level N" label cells, then isolate the largest
    object in each column."""
    img = Image.open(path).convert("RGB")
    a = np.asarray(img).astype(int)
    band = a[28:44]
    lum = band.mean(axis=(0, 2))
    cand = [x for x in range(5, a.shape[1] - 5) if lum[x] > lum.mean() + 12]
    groups = []
    for x in cand:
        if groups and x - groups[-1][-1] <= 2:
            groups[-1].append(x)
        else:
            groups.append([x])
    cuts = [0] + [(g[0] + g[-1]) // 2 for g in groups if len(g) >= 2] + [img.size[0]]
    out = []
    for x0, x1 in zip(cuts, cuts[1:]):
        col = img.crop((x0 + 2, top, x1 - 2, img.size[1]))
        w, h = col.size
        keyed = key_background(col, border_seeds(w, h, 2), 48)
        out.append(trim(largest_component(keyed), 1))
    return out


P4_NOTE = ("TEMPORARY: isolated from a Phase 4 reference panel (low resolution, keyed background). "
           "Replace with a properly exported production sprite.")

P4_BUILDINGS = {
    "house": "house_player_home_levels_1_to_3.png",
    "well": "well_levels_1_to_3.png",
    "tool_shed": "tool_shed_workshop_levels_1_to_3.png",
    "market_stall": "market_stall_levels_1_to_3.png",
    "storage_shed": "storage_shed_levels_1_to_3.png",
    "chicken_coop": "chicken_coop_levels_1_to_3.png",
    "barn": "barn_livestock_levels_1_to_3.png",
}


def phase4(root, preview_dir=None):
    d = ensure(os.path.join(OUT, "derived", "phase4"))
    src = os.path.join(root, "01_building_upgrades")
    for name, fn in P4_BUILDINGS.items():
        sprites = [enlarge(sp, 2) for sp in level_columns(os.path.join(src, fn), 46)]
        if len(sprites) != 3:
            raise SystemExit(f"{fn}: expected 3 building levels, found {len(sprites)}")
        for lvl, sp in enumerate(sprites, 1):
            dst = os.path.join(d, f"{name}_l{lvl}.png")
            sp.save(dst, optimize=True)
            register(f"building4.{name}_l{lvl}", dst, f"phase4/01_building_upgrades/{fn}",
                     "temporary-reference-derived", notes=P4_NOTE + " Upscaled 2x (Lanczos + unsharp).")
    # construction stages: one merged strip -> split at the 4 emptiest columns
    strip = segment_panel(os.path.join(root, "02_construction_stages", "barn_construction_stages.png"), 50, 3000, upscale=2)[0]
    alpha = (np.asarray(strip)[..., 3] > 0).sum(0)
    w = strip.size[0]
    cuts = [0]
    for k in range(1, 5):
        lo, hi = int(w * (k / 5 - 0.06)), int(w * (k / 5 + 0.06))
        cuts.append(lo + int(np.argmin(alpha[lo:hi])))
    cuts.append(w)
    for i, (x0, x1) in enumerate(zip(cuts, cuts[1:]), 1):
        sp = trim(largest_component(strip.crop((x0, 0, x1, strip.size[1]))), 1)
        dst = os.path.join(d, f"construction_stage{i}.png")
        sp.save(dst, optimize=True)
        register(f"building4.construction_stage{i}", dst, "phase4/02_construction_stages/barn_construction_stages.png",
                 "temporary-reference-derived", notes=P4_NOTE + " Upscaled 2x (Lanczos + unsharp).")
    # decorative props: the panel's objects merge into groups, so named
    # sub-rectangles are cut from the (2x) groups and re-isolated
    groups = segment_panel(os.path.join(root, "05_decorations_and_props", "decorations_props.png"), 46, 500, upscale=2)
    picks = {
        "scarecrow": (3, (0, 0, 130, 176)),
        "bench": (3, (0, 200, 130, 292)),
        "hay_bales": (1, (0, 0, 202, 115)),
        "trough": (1, (0, 120, 202, 212)),
        "flower_crate": (2, (0, 0, 116, 122)),
        "berry_crate": (2, (116, 0, 232, 122)),
        "lantern_post": (4, (88, 0, 180, 128)),
    }
    for name, (gi, box) in picks.items():
        sp = trim(largest_component(groups[gi].crop(box)), 1)
        dst = os.path.join(d, f"prop_{name}.png")
        sp.save(dst, optimize=True)
        register(f"prop.{name}", dst, "phase4/05_decorations_and_props/decorations_props.png",
                 "temporary-reference-derived", notes=P4_NOTE + " Upscaled 2x (Lanczos + unsharp).")
    interiors = segment_panel(os.path.join(root, "03_building_interiors", "top_down_building_interiors.png"), 48, 4000, upscale=3)
    for i, name in enumerate(["house", "tool_shed", "barn", "coop"][: len(interiors)]):
        dst = os.path.join(d, f"interior_{name}.png")
        interiors[i].save(dst, optimize=True)
        register(f"interior.{name}", dst, "phase4/03_building_interiors/top_down_building_interiors.png",
                 "temporary-reference-derived", notes=P4_NOTE + " Upscaled 3x (Lanczos + unsharp) — still soft; needs a real export.")



# ---------------------------------------------------------------- phase 5 (derived)

P5_NOTE = ("TEMPORARY: cut from a Phase 5 reference panel (animals ~40 px tall, enlarged 3x). "
           "Replace with production sprites.")
P5_ROWS = {"chicken": (30, 96), "cow": (97, 181), "sheep": (190, 259), "pig": (262, 343),
           "duck": (350, 426), "horse": (428, 546)}


def cream_keyed(img, top, tol=34):
    """Key out the warm cream card/panel background of a reference panel. Seeds
    are low-variance cream pixels on a coarse grid, so white sprites (chicken,
    sheep) are not mistaken for background."""
    a = np.asarray(img).astype(int)
    h, w, _ = a.shape
    seeds = []
    for y in range(top + 2, h - 3, 5):
        for x in range(3, w - 3, 5):
            p = a[y - 2:y + 3, x - 2:x + 3].reshape(-1, 3)
            r_, g_, b_ = p.mean(0)
            if r_ > 205 and g_ > 185 and b_ > 140 and 22 <= r_ - b_ <= 75 and p.std(0).max() < 5:
                seeds.append((x, y - top))
    return key_background(img.crop((0, top, w, h)), seeds, tol)


def sprite_boxes(keyed, min_area, min_h, max_w, x_min=0):
    boxes = [b for b in components(keyed, min_area)
             if (b[3] - b[1]) >= min_h and (b[2] - b[0]) <= max_w and b[0] >= x_min]
    boxes.sort(key=lambda b: (round(b[1] / 30), b[0]))
    return boxes


def phase5(root):
    d = ensure(os.path.join(OUT, "derived", "phase5"))
    # animals: per row, 5 frames facing the camera then 4 facing away
    panel = Image.open(os.path.join(root, "01_animal_idle_and_movement", "animal_idle_movement_reference.png")).convert("RGB")
    top = 28
    keyed = cream_keyed(panel, top)
    boxes = sprite_boxes(keyed, 500, 28, 60, x_min=50)
    for name, (y0, y1) in P5_ROWS.items():
        row = sorted([b for b in boxes if y0 - top <= b[1] + (b[3] - b[1]) // 2 <= y1 - top], key=lambda b: b[0])
        if len(row) != 9:
            raise SystemExit(f"{name}: expected 9 frames, found {len(row)}")
        for i, (x0, y0_, x1, y1_, _) in enumerate(row):
            sp = trim(largest_component(keyed.crop((x0 - 1, y0_ - 1, x1 + 1, y1_ + 1))), 1)
            sp = enlarge(sp, 3)
            tag = f"d{i}" if i < 5 else f"u{i - 5}"
            dst = os.path.join(d, f"{name}_{tag}.png")
            sp.save(dst, optimize=True)
            register(f"animal.{name}_{tag}", dst, "phase5/01_animal_idle_and_movement/animal_idle_movement_reference.png",
                     "temporary-reference-derived", notes=P5_NOTE + (" Faces the camera." if i < 5 else " Faces away from the camera."))
    # products and feed icons (largest object in each card)
    def icons(fn, top_, names, key_prefix, src):
        pn = Image.open(os.path.join(root, fn)).convert("RGB")
        k = cream_keyed(pn, top_)
        bx = sprite_boxes(k, 350, 18, 80, x_min=0)
        bx.sort(key=lambda b: b[0])
        if len(bx) < len(names):
            raise SystemExit(f"{fn}: expected {len(names)} icons, found {len(bx)}")
        for name, (x0, y0_, x1, y1_, _) in zip(names, bx):
            sp = trim(largest_component(k.crop((x0 - 1, y0_ - 1, x1 + 1, y1_ + 1))), 1)
            sp = enlarge(sp, 3)
            dst = os.path.join(d, f"{key_prefix}_{name}.png")
            sp.save(dst, optimize=True)
            register(f"icon.{key_prefix}_{name}", dst, src, "temporary-reference-derived", notes=P5_NOTE)
    icons("05_animal_products/animal_products_items.png", 30,
          ["egg", "milk", "wool", "pork", "duck_egg", "feather", "leather", "manure"], "product",
          "phase5/05_animal_products/animal_products_items.png")
    icons("06_animal_food_and_supplies/animal_food_supplies.png", 30,
          ["chicken", "cattle", "hay", "pig", "salt", "trough"], "feed",
          "phase5/06_animal_food_and_supplies/animal_food_supplies.png")



# ---------------------------------------------------------------- interior props

# Crisp Phase 1/2 props reused indoors. Their painted grass bases are removed
# (pure keying of green pixels; no resampling) so they sit on a wooden floor.
INTERIOR_PROPS = {
    "barrel": "assets/phase2/terrain/barrel.png",
    "crate": "assets/phase2/terrain/wooden_crate.png",
    "water_barrel": "assets/phase1/buildings/water_barrel.png",
    "workbench": "assets/phase1/buildings/workbench.png",
}


def degrass(im):
    a = np.asarray(im.convert("RGBA")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # green and yellow-green grass (wood and iron are red-dominant or grey)
    green = ((g > r + 8) & (g > b + 12)) | ((g >= r - 10) & (g > b + 28))
    # pale sand and pebbles painted around the base (bottom band only, so
    # light wood higher up is untouched)
    lum = (r * 3 + g * 6 + b) / 10
    base = np.zeros_like(green)
    base[int(a.shape[0] * 0.8):] = True
    sand = base & (lum > 130) & (g > r - 45) & (r - b > 20) & (g > 105)
    out = a.copy()
    out[..., 3] = np.where(green | sand, 0, a[..., 3])
    return trim(largest_component(Image.fromarray(out.astype(np.uint8), "RGBA")), 2)


def interior_props():
    root = os.path.dirname(OUT)
    d = ensure(os.path.join(OUT, "derived", "interior"))
    for name, src in INTERIOR_PROPS.items():
        sp = degrass(Image.open(os.path.join(root, src)))
        dst = os.path.join(d, f"{name}.png")
        sp.save(dst, optimize=True)
        register(f"interior_prop.{name}", dst, src, "approved",
                 notes="Crisp Phase 1/2 sprite at native resolution with its outdoor grass base keyed out (no resampling).")


if __name__ == "__main__":
    sys.exit(main())
