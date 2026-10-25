#!/usr/bin/env bash
# Builds everything for the Chrome Web Store into store/: screenshots of the real
# extension (dark + light), store icon, promo tiles and the upload zip.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP=$ROOT/helium-newtab
OUT=$ROOT/store
WORK=$(mktemp -d)
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

pnpm -C "$APP" build >/dev/null

shots() { # theme, extra flags...
    local theme=$1; shift
    /opt/helium-browser-bin/helium --headless=new --user-data-dir="$WORK/profile-$theme" --no-first-run \
        --load-extension="$APP/dist" --disable-extensions-except="$APP/dist" \
        --remote-debugging-port=9333 --window-size=1288,870 --hide-scrollbars \
        --use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist "$@" about:blank >/dev/null 2>&1 &
    local pid=$!
    sleep 4
    node "$ROOT/scripts/store-shots.mjs" "$OUT" "$theme"
    kill $pid; wait $pid 2>/dev/null || true
}
POINTER=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2
shots dark --force-dark-mode --blink-settings=preferredColorScheme=0,$POINTER
shots light --blink-settings=preferredColorScheme=1,$POINTER

# store icon: 96px artwork in 16px of transparent padding (store guideline)
rsvg-convert -w 100 -h 100 "$APP/icon/icon.svg" -o "$WORK/icon-100.png"
magick -size 128x128 xc:none "$WORK/icon-100.png" -gravity center -composite "$OUT/store-icon-128.png"

# promo tiles: an HTML layout rendered at exact size
for tile in small:440x280 marquee:1400x560; do
    name=${tile%%:*} size=${tile#*:}
    /opt/helium-browser-bin/helium --headless=new --user-data-dir="$WORK/promo" --no-first-run \
        --allow-file-access-from-files --hide-scrollbars --window-size="${size/x/,}" \
        --force-device-scale-factor=1 --virtual-time-budget=3000 \
        --screenshot="$OUT/promo-$name-$size.png" "file://$ROOT/store/promo.html?tile=$name" >/dev/null 2>&1
done

# upload zip
rm -f "$OUT"/shimmer-tab-*.zip
version=$(node -p "require('$APP/dist/manifest.json').version")
(cd "$APP/dist" && zip -qr "$OUT/shimmer-tab-$version.zip" .)
ls -la "$OUT"
