#!/bin/bash
# Build & install "Singing Studio.app" — a double-clickable macOS launcher for
# the Singing Practice Studio. It starts the local server and opens the studio
# in a clean Chrome app window.
#
# Usage:  ./mac-app/build.sh
# Requires macOS (sips, iconutil) and Google Chrome. Search needs python3 + yt-dlp.

set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"                 # repo root: index.html + server.py
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

echo "Assembling bundle at: $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app"
cp "$SRC/server.py"  "$APP/Contents/Resources/app/server.py"
cp -R "$SRC/web"      "$APP/Contents/Resources/app/web"        # UI layer
cp -R "$SRC/services" "$APP/Contents/Resources/app/services"   # backend integrations
cp -R "$SRC/pitch"    "$APP/Contents/Resources/app/pitch"      # model
# strip caches that may have been copied
rm -rf "$APP/Contents/Resources/app"/*/__pycache__
cp "$HERE/app.icns"  "$APP/Contents/Resources/app.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Singing Studio</string>
  <key>CFBundleDisplayName</key><string>Singing Studio</string>
  <key>CFBundleIdentifier</key><string>com.jeffmli.singingstudio</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>app</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/launch" <<'SH'
#!/bin/bash
# Make Homebrew tools (python3, yt-dlp) findable when launched from Finder.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

APP_DIR="$(cd "$(dirname "$0")/../Resources/app" && pwd)"
SOURCE_DIR="__SOURCE_DIR__"
PORT=4173
URL="http://localhost:${PORT}/"
PROFILE="$HOME/Library/Application Support/Singing Studio/chrome"
mkdir -p "$PROFILE"

PYTHON="python3"
if [ -x "$APP_DIR/.venv/bin/python" ]; then
  PYTHON="$APP_DIR/.venv/bin/python"
elif [ -x "$SOURCE_DIR/.venv/bin/python" ]; then
  PYTHON="$SOURCE_DIR/.venv/bin/python"
fi

# Start the local server if it isn't already up.
if ! curl -s "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  "$PYTHON" "$APP_DIR/server.py" >/tmp/singing-studio.log 2>&1 &
  for i in $(seq 1 50); do
    curl -s "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 && break
    sleep 0.2
  done
fi

# Open in a clean, standalone Chrome app window.
open -na "Google Chrome" --args \
  --app="$URL" \
  --user-data-dir="$PROFILE" \
  --no-first-run --no-default-browser-check
SH
perl -0pi -e "s#__SOURCE_DIR__#${SRC//\\/\\\\}#g" "$APP/Contents/MacOS/launch"
chmod +x "$APP/Contents/MacOS/launch"
touch "$APP"

echo "Done. Launch it from Applications, Spotlight, or:"
echo "  open \"$APP\""
