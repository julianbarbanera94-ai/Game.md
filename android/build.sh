#!/usr/bin/env bash
# Builds ParkPals.apk from ../index.html without needing the Android SDK:
# Apktool (bundles aapt2 + smali) packages app/, uber-apk-signer zipaligns and signs it.
set -euo pipefail
cd "$(dirname "$0")"
TOOLS=.tools
mkdir -p "$TOOLS"
[ -f "$TOOLS/apktool.jar" ] || curl -fsSL -o "$TOOLS/apktool.jar" https://github.com/iBotPeaches/Apktool/releases/download/v2.12.1/apktool_2.12.1.jar
[ -f "$TOOLS/signer.jar" ]  || curl -fsSL -o "$TOOLS/signer.jar"  https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar

rm -rf build && mkdir -p build
cp -r app build/src
mkdir -p build/src/assets && cp ../index.html build/src/assets/index.html
java -jar "$TOOLS/apktool.jar" b build/src -o build/unsigned.apk
java -jar "$TOOLS/signer.jar" -a build/unsigned.apk -o build/signed
cp build/signed/*.apk ../ParkPals.apk
echo "Built $(cd .. && pwd)/ParkPals.apk"
