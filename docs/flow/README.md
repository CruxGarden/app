# Flow and Mood typography — 2026-09-21

Flow is the activity envelope behind colour, brightness and iridescent rims. Mood controls persist on/off and sensitivity; only Plasma enables it by default, at 50%. A minute of sustained work gently builds the glow; after stopping, it lingers and settles over the next minute or two. Off means the normal Mood appearance. Motion off clears activity.

Creative input includes writing, arranging panes/windows, Artifacts, Crux creation, collaborator streams, tool calls and external edits. Desktop native input also contributes while a cross-origin Workshop frame has focus. Only activity kinds are reported, never typed contents or pointer coordinates. Burst coalescing prevents floods from becoming flashes.

Latest typography decision (supersedes the first title pass): Inter for interface titles and prose, JetBrains Mono for monospace, Cormorant Garamond only for the logo. Mood application normalizes old saved font overrides; the title-font picker is removed. Plasma and Soft pane labels use 13px Inter. Outfit and Press Start are removed from the host bundle; Growth labels/card initials and the app appearance bridge follow the shared fonts. Creative documents and embedded tools retain their own type choices. Idle keyboard hints remain removed.

Plasma surfaces appear immediately by default using the library's existing `formIn={false}` support, including older saved Moods. An explicit Mood Builder override can opt back in. `formOut`, Flow and the material remain independent.

Original Flow validation: app `npm run verify` passed (1,322 main tests plus the bundled tool checks); Electron `npm run verify` passed. Ten desktop checks passed together: `flow.spec.ts` (2), `mood-title-font.spec.ts` (1), `garden-mcp.spec.ts` (1), `mcp.spec.ts` (2), `mcp.unit.spec.ts` (4).

Flow tests cover defaults, controls, normal appearance when disabled, actual writing, a scripted collaborator's work, fade and restart persistence. The frame test dispatches native Electron input while a Workshop frame has focus; its independent CDP edit confirms the frame remains editable. It does not assert delivery of every native character under background test execution. State tests cover sensitivity extremes, minute-scale rise/release, burst coalescing, refresh rates and coinciding integration rates.

Screenshots: `flow-quiet.png`, `flow-awake.png`, `flow-settings.png`, `mood-title-font.png`. These are isolated test gardens. Collaborator tests use the deterministic mock model; human judgment of the minute-scale feel remains in the manual plan. Restart the desktop shell to pick up the native input hook.

Latest verification: app `npm run verify` passed 1,354 tests plus tool checks/build; Electron `npm run verify` passed. The revised `mood-title-font.spec.ts` and existing `functions-local.spec.ts` passed together (2/2, 17 seconds). Typography checks cover old saved font overrides, logo/body/pane/modal/monospace faces, Plasma and Soft switching, exactly three registered font families, and no observed `data-plasma-forming` entrance. Screenshot inspected: `mood-title-font.png`.
