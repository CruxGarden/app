# web-synth in Crux Garden

Upstream: https://github.com/Ameobea/web-synth
Revision: d9e70261e2dfa42e7d2159851100d394d9377ece (main, 2026-08-13).
License: GPL-2.0; see LICENSE. Dependency notices: runtime/THIRD_PARTY_NOTICES.txt (npm) and runtime/RUST_CRATES.txt (engine crates).
This independent adaptation is not an official web-synth product or endorsement.

This is the actual web-synth application: the graph editor, synth designer, FM synth, MIDI editor, sequencer, sampler, looper, granulator, filter designer, equalizer, signal analyzer, control panel and the rest run unchanged, with their Rust/WebAssembly engine and AudioWorklet processors. Crux Garden adds only what sits behind the app:

- `garden/bridge.ts`: before the engine boots, the saved composition (data/project.json) becomes `localStorage`, which is where web-synth itself keeps a composition (src/persistance.ts); after boot every state write marks the project dirty and a confirmed Garden save writes the whole composition back, using upstream's own unload persistence (persist every view context, then `save_all`). A bottom bar shows the save state with Save/Reload.
- `garden/document.js`: validation of that document (string entries, bounded count and size).
- App Tools: inspect the composition (modules, connections, tempo), set the tempo, add a module, rename a module. Tools never start audio.
- `src/index.tsx`: two calls into the bridge around the existing boot. `src/eventAnalytics.ts`: a no-op stand-in for upstream's private analytics module. `vite.config.mts`: `base` and `outDir` from the environment so the runtime serves from a Crux's runtime/ folder.

Not bundled, failing clearly: the hosted backend (composition sharing, preset library, login; `BACKEND_BASE_URL` points at an unreachable local port) and the Faust/Soul compiler service (`FAUST_COMPILER_ENDPOINT`). Sentry is off. Samples from a chosen folder (File System Access API) or the remote sample library live in the browser profile's IndexedDB cache and are not yet portable with the Crux; a composition that references them needs them re-added after import. Preferences `latencyHint` and `globalVolume` stay in the profile and are not part of the composition.

SharedArrayBuffer: the transport beat counter, compressor, FM synth, level detector and line spectrogram share memory between worklets and the page. The desktop shell enables Chromium's `SharedArrayBuffer` feature for non-isolated contexts; upstream's dev server uses COOP/COEP headers instead.

Rebuild: `yarn install --frozen-lockfile --ignore-scripts && yarn build:garden` (Node 22) rebuilds runtime/ from the committed WebAssembly modules. Regenerating those needs nightly Rust with the wasm32 target, wasm-bindgen-cli 0.2.92 and `just`: `just build-wasm`. `just opt` (binaryen wasm-opt) is not run for the Garden runtime.
