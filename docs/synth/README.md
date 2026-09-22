# Crux Synth listening checkpoint — 2026-09-22

The production instrument now has a shared evolving score: slow chord changes, nearby chord inversions, a bass foundation, a recurring bell phrase with breathing room, and drifting filtered air. Pads combine softly detuned triangle/sine layers; bells use separately decaying additive partials. Stereo diffusion, reverb damping, a low-frequency filter and gentle compression provide space and headroom. Harmony (luminous/major, reflective/minor, floating/Dorian), pace and space join the original four-track controls. Old version-1 patches receive compatible defaults.

Every bundled Mood contains three editable presets: its atmosphere, a sparse Still variation and an Unfolding variation. These are curated families with deterministic Mood-specific roots, not 201 independently composed songs. Named user presets persist per Mood, can be loaded/deleted, and ride in saved/shared/exported `.cruxmood` packages. `get_synth` exposes the bank and `set_synth` selects, saves or removes presets using the same store and validation as the UI. Sharing uses the existing Mood flow; nothing is published automatically.

## Listen

Each example is 64 seconds, seed 42, rendered silently with the same score and Web Audio graph used live, at the app's 70% master level. MP3 encoding is 192 kbps with no normalization or mastering added afterward.

- [Slow glow](glow.mp3): warm major harmony, a steady foundation and space between bell phrases.
- [Open meadow](meadow.mp3): brighter, quicker, and less reverberant.
- [Quiet dusk](dusk.mp3): slower minor harmony with restrained upper voices.
- [Prismatic drift](prism.mp3): Dorian harmony, more motion and a deeper stereo space.

These are listening candidates. Automated measurements establish technical behavior; they do not establish that a person finds the music excellent. Daniel's listening and taste feedback remain the aesthetic acceptance step.

## Reproduce and measurements

From `app/`, run `node scripts/render-synth.mjs /private/tmp/crux-synth-listening` with Node 22 and Playwright Chromium installed. It bundles the actual production modules, uses `OfflineAudioContext`, writes four stereo WAVs plus all-pad maximum-control stress and all-muted silence renders, and rejects non-finite output, clipping or unexpectedly empty output. [measurements.json](measurements.json) records samples before MP3 encoding.

At 70% master: the four normal presets peak at 0.204–0.308 with RMS 0.035–0.042; the all-pad stress peaks at 0.651. All-muted output is exactly zero. All six renders contain only finite samples. The stereo measurements and four-second RMS windows document variation; neither is a perceptual quality score. This is a bounded 64-second sample, not exhaustive proof for every possible patch or a long-session audio-performance test.

Unit regressions cover legacy migration, invalid controls/preset banks, user-preset agent parity and atomic rejection, Mood ZIP bank preservation, all bundled banks, live/offline phrase equivalence and resume-without-note-bursts. Real desktop testing separately covers actual audio, mute/pause, UI/MCP changes, user preset save/delete, saved Mood and restart.

Verification checkpoint: app `npm run verify` passes 1,385 tests/233 files plus type/lint/tool gates and build; Electron verify passes. The expanded live desktop Synth journey passes (13.1 s), including UI/MCP harmony/pace/space, named-preset create/delete, saved Mood and restart. Settings sound/key/Persona tests pass together. One initial test assertion counted the new preset disclosure as a fifth group; it now explicitly counts the four named track groups. Visual review also caught horizontal overflow from intrinsic control widths; constrained form widths and a desktop overflow assertion now pass. The current built `app/dist` is verified; the previously packaged `.app` still contains the earlier instrument until the next package rebuild. [Controls screenshot](controls.png).

Follow-up: the scrollbar still covered the right edge despite the inner-width assertion. The Mood scroll container now reserves room; an ancestor-relative control-bounds assertion and visual review pass with the expanded live journey (13.4 s). The screenshot above is refreshed. The subsequent full app gate passes 1,388 tests/234 files/build.

## Liminal listening request — 2026-09-22

Daniel requested the dreamiest, trippiest liminal-horror atmosphere the current instrument can make. [The lights are still on](liminal.mp3) is a 128-second listening candidate: F♯ minor, pace 30, Space 100%, low soft pad, bass, sparse bells and filtered air. It uses only the public Synth patch controls and the production score/graph, with no added processing, samples or replacement synthesis. Reverb is present; a separate delay is not implemented. This is a tonal ambient interpretation within the current engine, not an assertion of aesthetic acceptance.

The exact editable [patch](liminal-patch.json) and [measurements](liminal-measurements.json) are retained. Reproduce with `node scripts/render-synth.mjs /private/tmp/crux-synth-liminal docs/synth/liminal-patch.json 128`, then encode `custom.wav` to 192 kbps MP3 without normalization. Peak 0.369, RMS 0.0495, no non-finite samples. The renderer now optionally takes any ordinary patch JSON plus a duration (1–180 seconds); the default six-preset evidence run is unchanged. This patch file is a reproducible control recipe, not a new preset-import UI or a claim it was installed in Daniel's active Mood.

Daniel listened to this candidate and said “yeah, I like it.” He asked about live mangling: the existing controls reshape the playing instrument; destructive distortion, pitch warping, stutters and feedback are not implemented. This is acceptance of the example’s direction, not full sound-library or release acceptance.
