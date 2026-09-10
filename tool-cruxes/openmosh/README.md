# OpenMosh effects in Crux Garden

Import PNG, JPEG, WebP or GIF (up to 4 MB / 16 megapixels), combine Pixelate, Posterize, Scanlines, Kaleidoscope, Mirror and Data Bend, then export PNG. Outputs fit within 1400 × 1000; the original image stays intact. This is an image-effects workspace using six genuine upstream GLSL fragments, not the complete OpenMosh video/timeline editor.

Try asking the agent: “Inspect the effects, then make a restrained four-level posterized treatment.” Available App Tools: `inspect_effects`, `set_effects`. The app must be open in Workshop. Commands inspect/change the same project as the manual controls, and success means the save was acknowledged.

The editable document is `data/project.json`; app source and local runtime are separate Artifacts. Changes save automatically with Growth. Save now retries a failed save. Reload saved project loads external changes and asks before discarding a live draft. Conflicting saves preserve that draft. Export buttons save first.

Export Crux preserves the complete editable project and private Collaboration, Tasks and Growth. App-specific downloads are a separate result. Website sharing is not enabled for this local tool. Use Customize app to change source in a Task.

Selected shaders from OpenMosh f49c27bb6bd475efe6db0c1596d6d65362e4ee90, under MIT. Exact selection and source path are in vendor/provenance.json. No upstream audio analysis, media exporter, fonts or other shaders are included.

Garden adapter sources use `shared/LICENSE.md`. Runtime metadata includes package versions and reproduction details. The pinned build recipe and lockfile live in the Crux Garden app repository under `tool-cruxes/`.
