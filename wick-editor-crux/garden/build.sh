#!/bin/bash
# Rebuild the Wick Editor runtime. Upstream is a 2018 create-react-app (react-scripts 2, node-sass 4),
# which builds only on Node 14; the built runtime/ is committed so the Garden needs no Node 14.
set -euo pipefail
cd "$(dirname "$0")/.."
major=$(node -p 'process.versions.node.split(".")[0]')
# The static folders (fonts, engine corelibs, examples) are byte-for-byte copies of public/, so git
# keeps only the compiled static/ and page; every build (any Node) syncs the copies into runtime/.
sync_static() {
  for d in fonts corelibs examples builtinlibrary cursors project-converter; do
    test -d "public/$d" && rsync -a --delete "public/$d/" "runtime/$d/"
  done
}
if [ "$major" != "14" ]; then
  echo "Wick Editor builds only on Node 14 (found $(node -v)); using the committed runtime/." >&2
  test -f runtime/index.html || { echo "runtime/ is missing: build once with Node 14 (nvm use 14 && npm run build:garden)." >&2; exit 1; }
  sync_static
  exit 0
fi
test -d node_modules || npm ci --legacy-peer-deps
# The fork lives under app/, whose node_modules holds another eslint; CRA's preflight check would refuse.
SKIP_PREFLIGHT_CHECK=true CI=false GENERATE_SOURCEMAP=false npx react-scripts build
rm -rf runtime && mkdir runtime
rsync -a --exclude electron.js --exclude 'icon.*' --exclude asset-manifest.json --exclude service-worker.js --exclude precache-manifest.*.js build/ runtime/
sync_static
node garden/notices.mjs
