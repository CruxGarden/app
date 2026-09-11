# RAWGraphs in Crux Garden

Actual [RAWGraphs frontend](https://github.com/rawgraphs/rawgraphs-app) 2.0.1 pinned to `b7b2909111cc029ccf418dc3e7d079e0f4c50d6f` (reviewed 2026-09-11). Preserve its Apache-2.0 LICENSE, the font license files under `src/styles/fonts`, and generated `runtime/THIRD_PARTY_NOTICES.txt` (195 bundled dependency notices).

## Local adaptation

The native React editor retains data import/paste, the bundled chart catalog, drag-and-drop mapping, customization and SVG/PNG/JPG/.rawgraphs exports. Garden replaces project persistence using RAWGraphs' native 1.2 serializer. `data/project.json` holds chart mapping, visual options, parsing options and immutable references. Original input, raw rows and any unstacked rows are separate JSON Artifacts in `data/assets`; chart-style changes reuse their fingerprints. Unfinished dataset input is saved as an editable draft. Garden owns flush, external-edit conflicts and explicit reload.

Initial agent tools inspect the chart's columns/mapping/options and set its native figure size. Native Reset clears the current data loader rather than reloading the saved Garden document. Number controls have accessible labels. The native mapping panel synchronizes restored assignments into its drag state. URL query auto-imports are disabled when Garden owns startup state. Imports await dataset hydration so a restore failure cannot silently replace the saved project.

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
