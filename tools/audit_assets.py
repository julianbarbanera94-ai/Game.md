#!/usr/bin/env python3
"""Farmstead asset resolution & sharpness audit.

Inspects every raster image in the extracted phase packs (and the game's own
runtime manifest) and writes docs/audit/asset_audit.csv plus a JSON summary used
to build docs/audit/ASSET_AUDIT.md.

Per image it records: dimensions, alpha/transparent background, kind (sprite,
frame, tile, board, mock-up...), the sizes of the objects inside it, an
*effective resolution* estimate and a verdict against what the game needs.

Effective resolution: an image that has been enlarged or is blurry can be
shrunk by a factor f and enlarged back with almost no change. The largest such
f (from 1, 1.25, 1.5, 2, 2.5, 3, 4) divides the nominal size to give the
effective (real-detail) size.

Required size: what the asset covers on screen at the closest normal zoom.
The world is drawn at 64 px per tile; at the closest standard zoom (desktop
retina, ~2.1 device px per world px; phones are ~1.7) an object N world px
long needs about 2.1 x N source pixels.

Usage:
    python3 -I tools/audit_assets.py <dir-with-p1..p10> [--out docs/audit]
"""
import argparse
import csv
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_assets import components, cream_keyed  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZOOM = 2.1  # device px per world px at the closest standard zoom
TILE = 64

# What each kind of object is in the game: (world px on its longest edge, label)
NEED = {
    "icon": (62, "HUD/shop icon (~62 css px, x2.1 for dense screens)"),
    "character": (84 * 320 / 268, "player/NPC frame (84 world px body in a 320 frame)"),
    "animal": (78, "animal (40-78 world px tall)"),
    "crop": (62, "crop/soil plot (1 tile)"),
    "tile": (TILE, "terrain tile (1 tile)"),
    "texture": (170, "ground texture stamp (170 world px)"),
    "prop": (100, "small prop / decoration (0.7-1.6 tiles)"),
    "tree": (200, "tree (2.4-3.2 tiles)"),
    "building": (340, "building (3-6.4 tiles)"),
    "interior": (576, "interior room (9 tiles wide)"),
    "vehicle": (200, "vehicle (2-4 tiles)"),
    "effect": (48, "effect frame (~0.75 tile)"),
    "ui": (None, "UI mock-up (HUD is built in HTML/CSS)"),
    "mockup": (None, "review sheet / mock-up"),
}

FACTORS = [1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0]
ERR_THRESHOLD = 2.2  # mean abs error (0-255) at which detail is considered lost


def effective_factor(im):
    """Largest factor the image can be shrunk by and restored without visible loss."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    if max(w, h) > 1200:  # keep it fast; factor is resolution-independent enough
        s = 1200 / max(w, h)
        rgba = rgba.resize((max(8, int(w * s)), max(8, int(h * s))), Image.LANCZOS)
        w, h = rgba.size
    a = np.asarray(rgba).astype(np.float32)
    mask = a[..., 3] > 200
    if mask.sum() < 64:
        return 1.0, 0.0
    rgb = rgba.convert("RGB")
    base = a[..., :3]
    best = 1.0
    errs = {}
    for f in FACTORS[1:]:
        sw, sh = max(4, round(w / f)), max(4, round(h / f))
        back = rgb.resize((sw, sh), Image.LANCZOS).resize((w, h), Image.LANCZOS)
        err = float(np.abs(np.asarray(back).astype(np.float32) - base)[mask].mean())
        errs[f] = err
        if err <= ERR_THRESHOLD:
            best = f
        else:
            break
    # Laplacian-based sharpness for information
    lum = (base[..., 0] * 0.3 + base[..., 1] * 0.59 + base[..., 2] * 0.11)
    lap = (np.roll(lum, 1, 0) + np.roll(lum, -1, 0) + np.roll(lum, 1, 1) + np.roll(lum, -1, 1) - 4 * lum)
    sharp = float(lap[mask].var()) if mask.any() else 0.0
    return best, sharp


def classify(phase, rel):
    """(kind, category, note) from the file's location and name."""
    p = rel.lower()
    name = os.path.basename(p)
    if name.endswith(".jpg") and ("review" in name or "overview" in name):
        return "mock-up", "mockup", "Pack review/overview sheet"
    if "preview" in p:
        return "mock-up", "mockup", "Pack preview"
    if "master_reference" in name or "reference_board" in name or "approved_starting_area" in name:
        return "reference board", "mockup", "Whole-sheet art-direction reference"
    if phase == 1:
        if "reference_sheets/" in p:
            return "source sheet", "mockup", "Generated source sheet the v2 sprites were cut from"
        if "/01_terrain/tiles/" in p:
            return "tile (v1 vector)", "tile", "Flat vector style - rejected for art direction"
        if "/reference_tiles/" in p:
            cat = "tree" if "tree" in name else "texture" if any(k in name for k in ("grass", "dirt", "sand", "water", "cobble", "tilled", "shore")) else "prop"
            return "tile vignette", cat, "Illustrated tile with ragged edges (not seamless)"
        if "/foliage/" in p:
            return "sprite", "tree" if "tree" in name else "prop", ""
        if "/rocks_and_decor/" in p:
            return "sprite (v1 vector)", "prop", "Flat vector style - rejected"
        if "/03_buildings/" in p:
            small = ("mailbox", "signpost", "water_barrel", "workbench", "fence_segment")
            return "sprite", "prop" if any(k in name for k in small) else "building", ""
        if "/reference_sheet/" in p:
            return "character frame (v2)", "character", "Variable canvas per pose"
        if "/04_characters/" in p:
            return "character frame (v1 vector)", "character", "Flat vector style - rejected"
        if "/05_animals/" in p:
            return "animal frame (v1 vector)", "animal", "Flat vector style - rejected"
        if "/06_crops/" in p:
            return "crop frame (v1 vector)", "crop", "Flat vector style - rejected"
        if "/07_tools_and_items/" in p or "/08_ui/icons/" in p:
            return "icon (v1 vector)", "icon", "Flat vector style - rejected"
        if "/08_ui/" in p:
            return "UI element (v1 vector)", "ui", "Flat vector style; HUD is HTML/CSS"
        if "/09_effects/" in p:
            return "effect frame (v1 vector)", "effect", "Flat vector style"
        if "atlases/" in p:
            return "atlas (v1 vector)", "character" if "player" in name else "animal" if any(k in name for k in ("cow", "sheep", "chicken")) else "crop", "Atlas of v1 vector frames"
    if phase == 2:
        if "source_sheets/" in p:
            return "source sheet", "mockup", "Generated sheet the Phase 2 sprites were cut from"
        if "/characters/player/" in p:
            return "character frame", "character", "Uniform 320x320 canvas"
        if "/terrain/tiles/" in p:
            cat = "tree" if "tree" in name else "texture" if any(k in name for k in ("grass", "dirt", "sand", "water", "cobble", "tilled", "shore", "path")) else "prop"
            return "tile vignette / prop", cat, ""
    # Phases 3-10 are reference boards; pick the category of the objects in them
    board = [
        ("vehicle_interaction", "ui"), ("interaction_overlays", "ui"),
        ("vehicles", "vehicle"), ("tractor", "vehicle"), ("harvester", "vehicle"), ("mower", "vehicle"),
        ("planter", "vehicle"), ("sprayer", "vehicle"), ("plough", "vehicle"), ("trailer", "vehicle"),
        ("wheelbarrow", "vehicle"), ("utility_vehicles", "vehicle"),
        ("barn_livestock", "building"), ("animal_buildings", "building"), ("coop_barn", "building"),
        ("animal_decorations", "prop"), ("livestock_fences", "prop"), ("feeding_collecting", "character"),
        ("polished_hud", "ui"), ("polished_screens", "mockup"), ("animals_livestock_reference", "ui"),
        ("village_npc_reference", "ui"), ("vehicles_machinery_reference", "ui"), ("building_expansion_reference", "ui"),
        ("village_map", "mockup"),
        ("interior", "interior"), ("crop_growth", "crop"), ("soil", "crop"), ("crop_health", "crop"),
        ("seed", "icon"), ("produce", "icon"), ("products", "icon"), ("food", "icon"), ("economy_items", "icon"),
        ("quest_icons", "icon"), ("rewards", "icon"), ("farming_tools", "icon"), ("interaction_overlays", "ui"),
        ("animal", "animal"), ("livestock", "prop"), ("pasture", "texture"), ("fences", "prop"),
        ("decorations", "prop"), ("building", "building"), ("coop", "building"), ("barn", "building"),
        ("stall", "building"), ("shed", "building"), ("well", "building"), ("house", "building"),
        ("construction", "building"), ("terrain", "texture"), ("world_location", "texture"), ("village_map", "texture"),
        ("roads", "texture"), ("field", "texture"), ("tractor", "vehicle"), ("harvester", "vehicle"),
        ("mower", "vehicle"), ("planter", "vehicle"), ("sprayer", "vehicle"), ("plough", "vehicle"),
        ("trailer", "vehicle"), ("vehicles", "vehicle"), ("wheelbarrow", "vehicle"), ("fuel", "prop"),
        ("npc", "character"), ("player_farming", "character"), ("character_animation", "character"),
        ("environment_extras", "prop"), ("environment_animation", "texture"), ("visual_effects", "effect"),
    ]
    for key, cat in board:
        if key in name or key in p:
            return "reference board", cat, "Reference panel with labels/background - objects must be separated"
    return "reference board", "ui", "UI / flow reference (HUD is HTML/CSS)"


def objects(im, kind):
    """Sizes of the objects inside an image (in its own pixels)."""
    rgba = im.convert("RGBA")
    a = np.asarray(rgba)
    if a[..., 3].min() < 255 and kind not in ("reference board", "source sheet", "mock-up"):
        bb = rgba.getchannel("A").getbbox()
        if not bb:
            return []
        return [(bb[2] - bb[0], bb[3] - bb[1])]
    # opaque boards: key the cream background, measure components at half size
    img = rgba.convert("RGB")
    scale = 1
    if max(img.size) > 700:
        scale = 2
        img = img.resize((img.size[0] // 2, img.size[1] // 2), Image.LANCZOS)
    keyed = cream_keyed(img, 0)
    out = []
    for x0, y0, x1, y1, n in components(keyed, 120):
        w, h = (x1 - x0) * scale, (y1 - y0) * scale
        if w < 12 or h < 12 or w > im.size[0] * 0.8:
            continue
        out.append((w, h))
    return out


# Boards where automatic object detection is unreliable (green/patterned
# backgrounds, labels counted as objects). Native object long edges measured
# from the objects separated by tools/import_assets.py (size / enlargement).
MEASURED = {
    "crop_growth_stages_all.png": (82, "plot cells ~82x76 (crop + soil)"),
    "growth_row_reference.png": (82, "plot cells ~82x76"),
    "soil_variations.png": (112, "soil cells ~112x83"),
    "crop_health_states.png": (45, "plant cells ~45 px"),
    "seed_items_all.png": (100, "seed packets ~82x100"),
    "harvested_produce_all.png": (86, "produce crates ~86 px"),
    "farming_tools.png": (84, "tools ~70-84 px"),
    "house_player_home_levels_1_to_3.png": (217, "houses 144-217 px wide"),
    "chicken_coop_levels_1_to_3.png": (211, "coops 101-211 px wide"),
    "barn_livestock_levels_1_to_3.png": (215, "barns 118-215 px wide"),
    "market_stall_levels_1_to_3.png": (163, "stalls 89-163 px wide"),
    "storage_shed_levels_1_to_3.png": (155, "sheds 105-155 px wide"),
    "tool_shed_workshop_levels_1_to_3.png": (170, "workshops 105-170 px wide"),
    "well_levels_1_to_3.png": (142, "wells 83-142 px"),
    "barn_construction_stages.png": (145, "stages ~104-145 px"),
    "top_down_building_interiors.png": (171, "rooms 119-171 px wide"),
    "decorations_props.png": (90, "props ~40-90 px"),
    "animal_idle_movement_reference.png": (78, "chicken 52, sheep 61, cow 77, horse 109 px"),
    "animal_products_items.png": (64, "items ~50-64 px"),
    "animal_food_supplies.png": (68, "items ~55-68 px"),
    "environment_extras.png": (70, "objects ~40-70 px"),
}


def verdict(cat, eff_long, obj_long_eff):
    need_world, _ = NEED[cat]
    if need_world is None:
        return "n/a", None, None
    need = round(need_world * ZOOM)
    have = obj_long_eff if obj_long_eff else eff_long
    ratio = have / need if need else None
    if ratio is None:
        return "review", need, None
    if ratio >= 0.9:
        v = "pass"
    elif ratio >= 0.6:
        v = "review"
    else:
        v = "fail"
    return v, need, round(ratio, 2)


def audit_dir(base):
    rows = []
    for phase in range(1, 11):
        pdir = os.path.join(base, f"p{phase}")
        if not os.path.isdir(pdir):
            continue
        for dirpath, _, files in os.walk(pdir):
            for fn in sorted(files):
                if not fn.lower().endswith((".png", ".jpg", ".jpeg")):
                    continue
                path = os.path.join(dirpath, fn)
                rel = os.path.relpath(path, pdir).replace(os.sep, "/")
                rows.append(audit_one(phase, rel, path))
                print(f"p{phase} {rel}", file=sys.stderr)
    return rows


def audit_one(phase, rel, path):
    im = Image.open(path)
    w, h = im.size
    mode = im.mode
    rgba = im.convert("RGBA")
    alpha = np.asarray(rgba)[..., 3]
    has_alpha = bool((alpha < 255).any())
    corners = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
    transparent_bg = has_alpha and sum(int(c) == 0 for c in corners) >= 3
    kind, cat, note = classify(phase, rel)
    f, sharp = effective_factor(im)
    objs = objects(im, kind)
    longs = sorted(max(o) for o in objs) if objs else []
    med = longs[len(longs) // 2] if longs else None
    obj_eff = round(med / f) if med else None
    eff_long = round(max(w, h) / f)
    manual = next((m for k, m in MEASURED.items() if rel.endswith(k)), None)
    if manual:
        obj_eff, note = round(manual[0] / f), (note + "; " if note else "") + "measured: " + manual[1]
    elif kind == "reference board" and not objs and cat not in ("ui", "mockup"):
        obj_eff = None
    v, need, ratio = verdict(cat, eff_long, obj_eff if kind in ("reference board", "source sheet") else (round(longs[-1] / f) if longs else None))
    if kind == "reference board" and obj_eff is None and v not in ("n/a",) and cat != "mockup":
        v, ratio = "review", None
        note = (note + "; " if note else "") + "objects could not be measured automatically - checked visually"
    if kind in ("mock-up",) or cat == "mockup":
        v, need, ratio = "reference only", None, None
    if "v1 vector" in kind:
        v = "fail (style)"
    usable = {
        "pass": "usable as-is",
        "review": "usable; soft at the closest zoom - re-export larger if possible",
        "fail": "recreate at higher resolution",
        "fail (style)": "rejected: flat vector style does not match the art direction",
        "reference only": "art-direction reference, not a runtime asset",
        "n/a": "UI reference (HUD is HTML/CSS)",
    }[v]
    if kind == "reference board" and v in ("pass", "review"):
        usable = "objects are adequate but must be separated from the board (labels/background)"
    return {
        "phase": phase, "file": rel, "width": w, "height": h, "mode": mode,
        "transparent_bg": transparent_bg, "kind": kind, "category": cat,
        "objects": len(objs), "object_median_px": med, "object_max_px": longs[-1] if longs else None,
        "effective_factor": f, "effective_px": eff_long, "object_effective_px": obj_eff,
        "needed_px": need, "ratio": ratio, "sharpness": round(sharp, 1),
        "verdict": v, "action": usable, "note": note,
    }


# Indoor props: drawn width in tiles (src/data/interiors.js). The interior camera
# tops out at 1.25x CSS zoom on a 2x-DPR screen = 2.5 device px per world px.
INTERIOR_ZOOM = 2.5
INTERIOR_DRAWN = {"interior_prop.workbench": 2.5, "interior_prop.barrel": 0.8,
                  "interior_prop.water_barrel": 0.85, "interior_prop.crate": 0.95}
# Old single-image interiors: kept in the manifest as the "before" reference
# but no longer loaded by the game (the cottage is now built from layers).
NOT_LOADED_PREFIXES = ("interior.",)


def audit_runtime():
    """The game's own runtime assets (what the game actually loads)."""
    man = json.load(open(os.path.join(ROOT, "assets", "manifest.json")))["assets"]
    rows = []
    for key, e in man.items():
        if not e["file"].endswith(".png"):
            continue
        path = os.path.join(ROOT, e["file"])
        im = Image.open(path)
        w, h = im.size
        notes = e.get("notes", "")
        enlarged = 3 if "3x" in notes else 2 if "2x" in notes else 1
        f, _ = effective_factor(im)
        f = max(f, enlarged)
        group = key.split(".")[0]
        cat = {"building": "building", "building4": "building", "foliage": "tree" if "tree" in key else "prop",
               "terrain": "texture", "terrain2": "texture", "player": "character", "plot": "crop", "icon": "icon",
               "prop": "prop", "interior": "interior", "animal": "animal"}.get(group, "prop")
        if group in ("terrain", "terrain2"):
            if "tree" in key:
                cat = "tree"
            elif any(k in key for k in ("grass", "dirt", "sand", "water", "cobble", "shore", "tilled", "path", "cliff")):
                cat = "texture"
            else:
                cat = "prop"
        if key.startswith("building.") and any(k in key for k in ("mailbox", "signpost", "water_barrel", "workbench", "fence_segment", "wooden_bridge")):
            cat = "prop"
        bb = im.convert("RGBA").getchannel("A").getbbox() or (0, 0, w, h)
        long_eff = round(max(bb[2] - bb[0], bb[3] - bb[1]) / f)
        if cat == "character":
            long_eff = round(268 / f)  # body height inside the 320 frame
            need = round(84 * ZOOM)
        elif key in INTERIOR_DRAWN:
            cat = "interior prop"
            long_eff = round((bb[2] - bb[0]) / f)  # width is what is fixed when drawn
            need = round(INTERIOR_DRAWN[key] * TILE * INTERIOR_ZOOM)
        else:
            need = round(NEED[cat][0] * ZOOM)
        ratio = round(long_eff / need, 2)
        v = "pass" if ratio >= 0.9 else "review" if ratio >= 0.6 else "fail"
        rows.append({"key": key, "file": e["file"], "width": w, "height": h, "status": e["status"],
                     "enlarged": enlarged, "effective_px": long_eff, "needed_px": need, "ratio": ratio, "verdict": v,
                     "category": cat, "loaded": not key.startswith(NOT_LOADED_PREFIXES)})
    return rows


def write_tables(rows, runtime, path):
    """Every audited image as markdown tables, grouped by phase and verdict."""
    out = ["# Asset audit tables (generated)", "",
           "Generated by `tools/audit_assets.py`; see `ASSET_AUDIT.md` for standards and conclusions.",
           "Columns: size = file px; obj = median / largest object px found on a sheet; eff = effective px",
           "(detail actually present, after detecting enlargement); need = px required at the closest zoom;",
           "alpha = transparent background; sharpness = edge energy (Laplacian variance, higher = crisper;",
           "low values with eff < size mean blur or enlargement).", ""]
    order = ["pass", "review", "fail", "fail (style)", "reference only", "n/a"]
    for ph in sorted({r["phase"] for r in rows}):
        pr = [r for r in rows if r["phase"] == ph]
        counts = ", ".join(f"{v}: {sum(r['verdict'] == v for r in pr)}" for v in order if any(r["verdict"] == v for r in pr))
        out += [f"## Phase {ph} ({len(pr)} images — {counts})", ""]
        for v in order:
            vr = [r for r in pr if r["verdict"] == v]
            if not vr:
                continue
            out += [f"<details><summary><b>{v}</b> ({len(vr)})</summary>", "",
                    "| file | size | kind | category | alpha | obj | eff | need | ratio | sharpness | action | note |",
                    "|---|---|---|---|---|---|---|---|---|---|---|---|"]
            for r in vr:
                obj = f"{r['object_median_px']}/{r['object_max_px']}" if r["objects"] else ""
                out.append(f"| {r['file']} | {r['width']}x{r['height']} | {r['kind']} | {r['category']} | "
                           f"{'yes' if r['transparent_bg'] else 'no'} | {obj} | {r['object_effective_px'] or r['effective_px']} | "
                           f"{r['needed_px'] or ''} | {r['ratio'] if r['ratio'] is not None else ''} | {r['sharpness']} | {r['action']} | {r['note']} |")
            out += ["", "</details>", ""]
    out += ["## Runtime (what the game loads)", "",
            "| key | file | size | category | eff | need | ratio | verdict | loaded |", "|---|---|---|---|---|---|---|---|---|"]
    for r in sorted(runtime, key=lambda r: (order.index(r["verdict"]), r["key"])):
        out.append(f"| {r['key']} | {r['file']} | {r['width']}x{r['height']} | {r['category']} | {r['effective_px']} | "
                   f"{r['needed_px']} | {r['ratio']} | {r['verdict']} | {'yes' if r['loaded'] else 'no'} |")
    with open(path, "w") as f:
        f.write("\n".join(out) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "audit"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    rows = audit_dir(args.base)
    with open(os.path.join(args.out, "asset_audit.csv"), "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    runtime = audit_runtime()
    with open(os.path.join(args.out, "runtime_audit.csv"), "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(runtime[0].keys()))
        wr.writeheader()
        wr.writerows(runtime)
    json.dump({"packs": rows, "runtime": runtime}, open(os.path.join(args.out, "audit.json"), "w"), indent=1)
    write_tables(rows, runtime, os.path.join(args.out, "AUDIT_TABLES.md"))
    from collections import Counter
    print("packs:", Counter(r["verdict"] for r in rows))
    print("runtime:", Counter(r["verdict"] for r in runtime))


if __name__ == "__main__":
    sys.exit(main())
