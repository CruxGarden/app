# Notes sharing layout evidence

2026-09-10. Real isolated Electron journey in `electron/e2e/notes-sharing-layout.spec.ts`.

- Settings shows Single-page reader (default) and Separate page per note.
- Changing layout flushes the pending rich-editor note to its Project Folder.
- Selecting a public note after the settings change retains layout and the other selections.
- The native publish build emits separate HTML for nested Unicode note paths. Each page contains only its own body, and no hydrated reader island.
- Public navigation, direct reload and images work with script requests blocked. Private notes and frontmatter are absent from build output; private links have no anchor.
- Switching back preserves selection, removes obsolete note pages from dist and restores reader search.
- Service tests additionally exercise Growth, Task isolation, complete archive roundtrip, stale writers, failed flushes, historical-view guards and older reader compatibility.

`settings.png` and `separate-pages.png` are inspected screenshots using test fixture text. `evidence.json` records the completed assertions. The refreshed `../notes-crux/field-notes.crux` demo includes the new reader source and remains in default single-page mode.

Validation: app `npm run verify` passed (87 service test files / 868 tests; Notes 7 tests and Moqira 21 tests, standalone checks/builds, app typecheck/lint/performance compilation/build). Electron `npm run verify` passed. Two real desktop journeys passed in 1.1 minutes: Notes regression 43.9 s and sharing layouts 20.7 s. No public deployment or complete desktop-suite claim.
