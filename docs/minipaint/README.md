# Actual miniPaint in Workshop

The `minipaint-app` creation choice packages miniPaint 4.14.3, its native editing interface, rebuildable sources and runtime. The Garden bar adds save/reload; native image and layered JSON exports remain in File.

The native layered document is preserved inside `data/project.json`. Lossless raster pixels are stored as separate fingerprinted Artifacts. Shared native asset operations and the existing Working Copy bridge provide conflict detection, Growth and complete Crux archive persistence. There is no Git dependency. Agent tools inspect the open document and update layer name, opacity or visibility using the editor's native undo actions.

The isolated Electron journey in `electron/e2e/minipaint-app.spec.ts` exercises native image import and rename, a scripted Collaboration turn through actual app tools, PNG and layered JSON downloads, external-edit conflict, explicit reload and full restart. Service tests exercise Growth restoration, complete archive round trip and scoped operations. The mock verifies the integration, not a live model's decision quality.

Source provenance and limits are in `minipaint-crux/UPSTREAM.md`. Original camera file bytes/EXIF are not archived separately from decoded lossless pixels; custom online fonts are not bundled. Public website/Explore editor distribution and new cross-tool transfers are separate work.

Screenshots: `minipaint-workshop.png` and `minipaint-reopened.png`.
