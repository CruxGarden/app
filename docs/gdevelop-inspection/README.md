# GDevelop inspection and native capability discovery

2026-09-14. Verified inspection/discovery foundation; broader game-authoring coverage remains open.

The ten-tool adapter retains the existing seven mutating/export operations, expands `inspect_gdevelop`, and adds `read_gdevelop_content` plus `list_gdevelop_capabilities`. It can inspect scenes, global/scene objects and variables, placed instances, nested events, layers, animation/behavior configuration and resources without replacing the native document.

Inspection is paginated and labels large entries as summaries. Exact native JSON can be read at returned pointers in bounded text chunks, with content Fingerprints guarding against changed content between chunks. Native paths and indexes can change after structural edits. Metadata search includes free, object and behavior instructions; exact instruction results expose parameter order and code-only slots. Metadata text is bounded, truncated defaults/extra information are flagged, and lists over twenty parameters explicitly report incompleteness. Native capabilities do not imply a dedicated Garden editing command for every result.

The expanded `electron/e2e/gdevelop-app.spec.ts` creates a Sprite and movement behavior using the native UI, then runs seven **scripted mock-model** inspection/discovery calls through Collaboration. It checks actual returned behavior/instance/parameter values and byte-equivalent native game JSON before/after. It repeats those checks after complete Crux export and import into a clean Garden with the original Project Folder unavailable. The existing native editing, both ZIP exports, independent exported-game playback, conflict/reload, restart, post-import editing and 3D preview assertions remain in the journey.

Evidence produced by a passing run: `native-calls.json`, `portable-calls.json` and corresponding screenshots. The visible model picker shows the configured default, but the journey explicitly uses `CRUX_AI_MOCK=1`; no paid/provider model is exercised. These prove tool integration, preservation and portability. They are not a real-model discovery/usefulness trial. Native-engine unit tests separately use the actual pinned WASM engine to check nested events, behavior/instance reads and instruction metadata, plus bounded reads and changed-content rejection.

Remaining work includes scoped scene/instance/object/behavior/event editing, fresh mutation guards, native refresh and history, and prevalidation of resource/animation operations. The shared command runner now sequences the bridge and keeps reads from forcing a save; it does not repair those outstanding mutation behaviors. This is a verified inspection foundation, not a completed general game-authoring slice.

## Verification

- Full `npm run verify` in `app/`: passed all bundled checks/builds, 1,102 host tests across 187 files, and the final production build (1m 19s).
- `npm run verify` in `app/electron/`: passed. Final host typecheck and focused lint passed after the test additions.
- Six GDevelop native tests passed, including three new tests against the pinned native engine. Host/shared-runner validation and portable-source packaging checks passed in the full gate.
- Expanded desktop regression: **passed in 2.1 minutes**. Fourteen new scripted tool calls (seven before export and seven after clean import) returned valid inspected data and left the native game JSON unchanged. Existing native editing/playback, both ZIP exports, independent web-game playback, conflict/reload, restart and post-import 3D editing/preview also passed.
- Both new screenshots and call-result files inspected. The portable screenshot was captured before the final save-status assertion; that assertion subsequently passed. No new diagram/model generation or provider call is implied by this read-only exercise.

Logs for this run: `/tmp/crux-gdevelop-inspection-verify.log`, `/tmp/crux-gdevelop-inspection-electron.log`, `/tmp/crux-gdevelop-inspection-native.log`, `/tmp/crux-gdevelop-inspection-host.log`, `/tmp/crux-gdevelop-inspection-desktop.log`.
