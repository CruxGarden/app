# Upstream: signal

[ryohey/signal](https://github.com/ryohey/signal) at `632de96` (main, 2026-05-22) — MIT (`LICENSE`). A MIDI sequencer: piano roll, arrange view, tempo editor, WebGL rendering, a SoundFont synth (spessasynth) with a bundled factory sound, MIDI in/out, WAV/MP3 export.

Carried: `app/` (the React app, `edit.html` only), `packages/` (`core`, `player`, `dialog-hooks`, `api`, `community`, `firebaseui-web-react` — the app resolves them all), the root `package.json`, lockfile, Turbo and Biome config; the type files upstream's app imports from its Electron shell (`electron/src/ElectronAPI.ts`, `FirebaseCredential.ts`). Not carried: the Electron shell itself, Firebase functions and rules, Docker, Vercel, upstream's agent instructions.

Built with upstream's own desktop configuration (`vite-electron.config.mts`: relative base, `edit.html` only) by `garden/build.cjs` into `runtime/`, after the `player`, `dialog-hooks` and `community` packages compile.

## Changes in this fork (all marked `Crux Garden` in the source)

- `app/src/helpers/platform.ts` — `isRunningInElectron()` also requires upstream's preload API (`window.electronAPI`): Crux Garden is an Electron app too, and the user-agent check alone sent the app down its native-shell path (native menus, missing `electronAPI`).
- `app/src/stores/SoundFontStore.ts`, `app/src/stores/RootStore.ts` — the factory sound (`A320U.sf2`, 9.7 MB) and the metronome (`A320U_drums.sf2`) load from `soundfonts/` next to the page instead of jsDelivr, so the app works offline. The files come from upstream's own `public/` history (the commits the CDN URLs pointed at) and live in `runtime/soundfonts/` in a Crux; copy them back to `app/public/soundfonts/` before rebuilding.
- `app/src/stores/RootStore.ts` — the localStorage auto-save stays off when the app is framed in a Workshop (Garden saves the song).
- `app/src/components/App/App.tsx` — `rootStore` is exported for the bridge.
- `app/src/garden/cloud.ts`, `Navigation/FileMenuButton.tsx`, `Navigation/UserButton.tsx` — the sign-in controls are hidden unless the build has upstream's Firebase keys.
- `app/src/index.tsx` — no Sentry, no service worker; imports the bridge.
- `app/edit.html` — Google Analytics, Google Fonts and PWA tags removed (fonts fall back to the system).
- `app/src/garden/bridge.ts` — the Garden bridge, bundled with the app and inert outside a Workshop frame.

## The Garden document

`data/project.json` is `{ version: 1, app: 'signal', project: { name, midi, saved } | null }` where `midi` is a Garden binary asset reference (`data/assets/<sha256>.bin`, `audio/midi`) to the song as a Standard MIDI File — what upstream's *Download MIDI* writes. The bridge saves after every edit the app marks unsaved (and compares the MIDI bytes every 10 s for the rest), reopens the saved file through upstream's own `songFromMidi`, and answers the App Tools (`inspect`, `set-name`, `set-notes`, `save-output`). Outputs are the MIDI file or a WAV render through upstream's `renderAudio`. `garden/document.js` is the validator the host runs too.
