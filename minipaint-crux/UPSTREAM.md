# miniPaint inside Crux Garden

Source: https://github.com/viliusle/miniPaint
Version: 4.14.3, commit a79733eb803fc97084ef0ee4faa96b031e69e1c0.

The original editor, actions, effects, layered JSON and raster exporters are retained. Garden adds a save/reload bar, captures the native document and stores raster pixels separately. Native JSON export reconstructs inline pixels from the editor as usual. App source and rebuildable runtime accompany each Crux.

Changes: Garden startup/bridge, scoped layer agent operations, runtime output directory, native document validation. The envelope lives in data/project.json and raster references in data/assets. Current bounds: 500 layers, 8192 pixels per side and 32 megapixels per canvas/raster layer. This is not a large-document performance guarantee.

Native image imports retain the editor's decoded pixels in lossless PNG form, not the original camera file or all original EXIF metadata. External Google font discovery remains an upstream online feature; custom fonts are not currently packaged into the Crux. Use locally available fonts for offline projects. Native exports are available; whole-editor website/Explore distribution is not enabled by this integration.

The top-level code is MIT; retain MIT-LICENSE.txt, upstream helper notices in src/js/libs and dependency notices. Bundled third-party helpers and optional assets retain their own terms. A complete public distribution audit is separate work.

## Shared command lifecycle, 2026-09-14

`src/js/garden/bridge.js` adopts the common serialized settle → validate → confirm pending edits → native action → settle → confirm result lifecycle. Layer updates continue through miniPaint's native Bundle/Update actions and Undo. `garden/shared/command-session.{js,d.ts}` and `project-image.{js,d.ts}` are generated copies of Garden's canonical `embedded-apps/shared/` helpers, synchronized before the host build and included in the portable source. Standalone builds need no parent-repository files. Review the action/capture hooks and run manual/agent/Undo/restart/export checks on every upstream update.

## Editable banner workflow, 2026-09-14

The bridge uses existing Insert/Update/Delete/Reorder layer actions for text, filled rectangles, image imports, geometry, exact text revision and layer ordering. Canvas resizing uses the native Update-config and Prepare-canvas actions; optional layer scaling is one native Undo transaction. Text remains native styled spans; exact replacement preserves unrelated spans. The native hidden text input loses focus before an agent command so the person's pending edit enters native Undo. Pending actions are awaited and the native renderer is flushed before capture/output. No new changes to upstream action or editor files are needed for this depth extension.

The image helper reads a relative PNG/JPEG/WebP Artifact (or an existing native raster reference) from this Crux's preview origin, refuses traversal and redirects, and bounds input to 32 MB and decoded dimensions to the project limits. Images stay separate editable layers with original pixel dimensions; native PNG capture preserves their pixels. Layer text supports local font families and wrapping, not the full native typography/effects catalogue. Crop/expand retains off-canvas layer content. Font scaling on nonuniform canvas resizing uses the smaller ratio. This is not arbitrary SVG import, remote-image fetching, masking, or full upstream command parity. Live filtering was added in the subsequent painting family below.

Upgrade checks: native text-span format and blur commit; Insert-layer behavior when supplied a decoded `link`; Update-layer rendering invalidation; Reorder direction; Prepare-canvas ordering; native layered JSON/raster capture and export. The desktop banner journey must exercise agent creation, manual text revision, agent continuation, native Undo/Redo, PNG output, restart and clean portable import. Its verification status is tracked in the root Tool Depth plan.

## Painting and live photo adjustments, 2026-09-15

Five additional App Tools expose constant-width brush strokes, layer duplication, live filter add/update/remove, arbitrary in-canvas crop and native session Undo/Redo (fourteen tools total). `garden/editing.js` owns validation and pure native-data preparation. The bridge applies existing Insert/Update/Prepare-canvas actions; no additional upstream editor files are changed. Brush points become native editable brush-layer data, not a flattened replacement image. Each call creates one independently movable/deletable stroke layer. Pressure variation, brush-point revision, selections, erasing, fill and retouching remain future families.

Supported live filters are brightness, contrast, saturation, hue rotation, blur, grayscale, sepia and invert. Their native renderer retains original raster pixels. Filter IDs, parameters, order, available ranges and native history availability are inspectable. Filter updates/removal preserve unrelated filters and their order. Use `Update_layer_action` with a cloned filters array: the upstream `Add_layer_filter_action.undo()` pops the last filter even after an update, so that action cannot safely serve this command's update/history contract. This does not repair the upstream manual filter dialog's own update-Undo behavior; review that separately before promising full manual filter-history coverage.

Duplication copies native data, retains position and omits private caches. Imported images can retain a decoded element after their temporary blob URL has been released; cloning that URL fails to decode. The bridge copies the original-resolution decoded pixels to a fresh lossless PNG-backed image element and awaits decoding before insertion. Cropping translates every layer, including hidden layers, and changes canvas dimensions in one Undo transaction; it retains off-canvas content and performs no resampling. Commands refuse active drawing drafts or native dialogs and refuse intervening edits during the confirmed pre-save. The desktop journey must validate pixel changes in output, untouched source pixels, native and agent history, manual text preservation, restart and fresh portable import. Deterministic integration testing does not establish real-model visual judgment or professional photo-editing quality.
