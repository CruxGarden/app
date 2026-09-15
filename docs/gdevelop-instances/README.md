# GDevelop scene-instance collaboration regression

2026-09-15. Verified scene-instance editing checkpoint; broader GDevelop authoring remains incomplete.

The six new scene tools inspect, select, transform, duplicate and delete placed objects and navigate native scene-instance history. The existing add-instance operation now uses the same native history and renderer refresh path. GDevelop has sixteen dedicated App Tools in this checkpoint.

The desktop journey interleaves native property editing with scripted collaborator calls, checks that a stale command preserves the complete instance JSON, and confirms fresh transforms preserve the person's Y coordinate. It checks visible native property values, native Undo/Redo, duplication identity, deletion, tool Undo/Redo and existing insertion through history. It repeats the sequence after complete Crux import into a fresh Garden with the original Project Folder unavailable. `native-calls.json` and `portable-calls.json` record the commands and results; each sequence expects 23 scene calls, including one deliberate stale-state refusal.

The surrounding regression also covers original sprite import, native Top-down movement and keyboard playback, inspection/discovery, editable project ZIP reimport, independently booted web-game ZIP, conflict/reload, restart, clean complete-Crux import and further native editing. Final 3D acceptance requires the real native toolbar, a rendered Mesh in game preview and no captured page/debugger crashes.

## Bugs found while exercising shared editing

- Native compact property edits changed the canvas without notifying Garden that the project was dirty. Forwarding SceneEditor's existing `unsavedChanges` prop to EditorsDisplay restores the native save notification path.
- Garden's runtime tsconfig omitted GDevelop's JSX factory `h`, producing calls to an absent React global in its native 3D editor/debugger. The native compiler/DOM regression reproduces the error before the fix and renders/dismisses the debugger after it. No React runtime dependency is added.
- Earlier canvas-only 3D assertions could pass despite those errors. An intermediate exit-zero run was rejected; the final desktop test requires native controls and rejects captured crashes. The Garden preview launcher now disables upstream crash-report uploads, whose attempted requests were blocked by the isolated test.

## Verification and limits

Full app `npm run verify` passes: all bundled gates/builds, ten native GDevelop tests, 1,104 host tests across 188 files and the production build. Electron `npm run verify` also passes. The final desktop journey passed in 3.6 minutes (3.7 minutes including runner setup), with both 23-call sequences and exactly one intentional stale-state refusal in each. The native and imported edited screenshots show X=123, preserved manual Y=77/88, dimensions 96×80 and opacity 78%. The final preview screenshot shows the original sprite and the default black 3D Box. The native 3D toolbar is asserted before opening that preview; the screenshot alone is not its evidence. No captured page/debugger crashes occurred. Three resource-load 404 console messages remain in the run log without an identified resource URL; do not describe this as a console-error-free run. No upstream crash-report request was observed.

Run logs: `/tmp/crux-gdevelop-instance-release-verify.log`, `/tmp/crux-gdevelop-instance-electron-release.log`, `/tmp/crux-gdevelop-instance-desktop-release.log`. The test runner cleaned two old temporary Gardens and retained its newest three according to the existing cleanup policy.

This uses the deterministic mock model through the real Collaboration execution path. It proves the exercised integration behavior, not a real model's discovery, creative judgment or recovery. Scene history is distinct from object/event history. Manual instance changes are captured as a separate history baseline before a tool step; this does not add comprehensive history to native property fields themselves.

Object/behavior revision, scene/layer organization, nested event/variable authoring, atomic resource preparation and richer visual/debug feedback remain broader coverage work. Stored 3D transforms are supported by the command schema, but comprehensive agent-driven 3D authoring is not established. Existing Project Folders and exported demo packages require deliberate refresh to use the new runtime.

Root status and next work: [GDevelop assessment](../../../GDEVELOP-INTEGRATION-ASSESSMENT.md), [selected-app readiness](../../../DEMO-READINESS-PLAN.md).
