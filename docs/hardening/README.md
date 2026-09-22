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
