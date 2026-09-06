#!/usr/bin/env bash
#
# desktop.sh — build & launch the Crux Garden desktop app with everything handled:
# correct Node (nvm/.nvmrc), web bundle, Electron TS compile, and the
# ELECTRON_RUN_AS_NODE trap (set by VS Code terminals) neutralized.
#
# Usage:
#   ./scripts/desktop.sh              # build if needed, launch the app
#   ./scripts/desktop.sh --rebuild    # force a fresh web build first
#   ./scripts/desktop.sh --dev       # HMR mode: launch against the Vite dev server
#   ./scripts/desktop.sh --live       # against the PRODUCTION API (api.crux.garden) — publish for real
#   ./scripts/desktop.sh --selftest   # run the in-app integration self-test (8 checks)
#   ./scripts/desktop.sh --logs       # tail the desktop debug log
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON_DIR="$APP_DIR/electron"
DEBUG_LOG="$HOME/crux-garden-debug.log"

# ── Node: honor .nvmrc, survive shells whose default node is ancient ─────────
WANT_NODE="$(cat "$APP_DIR/.nvmrc" 2>/dev/null || echo 22)"
if command -v nvm >/dev/null 2>&1; then
  nvm use "$WANT_NODE" >/dev/null
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use "$WANT_NODE" >/dev/null
else
  # Fall back to the newest matching nvm-installed version on PATH
  CANDIDATE="$(ls -d "$HOME/.nvm/versions/node/v${WANT_NODE%%.*}"*/bin 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$CANDIDATE" ] && export PATH="$CANDIDATE:$PATH"
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: node $(node --version) is too old (need >= 18; .nvmrc wants $WANT_NODE)" >&2
  exit 1
fi
echo "· node $(node --version)"

# ── Args ─────────────────────────────────────────────────────────────────────
MODE="app"
REBUILD=0
LIVE=0
for arg in "$@"; do
  case "$arg" in
    --rebuild)  REBUILD=1 ;;
    --dev)      MODE="dev" ;;
    --live)     LIVE=1 ;;
    --selftest) MODE="selftest" ;;
    --logs)     exec tail -f "$DEBUG_LOG" ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ── API target ───────────────────────────────────────────────────────────────
# VITE_* values are baked into the web bundle at build time. --live points the
# build at production; otherwise .env (or the shell) decides. The bundle
# remembers which target it was built for, so switching targets rebuilds
# instead of quietly reusing the other one's bundle.
if [ "$LIVE" = 1 ]; then
  export VITE_API_URL="https://api.crux.garden"
  export VITE_PUBLISH_ORIGIN_TEMPLATE="https://{cruxId}.publish.crux.garden"
  echo "· LIVE: building against ${VITE_API_URL} — publishes go to production; sign in with your real account"
fi
TARGET="${VITE_API_URL:-env-file}"
TARGET_MARK="$APP_DIR/dist/.api-target"
if [ -f "$TARGET_MARK" ] && [ "$(cat "$TARGET_MARK")" != "$TARGET" ]; then
  echo "· web bundle was built for $(cat "$TARGET_MARK"); rebuilding for ${TARGET}"
  REBUILD=1
fi

# ── Dependencies (first run) ─────────────────────────────────────────────────
[ -d "$APP_DIR/node_modules" ]      || (cd "$APP_DIR" && npm install)
[ -d "$ELECTRON_DIR/node_modules" ] || (cd "$ELECTRON_DIR" && npm install)

# ── Web bundle (skipped in --dev; Vite serves it live) ───────────────────────
if [ "$MODE" != "dev" ]; then
  if [ "$REBUILD" = 1 ] || [ ! -f "$APP_DIR/dist/index.html" ]; then
    echo "· building web bundle (vite)…"
    (cd "$APP_DIR" && npx tsc -b && npx vite build)
    printf '%s' "$TARGET" >"$TARGET_MARK"
  else
    echo "· web bundle present (use --rebuild to refresh)"
  fi
fi

# ── Electron main compile (fast, always) ─────────────────────────────────────
echo "· compiling electron main (tsc)…"
(cd "$ELECTRON_DIR" && npx tsc)

# ── Launch ───────────────────────────────────────────────────────────────────
# env -u: VS Code terminals set ELECTRON_RUN_AS_NODE, which makes Electron run
# as plain Node and the app crash on require('electron').
LAUNCH=(env -u ELECTRON_RUN_AS_NODE)

case "$MODE" in
  dev)
    if ! nc -z 127.0.0.1 8080 2>/dev/null; then
      echo "· starting Vite dev server on :8080…"
      (cd "$APP_DIR" && npm run dev >/dev/null 2>&1 &)
      for _ in $(seq 1 30); do nc -z 127.0.0.1 8080 2>/dev/null && break; sleep 1; done
    fi
    echo "· launching (dev server, HMR)"
    exec "${LAUNCH[@]}" env CRUX_DEV_SERVER=http://localhost:8080 \
      "$ELECTRON_DIR/node_modules/.bin/electron" "$ELECTRON_DIR"
    ;;
  selftest)
    echo "· running in-app self-test…"
    rm -f "$DEBUG_LOG"
    "${LAUNCH[@]}" env CRUX_SELFTEST=1 \
      "$ELECTRON_DIR/node_modules/.bin/electron" "$ELECTRON_DIR" || true
    echo
    grep "SELFTEST" "$DEBUG_LOG" || { echo "no self-test output found" >&2; exit 1; }
    grep -q "SELFTEST FAIL" "$DEBUG_LOG" && exit 1 || exit 0
    ;;
  app)
    echo "· launching (bundled dist)"
    exec "${LAUNCH[@]}" "$ELECTRON_DIR/node_modules/.bin/electron" "$ELECTRON_DIR"
    ;;
esac
