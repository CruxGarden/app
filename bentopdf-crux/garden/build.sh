#!/bin/bash
# Build the BentoPDF runtime for Crux Garden: upstream's Vite build in Simple Mode (every tool, no
# marketing chrome), relative asset paths so the pages serve from any folder, the offline WASM
# copies under public/wasm instead of the jsDelivr defaults, no .br/.gz twins, into runtime/.
set -euo pipefail
cd "$(dirname "$0")/.."
# The large runtime folders (LibreOffice, the two pdf.js viewers, the PyMuPDF and Ghostscript WASM)
# are byte-for-byte copies of public/, so git keeps them once; a Crux made from the template carries
# them once too, under runtime/, and this restores public/ from there before a rebuild.
HEAVY="libreoffice-wasm pdfjs-annotation-viewer pdfjs-viewer wasm"
for d in $HEAVY; do
  if [ ! -d "public/$d" ] && [ -d "runtime/$d" ]; then rsync -a "runtime/$d/" "public/$d/"; fi
done
test -d node_modules || npm ci --ignore-scripts
SIMPLE_MODE=true BASE_URL=./ OUT_DIR=runtime SKIP_COMPRESSION=true DISABLE_GITHUB_STARS=true \
  VITE_WASM_PYMUPDF_URL=wasm/pymupdf/ VITE_WASM_GS_URL=wasm/gs/assets/ VITE_WASM_CPDF_URL=./ \
  VITE_DEFAULT_LANGUAGE=en \
  npx vite build
find runtime -name '*.br' -delete -o -name '*.gz' -delete
# The tool pages are built from src/pages/ and flattened to the root, so their relative asset paths
# still climb two folders; point them at the root they now live in.
node -e '
const fs = require("fs");
for (const f of fs.readdirSync("runtime").filter((n) => n.endsWith(".html"))) {
  const p = "runtime/" + f;
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/(["\x27(])\.\.\/\.\.\//g, "$1./"));
}'
node garden/notices.mjs
