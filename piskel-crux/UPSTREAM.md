# Piskel in Crux Garden

Actual Piskel 0.15.2-SNAPSHOT pinned to a6b9c02daefceb10093f71e92d52d16920ccb16e from https://github.com/piskelapp/piskel (reviewed 2026-09-11). Keep the Apache-2.0 LICENSE and bundled source/license notices.

The native pixel editor, layers, frames, preview, undo and PNG/GIF/.piskel exports remain. Garden stores the native serialized document in data/project.json, replacing each PNG sprite sheet with an immutable data/assets reference. Reopening reconstructs the native serializer input and calls the original deserializer. Pixel sheets deduplicate in the Blob Store and travel through Growth and complete Crux archives. No backend replica.

Embedded beforeunload warnings defer to Garden’s flush and conflict handling. The Garden save footer confirms persistence and retains drafts on external conflicts. The initial scoped agent command changes animation speed through the native controller. Saved status is acknowledged only after Garden saves. Native browser backup/gallery storage is separate; native file imports and exports remain. Whole-editor publishing is unavailable.

Build with Node 22.22+ and npm ci --ignore-scripts / npm run build. Source, lockfile and dest/prod runtime are packaged with each Crux. Browser preferences and separate local sprite libraries are not part of the portable project. Limits: 100 layers, 2,000 frames per layer, 4,096-pixel dimensions and 64 million total layer pixels; native export/canvas limits may be lower. Original encoded imported files are represented by editable native pixels, not separately retained.

Runtime CSS is packaged as raw text so Garden’s build cannot redirect icon/font URLs outside the Crux. This also applies to rebuilt Cruxes; previously created projects can rebuild from their packaged source to recover native stylesheet URLs.
