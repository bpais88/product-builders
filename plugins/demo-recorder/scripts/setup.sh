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

ENV_FILE="$DATA/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "$HOME/.demo-recorder/.env" ]; then
  ENV_FILE="$HOME/.demo-recorder/.env"      # existing per-user key — reuse, don't clobber
elif [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "created $ENV_FILE — add your ELEVENLABS_API_KEY to it"
fi

echo "deps: $ROOT/node_modules"
echo "env:  $ENV_FILE"
