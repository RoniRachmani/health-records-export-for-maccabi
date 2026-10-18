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

# The container's Chromium is Playwright's, at a path `scripts/stage.mjs` doesn't look in, and the
# container runs as root, where Chromium won't start without --no-sandbox. A wrapper outside the
# checkout adds the flag, and CHROME_PATH points the renders and `site-check` at it.
if [ -x /opt/pw-browsers/chromium ] && [ -z "${CHROME_PATH:-}" ]; then
  wrapper="$HOME/.local/bin/chromium-nosandbox"
  mkdir -p "$(dirname "$wrapper")"
  printf '#!/bin/sh\nexec /opt/pw-browsers/chromium --no-sandbox "$@"\n' > "$wrapper"
  chmod +x "$wrapper"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export CHROME_PATH=\"$wrapper\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

npm install --no-audit --no-fund --no-save