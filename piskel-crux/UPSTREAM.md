# Piskel in Crux Garden

Actual Piskel 0.15.2-SNAPSHOT pinned to a6b9c02daefceb10093f71e92d52d16920ccb16e from https://github.com/piskelapp/piskel (reviewed 2026-09-11). Keep the Apache-2.0 LICENSE and bundled source/license notices.

The native pixel editor, layers, frames, preview, undo and PNG/GIF/.piskel exports remain. Garden stores the native serialized document in data/project.json, replacing each PNG sprite sheet with an immutable data/assets reference. Reopening reconstructs the native serializer input and calls the original deserializer. Pixel sheets deduplicate in the Blob Store and travel through Growth and complete Crux archives. No backend replica.

Embedded beforeunload warnings defer to Garden’s flush and conflict handling. The Garden save footer confirms persistence and retains drafts on external conflicts. The initial scoped agent command changes animation speed through the native controller. Saved status is acknowledged only after Garden saves. Native browser backup/gallery storage is separate; native file imports and exports remain. Whole-editor publishing is unavailable.

Build with Node 22.22+ and npm ci --ignore-scripts / npm run build. Source, lockfile and dest/prod runtime are packaged with each Crux. Browser preferences and separate local sprite libraries are not part of the portable project. Limits: 100 layers, 2,000 frames per layer, 4,096-pixel dimensions and 64 million total layer pixels; native export/canvas limits may be lower. Original encoded imported files are represented by editable native pixels, not separately retained.

Runtime CSS is packaged as raw text so Garden’s build cannot redirect icon/font URLs outside the Crux. This also applies to rebuilt Cruxes; previously created projects can rebuild from their packaged source to recover native stylesheet URLs.

## Cruxspace outputs (2026-09-12)

The Garden bar gained “Save sheet to Cruxspace”: the whole animation rendered by the native `PiskelRenderer` into one PNG sheet (best-fit columns) and saved as a named output of the Crux, so other members of its Cruxspaces can use it. The `save_piskel_sheet` App Tool does the same for the collaborator. See `GAME-CRUXSPACE-PLAN.md` at the repository root.

## Native animated-sprite workflow (2026-09-14, workflow verified)

Eight App Tools cover bounded palette/pixel inspection, guarded pixel painting/erasure, native frame insertion/duplication/movement/deletion, animation speed and PNG sheet output. `src/garden/commands.js` validates the same inputs in host and frame; `sprite.js` uses `PublicPiskelController` for frame operations and `Frame.setPixel` plus one `PISKEL_SAVE_STATE` SNAPSHOT and `PISKEL_RESET` for each pixel batch. The manual equivalents are the native pen/eraser, frame controls, speed slider and sheet export. Inspection returns session-local frame IDs and version hashes; repaint requires the latest hash and preserves unlisted pixels. Reinspect after Undo/reopen. Runtime/save conflicts retain drafts and use the shared confirmed command lifecycle. Generated `src/garden/shared` copies ship with portable source.

Two narrow upstream history-codec corrections were required by native Undo acceptance:

- `src/js/utils/serialization/arraybuffer/ArrayBufferSerializer.js`: allocate the hidden-frame count field and hidden-frame string bytes; the former buffer truncated the PNG payload even with no hidden frames.
- `src/js/utils/serialization/arraybuffer/ArrayBufferDeserializer.js`: append the complete description and hidden-frame strings from their actual offsets; decode hidden indices as numbers and the empty set as `[]`.

`src/garden/history.test.mjs` executes the actual pinned codec and reproduces truncation before the fix. Recheck the byte round trip, description and zero/multiple hidden indices when pulling upstream; keep the actual drawing/Undo/Redo/PNG desktop journey as the acceptance gate. The Garden bridge wraps the existing history deserializer callback to wait for in-flight native Undo/Redo before capturing or executing another command. Keep this callback boundary in the upgrade check. No editor UI or history-service replacement.

Limits: painting is one layer/frame at a time, 1–4096 unique coordinates, opaque `#RRGGBB` or erasure, with the existing canvas size. Inspection is at most 32×32 pixels and 20 frame summaries per page. Native frame commands operate across all layers and preserve other pixels. A hidden frame must be shown before agent deletion because native removal does not remove its matching hidden index. Agent resize, layer management, transforms/effects, partial-alpha painting and GIF output remain outside this slice; native controls still exist. Speed changes retain the native behavior (no separate Undo step). Newly created Cruxes receive this runtime; existing Project Folders are not silently upgraded. Scripted workflow verification is separate from live-agent usability evaluation.

Verification: full app gate (1,088 host tests, bundled checks and production build), Electron gate, seven native model/command/history-codec tests, eleven focused host/shared/service/packaging tests, existing desktop journey (29.6 s) and the new pixel/history/output/restart/clean-import journey (49.5 s). Exported sheet and native/import screenshots inspected in `docs/piskel-depth` in the host app repository.
