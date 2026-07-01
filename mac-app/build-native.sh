#!/bin/bash
# Build & install "Singing Studio.app" — a standalone native macOS app (WKWebView,
# no Chrome/Electron) that runs the local server and shows the studio in its own
# window. Requires macOS with Xcode command-line tools (swiftc). Search/analysis
# still need python3 + yt-dlp (and the project .venv for Demucs).
#
# Usage:  ./mac-app/build-native.sh

set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"                 # project root: server.py, web/, services/, pitch/
APP="/Applications/Singing Studio.app"

echo "Building app icon..."
ICONSET="$(mktemp -d)/SS.iconset"
mkdir -p "$ICONSET"
for spec in "16 16x16" "32 16x16@2x" "32 32x32" "64 32x32@2x" \
            "128 128x128" "256 128x128@2x" "256 256x256" "512 256x256@2x" \
            "512 512x512"; do
  set -- $spec
  sips -z "$1" "$1" "$HERE/icon-1024.png" --out "$ICONSET/icon_$2.png" >/dev/null
done
cp "$HERE/icon-1024.png" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$HERE/app.icns"

echo "Compiling native shell (swiftc)..."
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app"
swiftc -O -o "$APP/Contents/MacOS/SingingStudio" \
  "$HERE/Sources/main.swift" \
  -framework Cocoa -framework WebKit

echo "Bundling app payload..."
cp "$SRC/server.py"  "$APP/Contents/Resources/app/server.py"
cp -R "$SRC/web"      "$APP/Contents/Resources/app/web"
cp -R "$SRC/services" "$APP/Contents/Resources/app/services"
cp -R "$SRC/pitch"    "$APP/Contents/Resources/app/pitch"
rm -rf "$APP/Contents/Resources/app"/*/__pycache__
# Remember where the project .venv lives (for yt-dlp / Demucs) — read at runtime.
printf '%s' "$SRC" > "$APP/Contents/Resources/app/source_dir.txt"
cp "$HERE/app.icns"  "$APP/Contents/Resources/app.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Singing Studio</string>
  <key>CFBundleDisplayName</key><string>Singing Studio</string>
  <key>CFBundleIdentifier</key><string>com.jeffmli.singingstudio</string>
  <key>CFBundleVersion</key><string>2.0</string>
  <key>CFBundleShortVersionString</key><string>2.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>SingingStudio</string>
  <key>CFBundleIconFile</key><string>app</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key>
  <string>Singing Studio uses your microphone to record takes and give live pitch feedback.</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
  </dict>
</dict>
</plist>
PLIST

# Ad-hoc sign so the mic (TCC) permission attaches to a stable identity.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || \
  echo "  (codesign skipped — app still runs; mic prompt will appear on first use)"
touch "$APP"

echo "Done. Launch it from Applications, Spotlight, or:"
echo "  open \"$APP\""
