# Upstream: Azgaar's Fantasy Map Generator

- Source: https://github.com/Azgaar/Fantasy-Map-Generator — "a free web application that helps fantasy writers, game masters, and cartographers create and edit fantasy maps", Max Haniyeu (Azgaar). Pinned: commit `a7289d3` (v1.152.2, 2026-09-12), ~6k stars. License: MIT (`LICENSE`, kept verbatim); dependency notices in `licenses/NOTICES.md` (generated at build from the installed packages).
- Vite 8 / TypeScript. Upstream's desktop build (`vite build --mode electron`) is the one used here: a relative base, no analytics tag, no PWA manifest — the same renderer the web app ships minus the parts that phone home.

## What is upstream, unchanged

Everything under `src/` and `public/` (libraries, images, textures, heightmaps, charges); `package.json` dependencies and lockfile; `tsconfig.json`, `vite.config.ts`, `README.md`. Not carried: upstream's `docs/` (11 MB), `tests/` (20 MB), the Electron packaging, Nix, CI and its agent instruction files (the Crux writes its own `AGENTS.md`).

## What Crux Garden added

- **`garden/bridge.js`**: a plain module the build appends to `runtime/index.html` after upstream's bundle (bundling it with a top-level await broke upstream's boot order); inert outside a Workshop frame. Inside, once upstream has its fresh world on screen, it reads `data/project.json` (`{ name, seed, map, saved }` — `map` is the `.map` save text upstream's *Save to machine* downloads) and opens the saved map through upstream's own `Services.Load.uploadMap`; a new Crux keeps the fresh world and saves that. The app has no change event, so every 20 s the bridge compares the save text (`Services.Save.prepareMapData()`, what upstream's autosave serializes) and saves with the fingerprint guard; the host's flush does the same before a close. Commands: `inspect` (name, seed, size, cells, burgs, states, cultures), `set-name` (the lore name), `new-map` (upstream's `generate`, optional seed), `save-image` (PNG or SVG through upstream's `getMapURL` into the Crux's outputs). A bar at the bottom: status, *Save map to Garden*, output name, format, *Save image to Cruxspace*.
- **`garden/document.js`** (+ `.d.ts`, node:test): the document validator the host runs too.
- **`garden/build.cjs`**: installs this platform's rolldown binding when the lockfile lacks it (Vite 8's bundler ships native optional packages), runs upstream's electron-mode build, copies it to `runtime/` without `sw.js` and the manifest, adds the bridge and its script tag, writes the notices.
- `package.json` scripts (`build`, `build:upstream`, `check`, `test:garden`); `.cruxignore` keeps `node_modules/`, `dist*/` and `runtime/` out of Growth (the template writes `runtime/` on creation).

Upstream's own save/load dialogs still work (a downloaded `.map` reloads through *Load*), and its browser storage stays per preview origin; the Garden document is the record.

Build: `npm ci --ignore-scripts && npm run build` (Node 24; upstream's engines say ≥ 24). `npm run check` runs upstream's `tsc`; `npm run test:garden` checks the document.
