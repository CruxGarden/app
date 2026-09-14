# Upstream: Glyphr Studio 2

- Source: https://github.com/glyphr-studio/Glyphr-Studio-2 — "the free & open source web-based font editor, made for hobbyists and typeface design beginners", Matthew LaGrandeur.
- Pinned: commit `092ae49` (v2.10.4, 2026-09-11). License: **GPL-3.0-or-later** (`LICENSE-gpl-3.0.txt`, kept verbatim; the runtime dependencies `font-flux-js`, `bezier-boolean`, `svg-to-bezier`, `@mattlag/xmltojson` are GPL-3.0 by the same author — `licenses/NOTICES.md`). As with Blockbench, Twine, Wick Editor and web-synth, the fork is a separate package whose source, lockfile and notices travel with every Crux; the Garden adaptation in `src/garden/` and `garden/` is distributed under the same terms.

## What is upstream, unchanged

Everything under `src/` except `src/garden/` and one script tag in `src/index.html`; `package.json` dependencies and lockfile; `jsconfig.json`, `eslint.config.js`, `raw.d.ts`, `scripts.js`, `favicon.ico`, `README.md`. Upstream's `test/` fixtures (25 MB) are not carried; `npm run lint` is upstream's.

## What Crux Garden added

- **`src/index.html`**: one line — `<script src="garden/bridge.js" type="module">` after upstream's entry module, so Vite bundles the bridge with the app.
- **`src/garden/bridge.js`**: inert outside a Workshop frame. Inside: reads `data/project.json` (`{ name, gs2, saved }`, `gs2` being the same object a `.gs2` file holds — `project.save()`), opens it with upstream's `importProjectDataAndNavigate` (or starts a new project named after the Crux), wraps the editor's `History.addState`/`addWholeProjectChangePostState` and compares the serialized project every 5 s so settings edits count too, saves with the fingerprint guard, answers the host's flush, and swallows the "leave page?" prompt (the Workshop reloads its own frame). Commands: `inspect`, `set-name`, `set-glyph` (upstream's `importSVGtoCurrentItem` into the selected character), `save-font` (upstream's `ioFont_exportFont(format, true)` returns the bytes; they go to the Crux's outputs as `font/otf|ttf|woff|woff2`). A bar at the bottom: status, output name, format, *Save font to Cruxspace*.
- **`src/garden/document.js`** (+ `.d.ts`, node:test): the document validator the host runs too.
- **`garden/build.cjs`**: `vite build ./src/ --base=./` (upstream's build without `scripts.js`, which only stamps `app_config.json`), copied to `runtime/` with the license and notices, source maps dropped.
- `package.json` scripts (`build`, `build:upstream`, `check`, `test:garden`); `.cruxignore` keeps `node_modules/`, `dist/` and `runtime/` out of Growth (the template writes `runtime/` on creation).

Glyphr Studio's own browser storage (settings in localStorage, optional autosave in IndexedDB) stays per preview origin and is not the record; the Garden document is. Upstream's project file dialogs still work (Save project file downloads a `.gs2`).

Build: `npm ci --ignore-scripts && npm run build` (Node 22). `npm run test:garden` checks the document; `npm run check` syntax-checks the bridge.
