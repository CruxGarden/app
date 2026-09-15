# Kan board and card tool depth

Status: this board/card depth iteration verified (2026-09-14); whole-app coverage remains open.

Kan exposes 22 App Tools, up from four. Added operations cover card detail inspection, board creation/settings, lists and their ordering/removal, card details/due dates/duplication/removal, labels and assignment, and checklists/items. They use native local model operations and shared command sequencing, with fresh state tokens for the new mutations. Unrelated fields, manual rich descriptions, original attachments and native activity stay intact.

Native duplication resets checklist completion and omits comments/attachments. Kan has no native Undo: saved version recovery uses Garden Growth. Inspection remains bounded; comment/member/attachment management, templates, board/label deletion and larger-board pagination are still open tool families.

The scripted desktop journey `electron/e2e/kan-depth.spec.ts` exercises an agent-created launch board, manual rich text and attachment, targeted due date, labels, checklist completion/rename, native duplication semantics, list reordering and soft deletion. It then restarts, exports a complete Crux, makes the source Project Folder unavailable, imports into a clean Garden and continues manual editing. It verifies original bytes and native records. Screenshots are produced at `native-card.png` and `portable-card.png`; the absence of an artifact means the run has not reached that step.

The existing `electron/e2e/kan-app.spec.ts` covers native forms, outside-writer conflict/discard, draft preservation, attachments, complete import and rebuilding the packaged source. Native model tests cover invalid/stale operations, native ordering and activity, label consistency, tombstones and portable restoration. The embedded provider harness covers drafts, navigation guards, confirmed saves and original bytes.

These deterministic checks assess execution and persistence, not real-model planning or visual judgment. No live provider, publish or deployment is part of this acceptance.

## Verification

Full `npm run verify` passed all bundled checks/builds, 1,096 host tests and production build. Subsequent desktop acceptance reproduced a native checkbox staying unchecked after an agent completed its item, despite the 1/1 badge and saved model being correct. `ChecklistItemRow.tsx` now uses existing optimistic query state rather than redundant component state. After that final correction: nineteen native tests, native typecheck/build, host typecheck/lint, ten focused host/packaging/shared checks and production rebuild pass. Electron verification passed. This is a full gate followed by targeted verification of the UI correction, not a second full catalogue gate.

Final desktop existing native/conflict/restart/import/source-rebuild journey passed in 47.4 seconds; new board/card/manual-formatting/checklist/restart/clean-import/manual-continuation journey passed in 51.5 seconds. Both screenshots were visually inspected, including the checked box and retained native activity. The depth test disables the generic mock landing-page checker, whose deliberate missing-heading scenario is unrelated to Kan; it directly checks saved records, rendered controls and portable originals instead. The first test also needed its paragraph locator distinguished from matching activity entries.

A subsequent full gate exposed a manual-click timing gap in the direct-query-only checkbox fix. A temporary local override now remains until the rendered native query value acknowledges it (or clears on failure); clearing at invalidation completion was too early because React notifications are batched. The native browser and provider proofs pass with this refinement. The final full app gate passes all bundled checks/builds, 1,097 host tests and production build; the final desktop depth journey passes in 51.8 seconds, including manual toggles after clean import. Both regenerated screenshots were visually inspected. The Calendar pass shares this final verification build.
