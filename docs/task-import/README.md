# Replacing a Crux with Tasks

Verified 2026-09-21. A private Task archive can replace an existing Crux through import or cloud pull. Main, each Task, their Growth and local Store are restored under their original identities. Workspaces belonging to the replaced Crux are saved and closed first; other open Cruxes remain intact. New Project Folders keep the old files available.

Before mutation, every archived blob and identity is checked. The original local graph, including review state and folder mappings, is restored if removal, insertion or folder projection fails. This is exception rollback, not a claim of crash-atomic database replacement.

Validation:
- App `npm run verify`: 1,345 tests, bundled tool gates, production build.
- Five focused tests: replacement, projection failure, corrupt blob, foreign identity collision, interrupted deletion.
- Four existing desktop Task journeys passed (independent files/previews, merge/restart, concurrent built-in turns, Claude Code isolation, verification candidates).
- Both `sync-preserves-workspaces.spec.ts` checks passed together: ordinary pull preserves another workspace's draft; Task graph pull restores distinct Main/Task contents in the editor and real files.
