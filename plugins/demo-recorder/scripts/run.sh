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

# Look for the key in the plugin data dir first, then the stable per-user fallback.
# (Claude Code picks the data dir path; ~/.demo-recorder works for a manual/CLI run too.)
for env_file in "$DATA/.env" "$HOME/.demo-recorder/.env"; do
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$env_file"
    set +a
    break
  fi
done

exec "$ROOT/node_modules/.bin/tsx" "$ROOT/scripts/record-demo.ts" "$@"
