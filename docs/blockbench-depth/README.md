# Native model workflow

Status: workflow verified, 2026-09-14.

The scripted collaborator creates an editable Generic Model plant stand from a group and three cubes, including a temporary part that is moved and deleted. A person undoes/redoes deletion, renames the shelf, creates a native texture and paints it. The next agent turn widens only the shelf, preserving every other element field and media fingerprint, then saves embedded BBModel and glTF outputs. Native geometry Undo/Redo, restart, complete Crux export/import with the original Project Folder unavailable, and further manual editing/Undo are exercised.

Six native validation/model tests and eleven host/shared/service/packaging tests pass. Full app verification passed all bundled checks, 1,090 host tests and the production build; Electron verification passed. After the final hierarchy-preservation guard, the existing desktop regression passed in 45.4 seconds and the new complete workflow in 50.9 seconds. The latter checks exported glTF geometry bounds, embedded media, exact preservation of other native element fields and media fingerprints, native Undo/Redo and portable manual continuation. Exported model and native/import screenshots were visually inspected.

The native save copy omits hierarchy, so the stale-part guard additionally checks parent and child identities. A regression covers manual reparenting while the pre-save is pending. The adapter refuses to continue on stale state rather than overwriting that edit.

Testing kept the scripted creation turn within the app’s existing ten-round limit and corrected the test to read group names from the native BBModel groups table rather than its hierarchy-only outliner. No application limit or upstream model format was changed. Tool descriptions follow native model-coordinate and pivot conventions. See `blockbench-crux/UPSTREAM.md` for integration hooks and upgrade checks.

The initial geometry tools target Generic Models and cubes/groups. Texture painting and animation creation remain native manual workflows; other model formats keep their native editor tools. Native Undo is transient. Runtime changes ship in newly created Cruxes. This is scripted integration evidence, not a live-agent evaluation or full model-editor coverage.
