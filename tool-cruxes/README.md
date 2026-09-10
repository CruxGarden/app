# Local tool sampler

Four built-in Cruxes demonstrate manual creation and optional agent assistance:

| Add Crux         | Category                | Editable document                                    | Export       |
| ---------------- | ----------------------- | ---------------------------------------------------- | ------------ |
| OpenMosh effects | Images / effects        | Original image plus effect stack                     | PNG          |
| Tables           | Business / productivity | Project tracker, contacts or inventory               | CSV          |
| Sample sequencer | Music                   | Four acoustic pads, sixteen steps, tempo and volume  | Pattern JSON |
| 3D Workshop      | Interactive 3D          | PlayCanvas objects, transforms, colors and animation | Scene JSON   |

Each uses the existing per-Crux App Tool registry. The shared browser session acknowledges saves, serializes commands and retains drafts after conflicts. Each app still supplies its own model, controls, runtime and commands. Source customization belongs in a Task; `data/project.json` is project content. OpenMosh imports live separately under `data/assets/<sha256>.<extension>`, so changing an effect does not duplicate its image in Growth.

These are local tools. App-specific exports produce a result; Export Crux preserves the complete editable Crux, including private Collaboration, Tasks and Growth. Website sharing is disabled for these tools. They do not require Git, remote accounts or a CDN at runtime. Agent calls still use the configured provider.

## Rebuild and checks

From `app/`, run `npm run test:tool-sampler`. It installs the exact lockfile, checks app scripts, tests model/CSV behavior and builds the local runtimes. `npm run verify` includes this command. Runtime provenance is recorded beside each vendor bundle and in `runtime-provenance.json`; PlayCanvas's upstream browser ESM distribution is copied unchanged. OpenMosh extraction is separate: `node tool-cruxes/scripts/extract-openmosh.mjs /path/to/pinned/OpenMosh` verifies its revision before extracting the selected original shaders.

PlayCanvas Engine 2.22.1, smplr 1.0.0 and Tabulator 6.5.2 are pinned. Each has its MIT notice. Four VCSL sample files retain CC0 and source hashes. OpenMosh shaders and PlayCanvas skills retain pinned revisions and MIT notices. These files accompany each created Crux. `shared/LICENSE.md` covers the Garden-authored adapter. Existing Cruxes are not automatically replaced by a newer bundled template.

Real desktop journeys: `cd electron && npm run test:e2e -- e2e/tool-sampler.spec.ts`. They exercise manual edits, scripted Collaboration through actual commands, native exports, conflicts and restarts. smplr checks actual nonzero audio; PlayCanvas inspects actual entity bounds and renders two views. See `app/docs/tool-sampler/` for evidence and known limits.
