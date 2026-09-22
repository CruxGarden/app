# Saved workspace layouts

Settings → Workspace layouts saves named panel arrangements and applies them to the current Crux. Split direction, proportions and panel visibility are retained; the arrangement does not navigate, replace files, discard conversation drafts or close collaborator runtimes. Reusing a name replaces the saved arrangement. Delete removes only the saved arrangement. Up to 64 arrangements are stored in the garden's local settings.

The `workspace_layouts` tool exposes list/save/apply/delete to the built-in collaborator, Keeper and opted-in external MCP clients. It uses the same validation and service as the UI. A Crux collaborator targets its own workspace; garden-wide agents target the selected workspace. Embedded editors flush before panels unmount; a failed save keeps the existing layout.

Validation (2026-09-22): app `npm run verify` passes 1,388 tests/234 files and build; Electron verify passes. Unit regressions cover invalid/duplicate/recursive trees, retained draft/editor state and failed-save protection. The real desktop `workspace-layouts.spec.ts` passes (9.2 s): UI save → MCP inspect/save → UI apply → second Crux → retained original draft → MCP restore → UI delete → restart. The initial restart check sent the Settings shortcut before workspace restoration mounted its handler; it now waits for the restored workspace before invoking the shortcut.

This is reusable panel geometry, not yet full saved project/session bindings. Supporting panels, the bar/navigation redesign and WWW browser are subsequent work tracked in the root ROADMAP.

## Mood and Crux Synth panels

Both are ordinary panels with close/toggle controls, Mood-defined names/colors and saved-layout participation. Built-in/outside agents discover their stable `mood` and `synth` IDs through the existing show/layout tools. Mood has the existing section views; the standalone Synth uses the same instrument store as Mood → Sound. Closing its controls leaves audio running. Synth grids respond to their container width.

App gate: 1,388 tests/234 files/build. Real desktop `supporting-panels.spec.ts` passes (8.6 s): opens controls beside the current Crux, starts actual audio, closes/reopens the Synth without stopping it, changes harmony in Mood and sees the other panel update, then saves/closes/restores the arrangement. [Screenshot](supporting-panels.png) was visually inspected. An initial static token-coverage check needed the new pane families registered in its dynamic-prefix pattern; no unused tokens were exempted individually. The bar still shows closed-panel toggles; its discovery redesign and multi-panel fitting remain separate work.

## Settings and Explore panels — 2026-09-22

The existing Settings and Explore interfaces can now sit beside work as ordinary panels, with stable `settings` and `explore` IDs, Mood names/styles, saved-layout participation, and existing modal entry points retained. Settings grids respond to pane width; Explore filters wrap. These are the existing account/preferences/search services, not parallel settings or catalog implementations. Search filters are transient, as in the existing Explore modal; saved layouts store geometry.

The whole-garden `show` schema previously advertised a hardcoded list missing Mood/Synth/WWW. It now uses the same panel registry as validation and the UI, including Settings/Explore. A schema regression and actual outside-MCP discovery/opening cover the mismatch.

The first expanded desktop journey passed live changes, search, modal parity, agent discovery, draft preservation and responsive grids, then reproduced a persistence gap on immediate restart: explicit named-layout apply reused the 300 ms drag debounce and older 75/25 geometry survived. Explicit applications now persist immediately and await queued SQLite writes; dragging remains debounced. Final app verify passes 1,390 tests/235 files/build and Electron verify passes. Four desktop journeys pass together (34.9 s): original Explore search, new supporting panels, Mood/Synth panels and saved layouts. The new panel journey (10.3 s) includes immediate restart with the correct proportions, real mock-API searches, shared modal settings, outside-MCP discovery/opening and preserved Collaboration draft.

[Settings and Explore at a narrower window](settings-explore-panels.png), visually inspected. The screenshot waits for Plasma’s backing canvas to finish its existing resize debounce before capture; the first immediate screenshot caught an intermediate frame whose surface borders lagged the controls. No Plasma implementation was changed.

Fresh ad-hoc macOS arm64 package passes five journeys together (53.7 s): Synth actual audio/UI/MCP/Mood/restart 14.9 s, Settings/Explore panels 11.2 s, Mood/Synth panels 8.0 s, saved layouts 8.6 s and WWW 10.5 s. These are isolated profiles and a local mock API, not production-service acceptance or a notarized release. Logs live under `/private/tmp/crux-hardening-20260922/`: `settings-explore-final-verify.log`, `settings-explore-electron.log`, `settings-explore-final-desktop.log`, `settings-explore-package.log`, `settings-explore-packaged.log`.
