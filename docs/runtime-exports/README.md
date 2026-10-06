# Runtime references in private archives

Verified 2026-09-21 against the real Electron app, using its bundled Calendar.

- Created an event, exported both modes, inspected the ZIP manifests and omitted blobs.
- Reference archive: 170,246 bytes. Included archive: 358,752 bytes (this small Calendar example, not a general size promise).
- Restart preserved the export preference. Imported the reference archive into a fresh isolated garden and edited its event successfully.
- `export-options.png` shows both current-file size estimates. They exclude compression/history/metadata; the actual archive sizes above include them.
- `imported-calendar.png` shows the imported, editable Calendar.

Implementation preserves user content, modified tool files, licensing and Growth. Exact SHA-256 references are resolved from installed/bundled tools before destination changes. Unavailable files fail with an actionable message; automatic/recovery backups include their tools.

Validation: `npm run verify` passed 1,340 tests plus tool checks and production build; Electron `npm run verify` passed. `runtime-exports.spec.ts` passed. Unit coverage includes plain Cruxes, Tasks, Cruxspaces, whole-garden backups, missing/different tools, installed-only tools, modified code and shared document bytes.

Legacy starters without a tool manifest remain self-contained. No automatic download is attempted by archive import.
