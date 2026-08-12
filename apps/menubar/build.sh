#!/usr/bin/env bash
# Build mxbar and wrap the release binary into a menubar-only mxbar.app bundle.
# Requires the Swift toolchain (Xcode or the Command Line Tools) and macOS 13+.
set -euo pipefail
cd "$(dirname "$0")"

echo "Building (release)…"
swift build -c release

APP="build/mxbar.app"
BIN="$(swift build -c release --show-bin-path)/mxbar"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/mxbar"
cp Info.plist "$APP/Contents/Info.plist"

# Ad-hoc code signature so Gatekeeper lets you launch it locally.
codesign --force --sign - "$APP" >/dev/null 2>&1 || true

echo
echo "Built $APP"
echo "Launch it:      open \"$APP\""
echo "Install it:     cp -R \"$APP\" /Applications/ && open /Applications/mxbar.app"
echo "Login item:     System Settings ▸ General ▸ Login Items ▸ +  (add mxbar.app)"
