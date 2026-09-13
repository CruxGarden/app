# AM-1 Arpeggio Machine in Crux Garden

Source: Daniel Stepp's `am-1-machine.html` from the ZACOS line (`/Users/daniel/Workspace/zacos/am-1/`, file dated 2026-08-15), the "first public software release" of that open-hardware roster: a three-part interlocking arpeggio instrument, a single file, Web Audio, no dependencies. `AM-1-HANDOFF.md` and `AM-1-VOICING.md` are its design notes; the SVGs and mockup are its panel studies. License: Daniel's, to be stated with the ZACOS release (not yet declared in the source).

This is the instrument as written, with one change of packaging: `index.html` is `am-1-machine.html` with its inline script moved to `am-1.js` so the Garden bridge can restore a session before the instrument reads its own storage. `am-1-machine.html` stays as the untouched single file.

- `garden/bridge.js`: the instrument keeps its session in four localStorage keys (`am1.active` the named active patch and its live values, `am1.era` the circuit, `am1.patches` the saved bank, `am1.manual`). Inside a Crux the saved session goes into those keys before the instrument loads, every write it makes to them (its own 3-second persist, saves, deletes, imports) marks the project dirty, and a confirmed save writes them to data/project.json. A recorded bounce (.wav) or an exported patch (.json), which the instrument would download, is kept in the Crux as a binary Artifact and listed under `files`. A bottom bar shows the save state. Outside a Crux the bridge only loads the instrument.
- `garden/document.js`: validation of that session record.
- App Tools: inspect (patch, key, scale, tempo, circuit, running, parts, saved patches, files), set the tempo, set the key and scale. They change the patch the way a loaded patch does and never press RUN.

The Mailchimp signup in the manual and the ZACOS link stay as written. Nothing to build.
