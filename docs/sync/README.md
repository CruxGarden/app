# Sync pull preserves the garden

The original `SyncPane` called `window.location.reload()` 800 ms after import. The desktop regression reproduced that reload and the loss of another workspace's unsent Collaboration draft.

Pull now downloads and checks the incoming Crux identity before closing anything, saves the affected workspace's editors, stops its writers through the existing lifecycle, imports, and reopens it. `CruxBuilder` observes workspace lifetime changes so its provider and local editor state belong to the reopened workspace. Other Cruxes remain open. Ingestion validates a cached folder against the Crux’s current registered folder, so late events from a replaced folder cannot rewrite the imported metadata. Pull settles pending filesystem notifications before replacement. Pull feedback survives the replaced workspace; reopening does not steal focus from a different active Crux.

Evidence:

- `electron/e2e/sync-preserves-workspaces.spec.ts`: push a file, make local changes, keep an unsent draft in a second Crux, pull the first, check the cloud content and unchanged document, then check the draft.
- `electron/e2e/multi-crux-lifecycle.spec.ts`: save/close/reopen and app shutdown/relaunch membership.
- `src/services/ingestion.test.ts`: a cached old folder cannot rewrite a Crux after its Project Folder changes.
- `src/services/sync-pull.test.ts`: mismatched archive identity, writer closure before replacement, failure reopening, and preserving a newly selected workspace.

The original desktop regression failed; the initial fix preserved drafts but the stronger content check exposed stale ingestion. After fixing that mapping, all three desktop checks passed together (31.5 s). App verify passed 1,327 tests in 224 files, plus bundled-tool gates and build. Final logs: `/private/tmp/crux-sync-final-verify.log`, `/private/tmp/crux-sync-final-e2e.log`.

Existing limitation: the Task archive importer rejects replacement of an existing Crux. This change does not implement that separate import mode. Real cloud sync acceptance remains separate from these local mock-API journeys.
