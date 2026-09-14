# Editable banner workflow

The isolated desktop journey in `electron/e2e/minipaint-depth.spec.ts` creates a 1200×600 banner from a native rectangle, imported raster and separate headline/detail text layers. A person appends a note with miniPaint's Text tool. Scripted App Tools change the event date, revise typography, move a layer down/up and scale the canvas to 960×480. Existing raster pixels and manual text survive.

The journey uses native Edit → Undo/Redo to restore/reapply the entire canvas resize, checks PNG dimensions and background pixels, restarts, exports a complete Crux, takes the original Project Folder offline, imports into a clean Garden and continues native text editing with Undo/Redo. Final run passed 2026-09-14 in 42.3 seconds. The existing import/layer/export/conflict/restart journey passed in 23.0 seconds against the same final build. Full app verification passed all bundled checks, 1,084 host tests and the production build; Electron verification passed. Root TOOL-DEPTH-PLAN records scope and commit status.

`banner.png` is the PNG output; `native-editing.png` and `portable-editing.png` show the native editor before and after portable import. Images visually inspected. The small seed sprite is an existing test fixture, deliberately imported as an independent image layer. These are scripted integration results, not a live-model usability assessment.

Testing found an incorrect rectangle radius parameter (native rendering requires a number), corrected in the adapter. The external fixture write must finish ingestion/preview refresh before starting the test turn; otherwise that unrelated source refresh can interrupt the first command. Export success leaves an output-specific status. Native menu commands avoid the keyboard-focus ambiguity of sending a shortcut immediately after closing the host Collaboration pane.

Advanced masks, filters, arbitrary shapes, rich typography, remote image fetching and complete native command parity are outside this workflow.
