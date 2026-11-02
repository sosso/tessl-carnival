#!/usr/bin/env bash
# Runs from the clone root on the Tessl cloud machine before each agent run.
# The machine already has Node 24, which package.json accepts, so the steps
# are installing dependencies and Chrome. It's safe to run more than once.
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
