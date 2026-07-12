#!/usr/bin/env bash
# Run the recorder from any project directory.
#   usage: bash scripts/run.sh [--data <dir>] demos/<name>.ts [--dry-run]
# Loads ELEVENLABS_API_KEY from the DATA dir's .env into the environment; record-demo.ts
# reads it from process.env, so the key never has to live inside the plugin/repo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.demo-recorder}"

if [ "${1:-}" = "--data" ]; then
  DATA="$2"
  shift 2
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "deps missing — run: bash \"$ROOT/scripts/setup.sh\" \"$DATA\"" >&2
  exit 1
fi

if [ -f "$DATA/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$DATA/.env"
  set +a
fi

exec "$ROOT/node_modules/.bin/tsx" "$ROOT/scripts/record-demo.ts" "$@"
