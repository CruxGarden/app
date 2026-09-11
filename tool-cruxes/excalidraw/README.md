# Whiteboard

Draw with the native Excalidraw editor in Workshop. Use shapes, text, arrows, freehand lines or imported PNG/JPEG/WebP/GIF images. Save now confirms the current document in Garden; Reload saved project offers to discard an unsaved draft. Export drawing produces an editable `.excalidraw` file; PNG and SVG produce images.

`data/project.json` preserves the scene and selected app settings. Image bytes live separately in content-addressed `data/assets/` Artifacts. Selection and viewport are transient. This first version allows 2,000 scene elements, 40 images, 4 MB/16 megapixels per imported image, and a 2 MB project document. Embedded websites are not supported. Native undo is an in-session convenience; Growth is the durable history.

Agents can use `inspect_whiteboard` and `upsert_whiteboard_elements` while this Crux is open in Workshop. Supported agent shapes are rectangles, ellipses, diamonds, text and simple arrows. Inspection returns the first 100 elements and the total count; use `read_file` for the complete document. Agents should inspect first, preserve existing IDs, and check the confirmed result.

Runtime: Excalidraw 0.18.1 and React 19.2.4. Local fonts and dependencies accompany this Crux. `vendor/THIRD-PARTY-NOTICES.md` and `vendor/provenance.json` retain notices and hashes; the Liberation fallback is the OFL-licensed 2.1.5 version recorded beside them. Garden's adapter uses `shared/LICENSE.md`. Source customization belongs in a Task. Export Crux preserves the complete private editable project; website sharing is not implemented for Whiteboard.
