# miniPaint inside Crux Garden

Source: https://github.com/viliusle/miniPaint
Version: 4.14.3, commit a79733eb803fc97084ef0ee4faa96b031e69e1c0.

The original editor, actions, effects, layered JSON and raster exporters are retained. Garden adds a save/reload bar, captures the native document and stores raster pixels separately. Native JSON export reconstructs inline pixels from the editor as usual. App source and rebuildable runtime accompany each Crux.

Changes: Garden startup/bridge, scoped layer agent operations, runtime output directory, native document validation. The envelope lives in data/project.json and raster references in data/assets. Current bounds: 500 layers, 8192 pixels per side and 32 megapixels per canvas/raster layer. This is not a large-document performance guarantee.

Native image imports retain the editor's decoded pixels in lossless PNG form, not the original camera file or all original EXIF metadata. External Google font discovery remains an upstream online feature; custom fonts are not currently packaged into the Crux. Use locally available fonts for offline projects. Native exports are available; whole-editor website/Explore distribution is not enabled by this integration.

The top-level code is MIT; retain MIT-LICENSE.txt, upstream helper notices in src/js/libs and dependency notices. Bundled third-party helpers and optional assets retain their own terms. A complete public distribution audit is separate work.
