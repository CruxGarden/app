# AudioMass Workshop evidence

Real isolated Electron journey: `electron/e2e/audiomass-app.spec.ts`.

Imports a generated WAV, applies native Reverse, imports a multitrack clip, asks the scripted agent to rename a track, exports WAV and native .amss, changes a native track name then reimports the session, exercises conflicting external edits, reloads and restarts. Confirms decoded waveform length and a sample match exactly after restart. Service tests separately verify Growth and complete Crux archive round trips with PCM bytes.

The editor resamples input to its audio context. Original encoded files/tags and the separate browser named draft library are not the saved Garden project. See `audiomass-crux/UPSTREAM.md`.

- audiomass-workshop.png: actual arrangement and Collaboration after explicit external reload.
- audiomass-reopened.png: the same project after full app restart.
- audiomass-initial.png: upstream welcome dialog, retained in the actual application.
