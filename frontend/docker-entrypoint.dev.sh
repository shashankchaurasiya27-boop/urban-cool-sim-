#!/bin/sh
set -eu

LOCK_HASH="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
SENTINEL="node_modules/.urbancoolsim-package-lock-hash"

if [ ! -f "$SENTINEL" ] || [ "$(cat "$SENTINEL")" != "$LOCK_HASH" ]; then
  echo "[UrbanCoolSim] Installing frontend dependencies from package-lock.json..."
  npm ci
  printf '%s' "$LOCK_HASH" > "$SENTINEL"
else
  echo "[UrbanCoolSim] package-lock.json unchanged; reusing installed dependencies."
fi

exec npm run dev -- --hostname 0.0.0.0
