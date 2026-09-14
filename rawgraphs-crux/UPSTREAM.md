# RAWGraphs in Crux Garden

Actual [RAWGraphs frontend](https://github.com/rawgraphs/rawgraphs-app) 2.0.1 pinned to `b7b2909111cc029ccf418dc3e7d079e0f4c50d6f` (reviewed 2026-09-11). Preserve its Apache-2.0 LICENSE, the font license files under `src/styles/fonts`, and generated `runtime/THIRD_PARTY_NOTICES.txt` (195 bundled dependency notices).

## Local adaptation

The native React editor retains data import/paste, the bundled chart catalog, drag-and-drop mapping, customization and SVG/PNG/JPG/.rawgraphs exports. Garden replaces project persistence using RAWGraphs' native 1.2 serializer. `data/project.json` holds chart mapping, visual options, parsing options and immutable references. Original input, raw rows and any unstacked rows are separate JSON Artifacts in `data/assets`; chart-style changes reuse their fingerprints. Unfinished dataset input is saved as an editable draft. Garden owns flush, external-edit conflicts and explicit reload.

Agent tools inspect paginated rows/types/mappings/options, discover and select bundled charts, load bounded CSV/TSV data, revise specific cells/types, map dimensions, change scalar controls and save PNG/SVG/JPEG/editable .rawgraphs outputs. General authoring lives in `src/garden/chart-commands.js`, with a shared host/frame schema in `commands.js`. `useGarden.js` forwards current native React state and public data/chart setters; `App.js` supplies mapping-busy and rendered-chart state. No new upstream parser/chart/history patch is required. Native document Undo is not available; Garden Growth preserves confirmed saves. Complex color scales, aggregations, stacking and JSON-path imports remain follow-up tool coverage, not a completed-app claim. Native Reset clears the current data loader rather than reloading the saved Garden document. Number controls have accessible labels. The native mapping panel synchronizes restored assignments into its drag state. URL query auto-imports are disabled when Garden owns startup state. Imports await dataset hydration so a restore failure cannot silently replace the saved project.

Custom chart JavaScript and browser-stored custom chart libraries are disabled when embedded. The bundled chart catalog remains. URL/SPARQL imports still need their chosen remote services; downloaded rows are retained for local reopening. Upstream analytics and the corresponding cookie banner are removed. This edition does not publish the entire editor as a website; use its native exports.

## Rebuild

Use Node 22.22+ and Yarn 1.22.22:

```
yarn install --frozen-lockfile --ignore-scripts
yarn build
yarn test
```

`runtime/index.html` is the entry file and `runtime/` is tracked in a created Crux. The build uses a relative public path and the OpenSSL compatibility flag required by upstream Webpack 4. CRA's parent-directory dependency check is skipped because Garden's independent ESLint version is outside this fork; this fork still installs its exact frozen dependency tree. CSS is copied as raw text to preserve its local font URLs.

The upstream test was a Create React App placeholder that failed at worker-loader resolution. It is replaced with Node tests exercising RAWGraphs' real serializer/parser and chart implementation: dataset round-trip and data stability across figure-size edits. Garden service tests cover Growth, Crux export/import, asset reuse, conflict handling and tool scope. Desktop acceptance is maintained in `app/electron/e2e/rawgraphs-app.spec.ts` in the Garden source repository.

## Command adapter upgrade checks

The generated `src/garden/shared/` files come from Garden's `embedded-apps/shared/`; run `node embedded-apps/sync-shared.mjs` from the host app before building. Do not edit generated copies. The ordered command session settles native input/debounced rendering, validates, confirms the current save, applies native changes, waits for workers/rendering and confirms the new save. Data hashes include original/draft input and parsing state; scoped changes reject stale data, replacement drafts and incompatible mapped types. Chart switches retain native reset semantics. Export targets the native rendered chart, never catalogue thumbnails.

On upstream pulls, verify `hydrateFromSavedProject`, inline data/type editing, typed-column shapes, dimension/default aggregation schemas, chart-change mapping reset, options/debounce and `rawViz` DOM ownership. Keep native serialization, draft/replacement safeguards and image dimensions intact. Focused Node tests exercise real RAWGraphs core parsing/mapping defaults plus stale/manual-state preservation. Desktop acceptance is `electron/e2e/rawgraphs-depth.spec.ts` alongside the existing native import/conflict/draft regression. This pass requires the full Garden app and Electron verification gates before being marked verified. Existing Project Folders are not silently upgraded.
