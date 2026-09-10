# Slow Sky in the desktop Workshop

Create **Add Crux → Cardinal Drone** on desktop. Start sound explicitly, use the six controls, or open the rack to edit the same live patch. The included presets are Blue Hour, Low Orbit and Glass Garden. Custom presets and rack edits save to `music/instrument.json` with Growth.

Open Collaboration and try “Make the drone darker and more spacious.” The agent can discover `inspect_instrument`, `set_instrument_controls` and `select_instrument_preset`. These update the real engine and await a confirmed save. See [the shared App Tool adapter contract](../embedded-app-tools.md).

- `instrument.png`: the instrument in Workshop.
- `rack.png`: the actual Cardinal module/cable view.
- `agent-controls.png`: the scripted test model invoking inspect → controls → inspect through Collaboration. This is integration evidence, not a live-provider quality demonstration.

The desktop journey in `electron/e2e/cardinal-crux.spec.ts` verifies nonzero audio after Start, silent initial/reopened state, manual macros, an actual rack mouse edit, a saved custom preset, both agent mutations, a conflicting external edit with draft preservation, explicit reload and full application restart. Service tests additionally exercise the document's archive round trip and scoped writes.

This development integration has a curated module selection. It does not provide recording/exported audio, sample players, arbitrary VCV plugins, native Rack hosting or website/Explore publication. Use the instrument's **Save now** and Garden's Crux export; the upstream rack's native archive menu is not the supported save path for this build. Runtime source/build provenance and licenses are under `cardinal-crux/engine/` and `cardinal-crux/licenses/`. Exact artwork permissions and a distributable Corresponding Source archive remain release work.
