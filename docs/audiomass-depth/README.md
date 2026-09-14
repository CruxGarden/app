# AudioMass waveform tool acceptance

The real desktop journey in `electron/e2e/audiomass-depth.spec.ts` uses the scripted model and isolated Garden. It imports a generated stereo WAV Artifact, preserves a person's native Reverse edit during a left-channel mute, verifies native Undo/Redo and exact unrelated PCM, exercises copy/paste/silence/cut/delete/trim and six effects, then saves native WAV/MP3/FLAC and arrangement mixdown outputs. WAV samples and decoded FLAC samples are checked against source PCM; MP3 decodes to stereo audio with expected duration and nonzero content. The browser decoder may resample the source, so duration checks allow a one-frame difference; silence checks treat negative floating-point zero as silence.

The journey closes/restarts the app, exports the complete Crux, takes its original Project Folder offline, imports into a fresh Garden, compares PCM/arrangement/output bytes, and continues editing with the native effect menu. The fresh profile's native welcome dialog is dismissed normally. Input-fixture ingestion and the static preview refresh finish before starting the agent turn.

Evidence:

- `native-audio.png`: native waveform after agent/manual work and trimming.
- `portable-audio.png`: further manual editing after complete import into a fresh Garden.
- `selection.wav`: native stereo 16-bit selection output.
- `waveform.mp3`, `waveform.flac`: native encoded full-waveform outputs.

Six native tests also cover actual asynchronous FX completion/failure, discarded stale renders, original channel selection, native output delivery, stale waveform/history guards and repeated channel selection. Host tests cover command validation, portable PCM, template packaging, shared-source equality and FLAC Cruxspace transfer. The existing AudioMass desktop regression covers native session export/import, manual/agent track rename, save conflict and restart.

Verified 2026-09-14: the existing native desktop regression passed in 22.1 seconds; the expanded depth journey passed in 1.3 minutes. Both evidence screenshots were visually inspected. All 1,094 host tests, typecheck, lint and production build pass, as do the six native tests and Electron verification. The initial full app verification reached a stale host expectation after passing the bundled checks/builds; after correcting the expectation, all failed and remaining stages were rerun successfully.

This verifies the waveform family, not whole-app certification or a live-model capability rating. Track/clip construction and arrangement, markers, advanced processing and session tools remain open in the root Tool Depth plan. Existing Project Folders and older demo packages are not automatically upgraded to these sources.
