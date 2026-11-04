#!/usr/bin/env python3
"""Package the browser version of Farmstead as a zip that plays offline.

    python3 tools/build_web.py        -> dist/Farmstead-web.zip

The zip holds the game (index.html, styles, src, the assets the game uses)
plus a small server (scripts/serve.mjs) and launchers. Double-clicking
index.html will not work (browsers block the game's data loading from local
files), so the launcher starts a local server and opens the game.
Needs Node.js (preferred) or Python 3, both common on Windows and macOS.
"""
import json
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dist", "Farmstead-web.zip")

BAT = """@echo off
title Farmstead
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080/
  node scripts\\serve.mjs 8080
) else (
  start "" http://localhost:8080/
  python -m http.server 8080
)
pause
"""

COMMAND = """#!/bin/sh
cd "$(dirname "$0")" || exit 1
PORT=8080
if command -v node >/dev/null 2>&1; then
  (sleep 1; open "http://localhost:$PORT/" 2>/dev/null || xdg-open "http://localhost:$PORT/" 2>/dev/null) &
  exec node scripts/serve.mjs $PORT
else
  (sleep 1; open "http://localhost:$PORT/" 2>/dev/null || xdg-open "http://localhost:$PORT/" 2>/dev/null) &
  exec python3 -m http.server $PORT
fi
"""

README = """Farmstead - play in your browser
================================

Windows:  double-click  Play Farmstead.bat
Mac:      double-click  Play Farmstead.command  (first time: right-click > Open)
Linux:    run ./Play\\ Farmstead.command in a terminal

The launcher starts a small local server on port 8080 and opens the game in
your browser. Keep the launcher window open while you play. Close it to stop.

Needs Node.js (https://nodejs.org) or Python 3. Saves are kept by the browser
for this address (http://localhost:8080), so keep using the same launcher to
continue your farm.
"""


def referenced_assets():
    """Every asset file the manifest lists, plus any named directly in the page, styles or code."""
    manifest = json.load(open(os.path.join(ROOT, "assets", "manifest.json")))
    keep = {"assets/manifest.json"}
    for v in manifest["assets"].values():
        if v.get("file"):
            keep.add(v["file"])
    named = re.compile(r"assets/[\w./-]+\.(?:png|jpg|webp|wav|ogg|mp3|json)")
    texts = ["index.html", "styles.css"]
    for d, _, fs in os.walk(os.path.join(ROOT, "src")):
        texts += [os.path.relpath(os.path.join(d, f), ROOT) for f in fs]
    for t in texts:
        keep.update(named.findall(open(os.path.join(ROOT, t)).read()))
    return sorted(keep)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    files = ["index.html", "styles.css", "scripts/serve.mjs"]
    for d, _, fs in os.walk(os.path.join(ROOT, "src")):
        files += [os.path.relpath(os.path.join(d, f), ROOT) for f in fs]
    files += referenced_assets()
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        seen = set()
        for f in files:
            f = f.replace(os.sep, "/")
            if f in seen or not os.path.exists(os.path.join(ROOT, f)):
                continue
            seen.add(f)
            z.write(os.path.join(ROOT, f), f)
        for name, text in (("Play Farmstead.bat", BAT), ("Play Farmstead.command", COMMAND), ("README.txt", README)):
            info = zipfile.ZipInfo(name)
            info.external_attr = (0o755 if name.endswith(".command") else 0o644) << 16  # launchers run on double-click
            z.writestr(info, text.replace("\r\n", "\n"))
    print(OUT, os.path.getsize(OUT) // 1024 // 1024, "MB", len(seen), "game files")


if __name__ == "__main__":
    main()
