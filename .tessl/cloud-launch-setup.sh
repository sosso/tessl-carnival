#!/usr/bin/env bash
# Runs from the clone root on the Tessl cloud machine before each agent run.
# The machine already has Node 24, which package.json accepts, so the steps
# are installing dependencies and Chrome. It's safe to run more than once.
set -eo pipefail

echo "Installing dependencies with npm ci"
npm ci

# Screenshots are a nice extra, so a failed install warns and never stops a run.
echo "Installing Google Chrome for screenshots"
if command -v google-chrome >/dev/null; then
  echo "Google Chrome is already installed"
elif curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
  && sudo apt-get install -y /tmp/chrome.deb; then
  echo "Installed $(google-chrome --version)"
else
  echo "WARNING: could not install Google Chrome, so this run has no screenshots"
fi
