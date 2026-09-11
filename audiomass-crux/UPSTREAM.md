# AudioMass in Crux Garden

Actual AudioMass production source, pinned to 21f5ee1362a47be6f0dbe6e4969a15e43d21b044 from https://github.com/pkalogiros/AudioMass (reviewed 2026-09-11).

Open src/index.html to run the app. There is no build step. The native waveform editor, multitrack editor, effects and exports remain. Garden's adapter stores the active waveform, arrangement and markers in data/project.json, with separate fingerprinted PCM channel bytes in data/assets. Editing an arrangement reuses unchanged audio. Growth and Crux archives preserve these files without git. Playback stops when reopening.

The native browser-only named draft library is not the Garden project. Export drafts you want to keep or open them as the active project. Garden preserves decoded samples; it does not separately retain original compressed input files or their tags. Native .amss session and audio exports remain available. Limits: 128 tracks, 2000 clips, 256 MB of distinct decoded channel bytes. The waveform currently being edited is saved separately from multitrack clips; finish a clip edit with the native Apply control to commit it into the arrangement.

Changes: direct native multitrack restore/rename seam; Garden save/restore and scoped agent commands; runtime dependency folder renamed from dist to runtime so it enters Growth. Embedded close is managed by Garden. No upstream backend replica. Keep LICENSE and THIRD_PARTY_NOTICES.md with this source; bundled codecs retain their own licenses. Public editor hosting is not enabled by this integration.
