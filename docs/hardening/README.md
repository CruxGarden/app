# Desktop hardening and Crux Synth — 2026-09-22

This checkpoint implements four-track ambient Crux Synth and everyday Appearance controls, and fixes an independently reproduced recovery defect. It is local acceptance evidence, not a production release or a completed security audit.

## Changes and reproduced findings

- A process crash followed by offline edits left the SQLite Artifact index stale on restart, even though the Project Folder held the correct files. Reproduced twice. Startup now reconciles eligible folders with the index before services finish initialization. Disk is authoritative: changed/new files are ingested and confirmed missing files removed from the index, without writing over disk. Missing whole folders, ignored files and inaccessible paths are not treated as deliberate deletions. Four native tests cover these boundaries, including symlink escape refusal.
- Appearance provides text size (85–150%), accent and background colors, and a scoped reset in Mood → Theme. It uses the same theme tokens exposed to agents. An actual slider interaction caught React restoring the previous controlled value; synchronous state refresh fixed it. Restart and reset use the active Mood's real baseline.
- Crux Synth replaces in-app file playback with four evolving Web Audio voices (pad, bass, bell, air). Each track has voice, volume, brightness, movement and mute; root note, master volume, presets and play/pause are shared. Every bundled Mood receives a named patch. Saved Moods and JSON/ZIP imports retain patches. Legacy Moods receive a compatible fallback. The public website retains its file soundtrack.
- `get_synth` and `set_synth` use the same bounded patch schema and store as the UI, through the built-in and external MCP tool registry. Invalid patches are rejected before mutation. Agents cannot initiate sound before the person opts in. Fresh desktop gardens remain quiet until Play.
- Published Function isolation is a separate API change, commit `3fba1c5`; see `api/docs/hardening/FUNCTION-BOUNDARY.md` in the workspace. Local probes reproduced a Node vm callback escape and an ineffective synchronous timeout. The replacement uses private, copied host dispatch and per-call isolated-vm execution limits. No production deploy occurred.

## Verified evidence

- App `npm run verify`: 1,382 tests across 232 files, type/lint/performance checks, bundled-tool validation and Vite build pass.
- Electron `npm run verify`: TypeScript and native-source lint pass.
- API `npm run verify`: 642 passed, five existing skips; integration suite 209 passed with repository test doubles. Linux arm64 container build and network-disabled runner smoke pass.
- Desktop regressions pass for SIGKILL/offline edits/next Growth, Growth restore, workspace close/reopen, outside Garden MCP restart, Appearance, Crux Synth, AI-key masking/encryption/removal, Synth master controls and both Flow journeys (including creative input inside tool iframes).
- A real Codex provider, through ordinary Collaboration and Garden tools, created a file, preserved an external human edit, appended its continuation, produced Growth and retained the result across packaged-app restart (40.8 s). This test uses the configured local account; it is not the scripted model. Its initial retry corrected a test query referencing a nonexistent Artifact column.
- Packaged Settings key/sound/Persona checks and four Agent Host loopback/bearer/token rule tests pass together (7 tests, 31.8 s). Persona assertions were updated for the current default and assistant row markup; no Persona product behavior changed.
- Fresh macOS arm64 `.app`, ad-hoc signed via electron-builder: Appearance, crash recovery, Synth and a 20,000-file workspace with active audio pass together. This is not a notarized installer or auto-update acceptance.
- Synth's desktop test measures actual Web Audio analyser output, verifies mute/pause silence, round-trips outside MCP controls to the UI, saves/reapplies a Mood and verifies restart. Sound quality still needs human listening.

The checked screenshots are [Synth controls](crux-synth-controls.png) and [large Appearance text](appearance-large.png). These establish visible layout only; audio assertions come from the runtime test.

## Performance

[reconcile-benchmark.json](reconcile-benchmark.json) records native folder reconciliation on Apple M3 Pro, macOS arm64, recently created 1 KB files: unchanged 1,000/10,000/20,000 files took 209/1,610/3,644 ms; 1% changed/deleted/added took 187/1,792/3,474 ms. Peak RSS was 61/100/120 MB. Run `node docs/hardening/reconcile-benchmark.cjs` after building Electron to reproduce.

This is a warm-cache native scan, not full startup, cold-disk, sustained-memory or large real-project evidence. The scan currently occupies Electron's main thread; larger gardens need further responsiveness work before claiming that path scales without noticeable delay.

## Remaining release work

The broader hardening plan remains open: interrupted downloads/sync and upgrade acceptance, a fuller archive/permission review, prolonged multi-Crux use, other providers, and production account/catalog/publish/update paths. Function isolation retains native-process OOM risk and does not roll back already-dispatched host effects. Its deployment is outstanding. Existing nine-pane overflow needs the recorded workspace design decision. Production signing, migrations, account/billing/email activation and Daniel's manual/design review remain explicit release prerequisites. Windows/Linux builds do not establish runtime acceptance.

Tests use disposable `CRUX_USER_DATA`/`CRUX_GARDEN_ROOT` profiles and a static build. `CRUX_PACKAGED_APP` can target the packaged executable through the normal test launcher; do not rebuild while desktop tests run. `CRUX_LIVE_CODEX=1` explicitly enables the bounded real-account provider test. Session logs and Playwright traces remain in `/private/tmp/crux-hardening-20260922/`; no credentials or private provider payloads are included here.

## Empty-key Keychain stall — 2026-09-22

The final panel package exposed a main-thread stall when the first Collaboration turn read a missing provider key. The native sample reached `SecItemCopyMatching` / `SecKeychainItemCopyContent`: the renderer probed `safeStorage.isEncryptionAvailable()` before the native store checked whether any ciphertext existed. No system prompt was approved.

`getSecret` now asks the native store for the entry first; its existing absent-entry path returns without invoking OS encryption. Availability is still checked when migrating an actual legacy value or saving a key. Deletion removes ciphertext without requiring encryption availability. Native decryption, encrypted writes and the existing no-Keychain fallback remain in place; failed migration preserves the legacy value. No mock-model bypass was added: the original Collaboration tests exercise this shared fix. Reading an actual encrypted key can still require OS Keychain access and is not claimed to be prompt-free.

Four service regressions cover missing reads, native-value precedence, deletion while encryption is unavailable, and failed migration retaining its source. Three failed before the fix; all ten secret-service tests and seven key-service tests pass afterward. The real desktop `secrets-empty.spec.ts` drives an ordinary non-mock turn with no key, while guarding only OS crypto calls; it failed against the prior package (6.2 s) because an availability probe occurred. The actual renderer service, IPC and native file lookup remain exercised.

The first full gate also reproduced the previously recorded notebook test's late audio import. Its window stub allows snapshot cues to start an asynchronous audioStore import; the test now drains dynamic imports before teardown. Playback code is unchanged. The final full app gate passes 1,398 tests/236 files, bundled-tool gates and production build; Electron verify passes.

Logs and retained isolated fixtures/traces: `/private/tmp/crux-hardening-20260922/keychain-regression-before.log`, `keychain-before-packaged.log`, `keychain-before-packaged/`, `keychain-app-verify.log` (failed with the late import), `keychain-app-final-verify.log`, `keychain-electron-verify.log`, `keychain-package.log`, `keychain-final-packaged.log` and `keychain-final-packaged/`.

A fresh ad-hoc macOS arm64 package passes seven journeys together (1.0 min): original mock Collaboration create/version (9.4 s), hidden-panel continuation (8.3 s), actual Synth audio/UI/MCP/Mood/restart (13.8 s), picker/draft/keyboard (6.8 s), non-mock missing-key response with zero OS crypto calls (5.6 s), saved layouts (8.3 s), and WWW (10.4 s). The two original chat tests use the unmodified native secret bridge, unlike the explicitly guarded regression. This establishes the absent-key fix, not notarization, cross-platform behavior or an encrypted-key access policy change.

## Reject damaged Crux archives before replacement — 2026-09-22

Five new v1 archive regressions failed before the fix. Corrupt bytes under a legitimate SHA-256 filename overwrote the shared Blob Store in both clone and replace modes (direct blob reads returned the damaged bytes). Missing blobs and injected blob-write failures still returned import success; incomplete safety exports were also accepted before replacement. This was a data-integrity failure, not merely an error-message issue.

The v1 importer now validates fingerprint syntax, archive paths and content hashes, and persists each verified blob before mutating Crux metadata. Missing/corrupt blobs and write failures propagate. Replacement requires a complete safety backup; thrown export failures are no longer ignored. Validation expands one file at a time; a later failure may leave earlier verified, unreferenced blobs, but does not replace the existing Crux metadata. Task archives already validate blob hashes and continue through their existing implementation. Existing optional dimensions/version fallbacks remain covered.

App verify passes **1,403 tests/236 files**, bundled-tool gates and build; Electron verify passes. Five fresh ad-hoc macOS arm64 packaged journeys pass together (1.0 min): process-crash/offline-edit recovery 11.9 s, Synth actual audio/UI/MCP/Mood/restart 13.5 s, corrupted/missing/truncated cloud archive refusal + valid retry/restart + retained other draft 13.4 s, ordinary sync preserving another workspace 11.0 s, complete Task-graph replacement 11.2 s. Downloads come from the loopback mock API; no production sync or private data is involved. The disk-write unit test injects an error at the blob-write boundary; partial native filesystem writes and power-loss durability require their own check.

Evidence: `/private/tmp/crux-hardening-20260922/import-integrity-before.log`, `import-backup-before.log`, `import-integrity-focused.log`, `import-integrity-verify.log`, `import-integrity-electron.log`, `import-integrity-package.log`, `import-integrity-packaged.log` and the matching retained Playwright output directory. The full hardening programme remains open; these results are not a completed archive security audit or release acceptance.

## Native Blob Store interrupted-write protection — 2026-09-22

A packaged-main-process fault injection reproduced an existing blob being truncated to seven bytes when a write failed partway through. Native writes now write and flush a unique sibling temporary file, then atomically rename it over the destination. Failed writes/renames remove the temporary file without changing committed bytes. A hard process termination before rename may leave an unreferenced temporary file; power-loss durability of the directory entry and Windows/Linux runtime behavior have not been established.

Electron verify passes. Seven fresh ad-hoc macOS arm64 packaged checks pass together (1.5 min): partial-write/rename failures and retry 3.2 s, crash/offline-edit recovery 9.6 s, actual Synth audio/MCP/Mood/restart 13.5 s, damaged-download refusal/retry/restart 13.3 s, ordinary sync preserving another workspace 10.9 s, Task-graph sync 11.0 s, and 20,000-file workspace with active audio 27.9 s. The app source/build remains the preceding verified 1,403-test baseline; only native persistence changed. The large-workspace run logged one resource 404 while all behavioral/audio assertions passed; no blanket claim of console cleanliness. Logs/traces: `/private/tmp/crux-hardening-20260922/blob-durability-{before,electron,package,packaged}.log` and matching output folders. Fault injection uses a disposable database under the isolated profile, never personal data.
