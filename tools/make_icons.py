#!/usr/bin/env python3
"""Cut the app's icons and title art from launch/ (made by tools/make_branding.mjs).

    python3 tools/make_icons.py

Writes the Android launcher icons (square-rounded and round, mdpi..xxxhdpi),
the Play Store icon (512, square: the store applies its own mask), web icons,
and the smaller logo / loading backdrop the game itself shows.
"""
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAUNCH = os.path.join(ROOT, "launch")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
BRAND = os.path.join(ROOT, "assets", "brand")
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def framed(src, size, round_=False):
    """Icon with a soft warm-wood rim, rounded square or circle, drawn at 4x then reduced."""
    big = size * 4
    art = src.resize((big, big), Image.LANCZOS)
    mask = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(mask)
    inset = int(big * 0.03)
    box = (inset, inset, big - inset, big - inset)
    if round_:
        d.ellipse(box, fill=255)
    else:
        d.rounded_rectangle(box, radius=int(big * 0.2), fill=255)
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(art, (0, 0), mask)
    rim = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    w = max(4, big // 40)
    (rd.ellipse if round_ else lambda b, **k: rd.rounded_rectangle(b, radius=int(big * 0.2), **k))(box, outline=(92, 56, 24, 255), width=w)
    out = Image.alpha_composite(out, rim)
    return out.resize((size, size), Image.LANCZOS)


def main():
    icon = Image.open(os.path.join(LAUNCH, "icon_1024.png")).convert("RGBA")
    for dens, px in DENSITIES.items():
        d = os.path.join(RES, f"mipmap-{dens}")
        os.makedirs(d, exist_ok=True)
        framed(icon, px).save(os.path.join(d, "ic_launcher.png"), optimize=True)
        framed(icon, px, round_=True).save(os.path.join(d, "ic_launcher_round.png"), optimize=True)
    icon.resize((512, 512), Image.LANCZOS).convert("RGB").save(os.path.join(LAUNCH, "play_store_icon_512.png"), optimize=True)
    os.makedirs(BRAND, exist_ok=True)
    for px in (192,):
        framed(icon, px).save(os.path.join(BRAND, f"icon_{px}.png"), optimize=True)
    framed(icon, 64).save(os.path.join(BRAND, "favicon.png"), optimize=True)
    logo = Image.open(os.path.join(LAUNCH, "logo.png")).convert("RGBA")
    logo.resize((720, 336), Image.LANCZOS).save(os.path.join(BRAND, "logo.png"), optimize=True)
    bg = Image.open(os.path.join(LAUNCH, "title_bg.jpg")).convert("RGB")
    bg.resize((1280, 720), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3)).save(os.path.join(BRAND, "loading_bg.jpg"), quality=82, optimize=True)
    for f in sorted(os.listdir(BRAND)):
        print(f"assets/brand/{f}  {os.path.getsize(os.path.join(BRAND, f)) // 1024} KB")


if __name__ == "__main__":
    main()
