# miniPaint composition, painting and live adjustments

## Painting checkpoint — 2026-09-15

Five added tools bring miniPaint to fourteen: native brush strokes, layer duplication, eight live filter types with add/update/remove, arbitrary in-canvas crop and shared native Undo/Redo. The expanded desktop journey passed in 1.2 minutes: 27 scripted tool calls in the original Garden without errors and six after complete export/fresh import, with exactly one deliberate missing-filter refusal.

The journey checks changed rendered pixels, the exact painted stroke color, unchanged original raster references, independent editable brush data, manual text preservation, native/tool filter Undo/Redo, restart, and continued editing after the source Project Folder is taken offline and imported elsewhere. This uses a small existing seed sprite; it does not establish photographic quality, launch-demo visual polish or real-model judgment.

Evidence: `painted-banner.png` is the exported 920×440 image; `native-painting.png` and `portable-editing.png` show the native editor. `painting-calls.json` contains the 27 original calls and `portable-painting-calls.json` contains the six imported calls. All three images and both call records were inspected. The native screenshot catches the view-only Fit interaction marking the editor dirty; restart/import checks confirm the content survives. Dirty tracking for view-only gestures belongs in UI cleanup.

Full app verification passed all bundled gates, 1,112 host tests and the production build. The subsequent decoded-image duplication repair passed nine native tests/rebuilt runtime, host typecheck/lint/build and the final desktop journey; the final host typecheck/lint, all 1,112 tests across 191 files and Electron gate also passed. The first desktop run exposed the released-import-URL copy failure. The second reached portable continuation but the harness mistook an imported old completion for the new turn. The final harness waits for a new message identity and retains call evidence before manual edits move messages into Growth.

The adapter remains isolated in Garden modules and uses native actions. Live filter updates use Update_layer_action to preserve Undo correctly; the upstream manual filter-update dialog’s own Undo flaw remains a separate repair. Erasing, selections, fill, pressure/point revision, broader shapes/typography, merge/blending and retouching remain open.

## Earlier editable banner checkpoint

The isolated desktop journey in `electron/e2e/minipaint-depth.spec.ts` creates a 1200×600 banner from a native rectangle, imported raster and separate headline/detail text layers. A person appends a note with miniPaint's Text tool. Scripted App Tools change the event date, revise typography, move a layer down/up and scale the canvas to 960×480. Existing raster pixels and manual text survive.

The journey uses native Edit → Undo/Redo to restore/reapply the entire canvas resize, checks PNG dimensions and background pixels, restarts, exports a complete Crux, takes the original Project Folder offline, imports into a clean Garden and continues native text editing with Undo/Redo. Final run passed 2026-09-14 in 42.3 seconds. The existing import/layer/export/conflict/restart journey passed in 23.0 seconds against the same final build. Full app verification passed all bundled checks, 1,084 host tests and the production build; Electron verification passed. Root TOOL-DEPTH-PLAN records scope and commit status.

`banner.png` is the PNG output; `native-editing.png` and `portable-editing.png` show the native editor before and after portable import. Images visually inspected. The small seed sprite is an existing test fixture, deliberately imported as an independent image layer. These are scripted integration results, not a live-model usability assessment.

Testing found an incorrect rectangle radius parameter (native rendering requires a number), corrected in the adapter. The external fixture write must finish ingestion/preview refresh before starting the test turn; otherwise that unrelated source refresh can interrupt the first command. Export success leaves an output-specific status. Native menu commands avoid the keyboard-focus ambiguity of sending a shortcut immediately after closing the host Collaboration pane.

Advanced masks, arbitrary shapes, rich typography, remote image fetching and complete native command parity remain outside this workflow; supported live filters are covered by the newer checkpoint above.
