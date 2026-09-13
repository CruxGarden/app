# BeepBox in Crux Garden

Upstream: https://github.com/johnnesky/beepbox
Revision: 355e510099d230d066d95074c16d748d59fe054c (main, 2026-08-07).
License: MIT; see LICENSE.md. Dependency notices: website/THIRD_PARTY_NOTICES.txt.
This independent adaptation is not an official BeepBox product or endorsement.

This is the actual BeepBox editor (website/index.html with beepbox_editor.min.js built from editor/ and synth/). Crux Garden adds only what sits behind it:

- `website/garden/bridge.js`: BeepBox keeps the song in the page's URL hash. Before the editor loads, the saved song (data/project.json) becomes that hash; afterwards every history change the editor records marks the project dirty and a confirmed Garden save writes the hash back. The URL-display preference is forced on so the song stays in the hash rather than in session storage. A bottom bar shows the save state with Save/Reload.
- `garden/document.js`: validation of that document (one base64 song string, bounded).
- App Tools: inspect the song (key, tempo, beats per bar, bars, channels), set the tempo, set the key. Changes go in the way a pasted link does: a new hash the editor reloads and records. Tools never start playback.
- `website/index.html`: the loader awaits the bridge before creating the editor and hands it the editor afterwards; relative icon/manifest paths; the Google Fonts link removed (system fallback). `editor/ExportPrompt.ts`: lamejs for MP3 export loads from `lame.min.js` next to the editor instead of a CDN. `scripts/tsconfig_synth_only.json`: type roots pinned to this package.

Not preserved: BeepBox's own localStorage preferences (layout, theme, keyboard layout, volume) and its song recovery list stay in the browser profile, as they are not part of a song. Undo history is per session.

Rebuild: `npm ci --ignore-scripts && npm run build && node garden/notices.mjs` (Node 22) rebuilds website/beepbox_*.js. Runtime folder: website/.
