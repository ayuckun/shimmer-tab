#!/usr/bin/env bash
# Records the showcase clips in a background Helium (GPU, dark theme, 1080p at 1.5×)
# and encodes each to previews/clips/<name>.mp4. Usage: scripts/record-clips.sh [clip...]
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIST=$ROOT/helium-newtab/dist
WORK=$(mktemp -d)
OUT=$ROOT/previews/clips
mkdir -p "$OUT"

/opt/helium-browser-bin/helium --headless=new --user-data-dir="$WORK/profile" --no-first-run \
    --load-extension="$DIST" --disable-extensions-except="$DIST" \
    --remote-debugging-port=9333 --window-size=1288,790 --force-device-scale-factor=1.5 \
    --hide-scrollbars --use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist --force-dark-mode \
    --blink-settings=preferredColorScheme=0,primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2 \
    about:blank >/dev/null 2>&1 &
BROWSER=$!
trap 'kill $BROWSER 2>/dev/null; rm -rf "$WORK"' EXIT
sleep 4

# first load warms the caches (icons, weather, bangs) before anything is recorded
node "$ROOT/scripts/record-clips.mjs" "$WORK/clips" "$@"

for dir in "$WORK"/clips/*/; do
    name=$(basename "$dir")
    python3 - "$dir" <<'PY'
import json, sys
d = sys.argv[1]
ts = json.load(open(f"{d}/timestamps.json"))
with open(f"{d}/list.txt", "w") as f:
    for i, t in enumerate(ts):
        f.write(f"file '{i:05d}.jpg'\nduration {max((ts[i + 1] - t) if i + 1 < len(ts) else 1 / 60, 0.001):.5f}\n")
    f.write(f"file '{len(ts) - 1:05d}.jpg'\n")
open(f"{d}/dur", "w").write(f"{ts[-1] - ts[0]:.3f}")
PY
    dur=$(cat "$dir/dur")
    ffmpeg -loglevel error -y -f concat -safe 0 -i "$dir/list.txt" \
        -vf "fps=60,fade=t=in:st=0:d=0.15,fade=t=out:st=$(python3 -c "print(max(0, $dur - 0.35))"):d=0.3,format=yuv420p" \
        -c:v libx264 -preset slow -crf 17 -profile:v high -movflags +faststart "$OUT/$name.mp4"
    echo "$name: ${dur}s → $OUT/$name.mp4"
done
