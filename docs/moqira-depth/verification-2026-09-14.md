# Moqira native tool depth — 2026-09-14

Eighteen App Tools now use the actual editor's model/history: catalogue and bounded inspection; screen and component organization; scoped geometry/style/text/options; selection, mode and interactive links; original PNG/JPEG/WebP Artifact bytes; native Undo/Redo; complete editable `.moq` (JSON) output. Tool batches retain unspecified manual fields and make one native history step. Drafts, locks, missing IDs, stale revisions, inbound screen links and project size are guarded. No whole-project replacement is used to simulate an edit.

Verification:

- Full app `npm run verify` passed all bundled checks/builds, 1,100 host tests and production Vite build before desktop corrections. Final corrections pass host typecheck/lint, all 1,101 host tests (187 files), 30 Moqira native tests/build and production build. Electron `npm run verify` passes.
- Existing native desktop/public-edition/conflict journey passed in 21.3 seconds after the save-state correction. It includes independent source installation/build and private-screen exclusion.
- Final depth journey passed in 42.7 seconds: scripted collaborator creates; a person edits; targeted agent revision preserves text; screen/link editing; native Undo/Redo; original image bytes; unfinished draft refusal; interactive link traversal; native editable output; restart; complete export; original Project Folder unavailable; clean-Garden import; useful manual continuation. Both final screenshots were inspected. A test-only shorter final headline fits the native fixed-height text box.
- Focused host/shared/output tests include byte preservation through Cruxspace transfer and complete export/import. Native tests include atomic invalid batches, lock and stale-state refusal, image loading races, size limits and save acknowledgements retaining newer manual edits.

Desktop testing first exposed an old saved-state value causing false save failures/view-switch refusal. The saved snapshot now updates before scheduling the next React state; the native binding reads the acknowledgement directly. A separate failed-then-passing unit regression covers the old Save callback overwriting newer manual edits. Desktop output testing then exposed the absent native MIME: `application/x-moqira+json` / `.moq` now follows the existing output/transfer pattern.

Limits: scripted tests are not a live-model usability evaluation. Public-edition configuration tools, rendered design output and alignment/distribution conveniences remain follow-ups. Existing Project Folders are not automatically upgraded. The UI layout audit retains native toolbar/right-edge clipping. See root MOQIRA-INTEGRATION-ASSESSMENT.md, DEMO-READINESS-PLAN.md and ADR 0040, plus moqira-crux/UPSTREAM.md for the narrow upstream touches.
