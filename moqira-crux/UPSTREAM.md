# Moqira in Crux Garden

Upstream: https://github.com/downcastsystems/moqira
Revision: 0fbe079a9c4d93fd00bd35a7a8a5814afa9d3111 (main, 2026-08-12), Moqira 1.0.3. Upstream authors retain their rights; no new license is asserted for their source (the repository declares none).

This is the actual Moqira: `src/` is upstream's React app unchanged (App.tsx, lib, styles, types). Moqira is a Tauri 2 desktop app whose front end talks to its Rust side through seven commands and three Tauri modules; inside a Crux those modules resolve to stand-ins (`vite.config.ts` aliases → `src/garden/tauri-*.ts`), so the app believes it is in Tauri and the Garden answers:

- `open_project_file` / `save_project_file` / `read_last_project_path`: the Crux's one project, `mockups/project.json`, read before the app starts and written by the app's own Save (a write the Garden refuses because the file changed elsewhere surfaces in the bar with Discard draft and reload). The Save dialog always names that file; the Open dialog is the browser's file picker (aria-label "Import Moqira project"), so a Moqira file can be brought into the Crux the way the desktop app opens one, and the next Save keeps it here.
- `sync_recent_projects`, `sync_edit_menu_state`, `reveal_project`, `write_last_project_path`: no-ops (native menus, recents and Finder belong to the desktop app). Menu events the desktop app receives from its native menu (`menu-save-project` and the rest) are raised by the Garden bar and by the host's flush through the event stand-in.
- `src/garden/bridge.ts`: the Garden protocol, the bottom bar (save state mirrored from the app's own title-bar indicator, Save project, Public edition… choices, Appearance), the publication choices in `mockups/publish.json` (ADR 0029), and the Mood appearance protocol mapped onto Moqira's CSS variables.
- `src/garden/boot.ts`, loaded before `main.tsx` from `index.html`: sets the Tauri marker the app checks, then mounts the bar once the app has rendered.
- `scripts/edition.mjs`: the public edition (ADR 0029) keeps only the selected wireframes and their links; `npm run build` (`vite build --mode edition`) bakes that into `dist/index.html`, where the same app opens it with saving off and starts in interactive mode.

Build: `npm install --ignore-scripts` (the lockfile is refreshed here; upstream's was out of step with its own manifest), `npm run build:garden` → `runtime/` for the Workshop (relative paths), `npm run build` → `dist/` public edition, `npm run check`, `npm test` (upstream's tests plus the edition test).
