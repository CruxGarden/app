# Wick Editor in Crux Garden

Upstream: https://github.com/Wicklets/wick-editor
Revision: f34f0d9512d7165e74c1910ea1aba9173ab8dec2 (master, 2021-01-20), editor 1.19.3 with the prebuilt Wick engine under public/corelibs.
License: GPL-3.0; see LICENSE.md and CREDITS.md. Dependency notices: runtime/THIRD_PARTY_NOTICES.txt.
This independent adaptation is not an official Wick Editor product or endorsement. Upstream's last release is from 2021 and the repository was last pushed in 2023.

This is the actual Wick Editor (React) with its engine, built with upstream's own create-react-app toolchain into runtime/. Crux Garden adds only what sits behind it:

- `src/garden/bridge.js`: the project's own `.wick` file, what Wick's Save downloads, is the Garden document, stored as a binary Artifact under data/assets and referenced from data/project.json with the project's name, frame rate and size. On boot the saved file opens the way a dropped .wick file does; every change the editor records (its own autosave request) marks the project dirty and a confirmed Garden save packages a fresh .wick through the engine and writes it. A bottom bar shows the save state with Save/Reload.
- `garden/document.js`: validation of that record.
- App Tools: inspect the project (name, frame rate, size, background, frames, layers, assets), set the name, set the frame rate. They never play the preview.
- `src/Editor/Editor.jsx`: one call into the bridge on mount; outside a Crux the editor still checks the URL and its browser autosave as before. `public/index.html`: the Plausible analytics tag removed.

Wick's browser autosave (localforage) keeps working for the session but is not the Garden document. Examples under public/examples and the bundled fonts travel with the Crux.

Rebuild (Node 14 only; the built runtime/ is committed so the Garden never needs it): `nvm use 14 && npm ci --legacy-peer-deps && npm run build:garden`.
