# BentoPDF in Crux Garden

Upstream: https://github.com/alam00000/bentopdf
Revision: 597e36904e8ccacc0af98463589805cb9ee910d2 (main, 2026-09-10), version 2.8.8.
License: AGPL-3.0-only; see LICENSE. Dependency notices: runtime/THIRD_PARTY_NOTICES.txt.
This independent adaptation is not an official BentoPDF product or endorsement.

This is the actual BentoPDF toolkit, built with upstream's own Vite toolchain in its Simple Mode (every tool, none of the bentopdf.com marketing chrome) into runtime/. Crux Garden adds only what sits behind it:

- `src/js/garden/bridge.ts`, loaded on every page from `main.ts` (and from the standalone `tools.html`): inside a Crux, every result a tool would download is saved to the Crux instead, as a binary Artifact under data/assets, and every file a person loads into a tool is kept the same way. `data/project.json` lists them (name, type, size, page count, which tool made them, when). A bottom bar shows the save state. Outside a Crux the bridge does nothing and downloads work as upstream.
- `garden/document.js`: validation of that list.
- App Tools: inspect the Crux's documents, name the project, rotate a document, merge documents (pdf-lib, the same library the toolkit uses). They add results to the list; they never delete.
- `src/js/utils/helpers.ts` `downloadFile` asks the bridge first; the two pages with their own download copy (`remove-annotations`, `remove-blank-pages`), `page-dimensions` and the workflow export now call that shared helper.
- `src/js/utils/wasm-provider.ts`: a relative `VITE_WASM_*_URL` resolves against the page, so the offline WASM copies work from any folder.
- `vite.config.ts`: `OUT_DIR` and `SKIP_COMPRESSION` for the Garden build (`garden/build.sh`).
- `public/wasm/`: upstream's air-gap bundle (`@bentopdf/pymupdf-wasm` 0.11.16 and `@bentopdf/gs-wasm` 0.1.1) unpacked, so the PyMuPDF and Ghostscript tools run offline; the `.tgz` files were removed. CoherentPDF loads from the copy upstream already ships under public/.

Still online, as upstream: OCR (Tesseract worker, core and language data from jsDelivr, Noto fonts for the text layer) and the digital-signature certificate-chain proxy. The interface language switcher's per-language pages are not built (the flat English pages are); the in-app language choice still translates the tools.

Rebuild: `npm ci --ignore-scripts && npm run build:garden` (Node 22) rebuilds runtime/. The large folders under runtime/ (LibreOffice, the pdf.js viewers, wasm/) are copies of public/ and are not committed twice; the build script restores public/ from runtime/ when needed.
