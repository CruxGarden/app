# PlayCanvas Editor in Crux Garden

Upstream: https://github.com/playcanvas/editor
Revision: 9a1e4c63c18ca13ef97c27be0204852afa0ec99c (Editor 2.32.0).
Editor license: MIT; see LICENSE. Engine: PlayCanvas 2.22.1, pinned in package-lock.json.
Dependency licenses and notices: runtime/THIRD_PARTY_NOTICES.txt.
This independent adaptation is not an official PlayCanvas product or endorsement.

This is the actual PlayCanvas visual editor, adapted for one local scene. Native
hierarchy, inspector, entity transforms and undo remain upstream behavior. The
local catalog supports render primitives, cameras, lights and classic script
components. Supported assets are images, materials, classic .js scripts, text,
JSON and folders. The bundled Monaco editor edits local originals; upstream's
sandboxed parser extracts script attributes. Launch runs the saved scene and
original assets using the pinned PlayCanvas engine.

Garden saves native scene, settings and asset metadata as fingerprinted Artifacts
referenced by data/project.json, with original bytes stored separately. Unchanged
originals are reused. Browser storage is not the project home. Undo stacks and
live preview execution are transient; Growth preserves confirmed project saves.
Complete Crux export carries this editor, editable source and project data together.
App Tools can inspect the scene, name the project and rename an existing entity.

The adaptation replaces hosted persistence and code collaboration; it does not
reproduce the PlayCanvas backend. ESM/TypeScript compilation, GLB/model conversion,
other component types, multiple scenes, multiplayer, hosted asset store and hosted
build/publishing features are outside this first local version. The existing 3D
Workshop engine demonstration remains a separate template. Whole-editor website
sharing is unavailable; a standalone game export is not implemented yet.

Rebuild on Node 22.22+: npm ci --ignore-scripts && npm run build:garden.
The runtime is generated from the included source, lockfile and build scripts.
Debug source maps are omitted from the Crux payload; a rebuild regenerates them.
No hosted credentials or telemetry upload are needed for a build.

The local provider harness covers editing, original import, code editing,
save/reload and scripted launch in an isolated file-backed host. Real desktop
acceptance covers native undo/redo, an agent edit, scripted launch, complete Crux
export and independent import with the original Project Folder unavailable. The
source carried in an imported Crux also rebuilds successfully. App and Electron
verification pass. Full upstream typecheck still has existing diagnostics at the
pinned revision; the comparison adds none. See the root repository's
docs/PLAYCANVAS-EDITOR-INTEGRATION-NOTES.md for evidence and scope limitations.
