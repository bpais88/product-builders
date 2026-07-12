#!/usr/bin/env bash
# One-time (and after-update) bootstrap for demo-recorder.
#   usage: bash scripts/setup.sh [data-dir]
# Dependencies install into the plugin dir — Node resolves them from the script's own
# location, so nothing depends on the caller's cwd. The API key lives in the DATA dir
# instead, because the plugin dir is replaced wholesale on every plugin update.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${1:-${CLAUDE_PLUGIN_DATA:-$HOME/.demo-recorder}}"

mkdir -p "$DATA"

if [ ! -d "$ROOT/node_modules" ]; then
  echo "installing recorder deps…"
  (cd "$ROOT" && npm install --silent)
fi

if [ ! -f "$DATA/.env" ]; then
  cp "$ROOT/.env.example" "$DATA/.env"
  echo "created $DATA/.env — add your ELEVENLABS_API_KEY to it"
fi

echo "deps: $ROOT/node_modules"
echo "env:  $DATA/.env"
