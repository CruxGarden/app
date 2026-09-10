# Sample sequencer in Crux Garden

Tap an acoustic sample pad, toggle sixteen steps and press Play pattern. Set tempo and volume, stop playback and export pattern JSON. Four local kick/snare/hat/clap samples are included. Edits stop playback; agent commands never start sound. WAV recording, arbitrary sample import and a full DAW are outside this first instrument.

Try asking the agent: “Inspect the pattern, set the tempo to 128 BPM and keep the existing rhythm.” Available App Tools: `inspect_pattern`, `set_pattern`. The app must be open in Workshop. Commands inspect/change the same project as the manual controls, and success means the save was acknowledged.

The editable document is `data/project.json`; app source and local runtime are separate Artifacts. Changes save automatically with Growth. Save now retries a failed save. Reload saved project loads external changes and asks before discarding a live draft. Conflicting saves preserve that draft. Export buttons save first.

Export Crux preserves the complete editable project and private Collaboration, Tasks and Growth. App-specific downloads are a separate result. Website sharing is not enabled for this local tool. Use Customize app to change source in a Task.

smplr 1.0.0, MIT, in vendor/. Four pinned VCSL samples, CC0, in samples/ with original paths and SHA-256 hashes. The adapter supplies explicit detune/filter/release defaults because this version's flat-buffer converter includes undefined values when options are omitted.

Garden adapter sources use `shared/LICENSE.md`. Runtime metadata includes package versions and reproduction details. The pinned build recipe and lockfile live in the Crux Garden app repository under `tool-cruxes/`.
