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
if ! command -v timeout >/dev/null; then
  echo "The timeout command is missing, so capture can't be bounded" >&2
  exit 1
fi

port="${SCREENSHOT_PORT:-5199}"
work="$(mktemp -d)"
trap 'kill "${server:-}" 2>/dev/null || true; rm -rf "$work"' EXIT
mkdir -p "$out"
out="$(cd "$out" && pwd)"

npx vite build --outDir "$work/site" --emptyOutDir --base / --logLevel warn

# Another service could already hold the port, so prove this build answers it.
token="$RANDOM$RANDOM$RANDOM"
printf '%s' "$token" >"$work/site/screenshot-check.txt"
python3 -m http.server "$port" --directory "$work/site" >/dev/null 2>&1 &
server=$!
ready=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  answer="$(curl -fsS --max-time 2 "http://localhost:$port/screenshot-check.txt" 2>/dev/null || true)"
  if [ "$answer" = "$token" ]; then
    ready=yes
    break
  fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "Port $port isn't serving this build: set SCREENSHOT_PORT to a free port" >&2
  exit 1
fi

shoot() {
  rm -f "$out/$1.png"
  if ! timeout -k 5 60 "$chrome" --headless=new --no-sandbox --disable-gpu \
    --hide-scrollbars --user-data-dir="$work/profile" --window-size=1280,800 \
    --virtual-time-budget=4000 --screenshot="$out/$1.png" \
    "http://localhost:$port/$2" >/dev/null 2>&1; then
    echo "The browser failed or timed out on $1" >&2
    exit 1
  fi
  [ -s "$out/$1.png" ] || { echo "No screenshot for $1" >&2; exit 1; }
  echo "$out/$1.png"
}

shoot midway ""
for game in src/games/*/; do
  id="$(basename "$game")"
  shoot "$id" "#/play/$id"
done
