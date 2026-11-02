#!/usr/bin/env bash
# Builds the carnival and saves a PNG of the midway and of every game.
# Usage: scripts/screenshot.sh <output folder>
set -eo pipefail

out="${1:?Give an output folder}"
chrome="${CHROME:-$(command -v google-chrome || true)}"
if [ -z "$chrome" ]; then
  echo "No browser found: google-chrome is not installed" >&2
  exit 1
fi

port="${SCREENSHOT_PORT:-5199}"
work="$(mktemp -d)"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

npx vite build --outDir "$work/site" --emptyOutDir --base / --logLevel warn

python3 -m http.server "$port" --directory "$work/site" >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -rf "$work"' EXIT
sleep 2

shoot() {
  "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --user-data-dir="$work/profile" --window-size=1280,800 \
    --virtual-time-budget=4000 --screenshot="$out/$1.png" \
    "http://localhost:$port/$2" >/dev/null 2>&1
  [ -s "$out/$1.png" ] || { echo "No screenshot for $1" >&2; exit 1; }
  echo "$out/$1.png"
}

shoot midway ""
for game in src/games/*/; do
  id="$(basename "$game")"
  shoot "$id" "#/play/$id"
done
