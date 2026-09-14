# AudioMass in Crux Garden

Actual AudioMass production source, pinned to 21f5ee1362a47be6f0dbe6e4969a15e43d21b044 from https://github.com/pkalogiros/AudioMass (reviewed 2026-09-11).

Open src/index.html to run the app. There is no build step. The native waveform editor, multitrack editor, effects and exports remain. Garden's adapter stores the active waveform, arrangement and markers in data/project.json, with separate fingerprinted PCM channel bytes in data/assets. Editing an arrangement reuses unchanged audio. Growth and Crux archives preserve these files without git. Playback stops when reopening.

The native browser-only named draft library is not the Garden project. Export drafts you want to keep or open them as the active project. Garden preserves decoded samples; it does not separately retain original compressed input files or their tags. Native .amss session and audio exports remain available. Limits: 128 tracks, 2000 clips, 256 MB of distinct decoded channel bytes. The waveform currently being edited is saved separately from multitrack clips. When the native editor is bound to an arrangement clip, its DidUpdateLen handler automatically synchronizes waveform changes into that clip. Detach the waveform before importing unrelated audio.

Changes: direct native multitrack restore/rename seam; Garden save/restore and scoped agent commands; runtime dependency folder renamed from dist to runtime so it enters Growth. Embedded close is managed by Garden. No upstream backend replica. Keep LICENSE and THIRD_PARTY_NOTICES.md with this source; bundled codecs retain their own licenses. Public editor hosting is not enabled by this integration.


## Cruxspace outputs (2026-09-12)

The Garden bar gained “Save audio to Cruxspace”. The original bridge WAV encoder has been replaced by the native encoder in the waveform depth pass below. See `GAME-CRUXSPACE-PLAN.md` at the repository root.

## Waveform tool depth (2026-09-14)

The Garden command adapter now uses the shared settle → prepare → confirmed pre-save → native operation → settle → confirmed save lifecycle. Host/frame validation share `src/garden/commands.js`. `audio-commands.js` exposes waveform import, paginated inspection and bounded PCM statistics/samples, explicit range/channel selection, gain/normalize/fades/reverse/mute, all-channel cut/copy/delete/trim, clipboard paste, silence, history, playback/view and clip detachment. Track renaming remains. Imports read relative audio Artifacts through the shared bounded reader; decoding uses the browser's AudioContext. Tools require inspected waveform/context hashes, plus clipboard/history hashes where relevant. They do not replace the native interface or store handwritten final project documents.

Garden output controls and tools use native `AudioUtils.DownloadFile`: WAV16, MP3 at 192 kbps, FLAC level 5; whole waveform, explicit range or actual multitrack MixdownAsync (optional range). Channels are preserved. Outputs remain limited to 32 MB; use a shorter range/compressed format for larger audio. Waveform tools accept mono/stereo at 8–192 kHz and at most 32 million frames; the existing distinct decoded project limit remains 256 MB. Edits use native millisecond precision. Import follows native open-audio behavior: one prior-waveform Undo checkpoint, with earlier native Undo/Redo cleared; confirmed Growth remains. Native history is transient and cleared on reopening.

Upgrade seams to retain and test:

- `src/actions.js`: ordinary asynchronous FX now emits WillApplyAudioEffect / DidApplyAudioEffect / DidFailAudioEffect with a per-render token. Garden waits for actual completion, including manually started effects. Capture channel selection when rendering starts and discard results if the active buffer was replaced. The optional tenth DownloadFile argument receives native encoded Blob/error instead of starting a browser download. Ordinary native export callers retain their existing behavior.
- `src/multitrack.js`: read-only gardenEditingClip getter beside existing Garden restore/rename methods. Native linked-clip synchronization is retained, not reimplemented.
- `src/garden/shared/` is copied by `embedded-apps/sync-shared.mjs`; edit canonical shared files, then sync. Other Garden modules are integration-owned. No upstream build is needed. Source tests under `src/garden/tests` travel in the Crux alongside the runtime.

Remaining tool families: track/clip creation, placement, splitting/trimming/duplication, fades/gain/pan/mute/solo in arrangements; markers; advanced processing/analysis and native session interchange. Those remain native manual controls in this iteration and are still in the selected-app backlog. A passing waveform journey does not certify complete AudioMass coverage.
