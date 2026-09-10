# Local tool sampler: desktop evidence

Created in the real Electron Workshop using isolated gardens and the scripted AI provider. The commands themselves, iframe bridge, file saves, Growth and runtime execution are real. This proves integration; it does not measure a live model's ability to choose good creative settings.

| Add Crux         | Category                | Try manually                                              | Try asking the agent                                 | Evidence                                                                                                   |
| ---------------- | ----------------------- | --------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| OpenMosh effects | Images / effects        | Import an image, combine effects, export PNG              | Inspect the effects and use four-level posterization | [Workshop](openmosh.png)                                                                                   |
| Tables           | Business / productivity | Edit a tracker; try contacts/inventory; import/export CSV | Set the first task to Ready and estimate nine hours  | [Workshop](tables.png)                                                                                     |
| Sample sequencer | Music                   | Toggle steps, press Play, set tempo                       | Keep this rhythm and set 128 BPM                     | [Workshop](smplr.png)                                                                                      |
| 3D Workshop      | Interactive 3D          | Add/select shapes, edit position/color                    | Make the Sunstone orange and add a blue cube         | [Isometric](playcanvas.png), [front](playcanvas-front.png), [actual entity bounds](playcanvas-bounds.json) |

All four use `data/project.json`, separate app source/runtime Artifacts, the shared confirmed save session and per-Crux App Tools. OpenMosh original images are independent content-addressed Artifacts. Downloads save first. Full private Crux archives preserve runtime, project, Collaboration, Tasks and Growth; these local tools do not offer Share website. Git is not required.

The desktop tests cover creation through Add Crux, actual manual controls, scripted inspect → change → inspect in Collaboration, saved files, native file exports, conflicting external edits with draft retention, explicit reload and a full app restart. OpenMosh preserves imported bytes and renders all six selected shaders. Tables exercises cell edits, column creation, filtering and CSV imports with quoted commas/leading zeros. smplr checks nonzero real audio and silent restart. PlayCanvas inspects actual semantic roots/render bounds and two camera views. External HTTP requests are blocked during creation operations to catch accidental runtime dependencies.

The four integrations are deliberately bounded: six OpenMosh image effects rather than its full video timeline; tables rather than spreadsheet formulas; four included acoustic samples rather than a DAW; primitive scene editing rather than the hosted PlayCanvas Editor. JSON music/scene exports remain editable data, not rendered audio or a packaged game. Existing customized Cruxes keep their sources when templates change.

## Inspection and fixes

Desktop verification caught and corrected custom-protocol iframe startup, runtime packaging, smplr's omitted numeric defaults, and native export test handling. Screenshot inspection caught unreadable table heading inputs and shadow acne in the initial PlayCanvas lighting; the styles and shadow biases were corrected. Source-image file controls stay within the sidebar. The CSV-import journey exposed a shared save race: acknowledgements now identify the request's own bytes even if an external edit is ingested during Growth creation. A deterministic regression reproduces the former incorrect fingerprint and verifies that the next write retains the external content.

The captured PlayCanvas roots are separate: Sunstone at `[0, 1, 0]`, Blue tower at `[-2, 1, 0]`, and an added cone at `[3, 1, 2]`. The tower rests on the ground (gap 0); the sphere and cone are suspended (gaps approximately 0.3 and 0.5). This is a free-placement editor without physics constraints. Their measured peer bounds do not intersect. Both camera views were inspected; no imported model calibration is involved.

## Follow-up candidate

Daniel's AM-1 (`/Users/daniel/Workspace/zacos/am-1/am-1-machine.html`) is a strong generative-composition candidate. Preserve its original UI/sound engine, connect serialize/apply patch state to Artifacts, and add focused composition commands. It was inspected read-only, not integrated or audio-tested in this sampler.

## Final verification — 2026-09-10

App `npm run verify` passed: 91 service/AI files / 884 tests, plus Notes (7), Moqira (21), One Big Sky (164), Cardinal (5), sampler model/CSV (4), typecheck, lint and builds. Electron `npm run verify` passed. All 22 focused desktop journeys passed in 7.3 minutes without retries or skips after the acknowledgement-race fix. The scripted provider exercises the real App Tools and persistence path; live-provider creative judgment and the complete desktop suite were not tested. Runtime and sample hashes match provenance. Older automatically regenerated demo fixtures were restored.

Logs: `/private/tmp/crux-tool-sampler-verify-final.log`, `/private/tmp/crux-tool-sampler-electron-verify.log`, `/private/tmp/crux-tool-sampler-app-journeys-final.log`. The deterministic before/after race evidence is in `/private/tmp/crux-tool-sampler-save-race-red.log` and `/private/tmp/crux-tool-sampler-save-race-green.log`.
