#!/usr/bin/env bash
#
# site.sh — run a Vite command for the crux.garden website on the right Node.
#
# npm runs scripts with whatever `node` the shell has. A default of Node 14
# fails inside Vite's ESM loader with "Unexpected token '||='", which says
# nothing about the real problem. Pick the Node .nvmrc asks for, the way
# desktop.sh already does, and say so plainly when that is not possible.
#
# Usage: ./scripts/site.sh dev|build|preview [extra vite args…]
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Node: honor .nvmrc, survive shells whose default node is ancient ─────────
WANT_NODE="$(cat "$APP_DIR/.nvmrc" 2>/dev/null || echo 22)"
if command -v nvm >/dev/null 2>&1; then
  nvm use "$WANT_NODE" >/dev/null
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use "$WANT_NODE" >/dev/null
else
  CANDIDATE="$(ls -d "$HOME/.nvm/versions/node/v${WANT_NODE%%.*}"*/bin 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$CANDIDATE" ] && export PATH="$CANDIDATE:$PATH"
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: node $(node --version) is too old (need >= 18; .nvmrc wants $WANT_NODE)" >&2
  exit 1
fi

MODE="${1:-dev}"
shift || true
case "$MODE" in
  dev)     exec npx vite --config "$APP_DIR/vite.site.config.ts" "$@" ;;
  build)   exec npx vite build --config "$APP_DIR/vite.site.config.ts" "$@" ;;
  preview) exec npx vite preview --config "$APP_DIR/vite.site.config.ts" "$@" ;;
  *) echo "usage: site.sh dev|build|preview [vite args…]" >&2; exit 1 ;;
esac
