#!/usr/bin/env bash
# Runs from the clone root on the Tessl cloud machine before each agent run.
# The machine already has Node 24, which package.json accepts, so the steps are
# installing dependencies, then Chrome, fonts and Playwright for screenshots.
# It's safe to run more than once.
set -eo pipefail

echo "Installing dependencies with npm ci"
npm ci

# Screenshots are a nice extra, so a failed or stalled install warns and never
# stops a run. Each step has a time limit for the same reason.
chrome_url="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
echo "Installing Google Chrome for screenshots"
if command -v google-chrome >/dev/null; then
  echo "Google Chrome is already installed"
elif curl -fsSL --connect-timeout 20 --max-time 120 -o /tmp/chrome.deb "$chrome_url" \
  && timeout -k 10 120 sudo apt-get update -q \
  && timeout -k 10 240 sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q /tmp/chrome.deb; then
  echo "Installed $(google-chrome --version)"
else
  echo "WARNING: could not install Google Chrome, so this run has no screenshots"
fi

# Without a proportional font, the page's text falls back to a monospace one.
# ffmpeg turns recorded videos into GIFs that play inside a pull request.
echo "Installing fonts and ffmpeg for screenshots"
if dpkg -s fonts-dejavu-core ffmpeg >/dev/null 2>&1; then
  echo "Fonts and ffmpeg are already installed"
elif timeout -k 10 120 sudo apt-get update -q \
  && timeout -k 10 300 sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends fonts-dejavu-core ffmpeg; then
  echo "Installed fonts and ffmpeg"
else
  echo "WARNING: could not install fonts and ffmpeg, so captures may look different and have no GIFs"
fi

# Playwright stays outside the repository, so it never becomes a dependency of
# the carnival. scripts/screenshot.mjs looks for it here.
echo "Installing Playwright for screenshots"
if timeout -k 10 120 npm install --prefix "$HOME/.local/share/carnival-capture" \
  --no-audit --no-fund --silent playwright-core@1.64.1; then
  echo "Installed playwright-core"
  # Playwright records video with its own copy of ffmpeg.
  timeout -k 10 120 node "$HOME/.local/share/carnival-capture/node_modules/playwright-core/cli.js" install ffmpeg \
    || echo "WARNING: could not install Playwright's ffmpeg, so this run has no videos"
else
  echo "WARNING: could not install Playwright, so this run has no screenshots"
fi
