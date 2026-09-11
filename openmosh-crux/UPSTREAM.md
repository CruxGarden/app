# OpenMosh in Crux Garden

Fork of https://github.com/zivavu/OpenMosh at af2fa8001a97b8326e1e2e655b524f43180d07f4 (0.7.3). The original editing interface, effects, timelines, media and audio functions are retained. Garden changes are recorded here as they land.

Upstream MIT notices remain in LICENSE. Dependencies carry their own licenses, including AGPL-3.0 Essentia.js and MPL-2.0 Mediabunny. This is not a wholly MIT runtime. Public runtime release requires the matching source/notice package.

## Garden adapter (2026-09-10)

- `src/garden` serializes native IndexedDB records and OpenMosh local settings into `data/project.json`. Original image/video/audio/font bytes live in immutable `data/assets/<sha256>.bin` Artifacts. Preview proxies are a rebuildable cache and are excluded.
- Startup hydrates the native stores before importing App.svelte. Native Editor and Slideshow save hooks are awaited before Garden reports a save. Failed/conflicting writes retain the live draft; Reload saved project explicitly discards it.
- Single and selected static Editor effect chains expose inspection and changes to Garden agents through the native undo path. Slideshow remains fully manually editable, with inspection available to agents.
- Original image/video exports remain. The Garden strip additionally saves a still frame for Cruxspace use.
- Native imports are limited to 128 MB per file; project metadata to four million characters. A Crux may contain many assets; this is not yet a large video project performance certification. Binary contents are separate from JSON and reused across Growth versions. No git dependency.
- Build: `npm ci --ignore-scripts && npm run build`. Workshop entry: `runtime/index.html`. Sources, runtime, lockfile and notices are Artifacts. `npm run check` and `npm test` validate the fork (the latter initializes the pinned Bun test runtime).
- Existing `tool-openmosh` Cruxes retain their original implementation; no user's source or data is automatically rewritten.

See NOTICES.md before distributing this runtime.
