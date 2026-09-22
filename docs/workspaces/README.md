# Saved workspace layouts

Settings → Workspace layouts saves named panel arrangements and applies them to the current Crux. Split direction, proportions and panel visibility are retained; the arrangement does not navigate, replace files, discard conversation drafts or close collaborator runtimes. Reusing a name replaces the saved arrangement. Delete removes only the saved arrangement. Up to 64 arrangements are stored in the garden's local settings.

The `workspace_layouts` tool exposes list/save/apply/delete to the built-in collaborator, Keeper and opted-in external MCP clients. It uses the same validation and service as the UI. A Crux collaborator targets its own workspace; garden-wide agents target the selected workspace. Embedded editors flush before panels unmount; a failed save keeps the existing layout.

Validation (2026-09-22): app `npm run verify` passes 1,388 tests/234 files and build; Electron verify passes. Unit regressions cover invalid/duplicate/recursive trees, retained draft/editor state and failed-save protection. The real desktop `workspace-layouts.spec.ts` passes (9.2 s): UI save → MCP inspect/save → UI apply → second Crux → retained original draft → MCP restore → UI delete → restart. The initial restart check sent the Settings shortcut before workspace restoration mounted its handler; it now waits for the restored workspace before invoking the shortcut.

This is reusable panel geometry, not yet full saved project/session bindings. Supporting panels, the bar/navigation redesign and WWW browser are subsequent work tracked in the root ROADMAP.

## Mood and Crux Synth panels

Both are ordinary panels with close/toggle controls, Mood-defined names/colors and saved-layout participation. Built-in/outside agents discover their stable `mood` and `synth` IDs through the existing show/layout tools. Mood has the existing section views; the standalone Synth uses the same instrument store as Mood → Sound. Closing its controls leaves audio running. Synth grids respond to their container width.

App gate: 1,388 tests/234 files/build. Real desktop `supporting-panels.spec.ts` passes (8.6 s): opens controls beside the current Crux, starts actual audio, closes/reopens the Synth without stopping it, changes harmony in Mood and sees the other panel update, then saves/closes/restores the arrangement. [Screenshot](supporting-panels.png) was visually inspected. An initial static token-coverage check needed the new pane families registered in its dynamic-prefix pattern; no unused tokens were exempted individually. The bar still shows closed-panel toggles; its discovery redesign and multi-panel fitting remain separate work.
