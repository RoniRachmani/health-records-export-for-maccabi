#!/bin/bash
# Cloud sessions only: make `npm test`, `npm run typecheck` and the store renders work.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Roboto on the machine, so `store-assets` and `store-video` draw the popup in the face it asks
# for first. This installs the font for the headless Chrome here; the extension never ships one.
if ! fc-list | grep -qi roboto; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends fonts-roboto >/dev/null
  fc-cache -f >/dev/null
fi

npm install --no-audit --no-fund --no-save