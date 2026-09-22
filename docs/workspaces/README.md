# Saved workspace layouts

Settings → Workspace layouts saves named panel arrangements and applies them to the current Crux. Split direction, proportions and panel visibility are retained; the arrangement does not navigate, replace files, discard conversation drafts or close collaborator runtimes. Reusing a name replaces the saved arrangement. Delete removes only the saved arrangement. Up to 64 arrangements are stored in the garden's local settings.

The `workspace_layouts` tool exposes list/save/apply/delete to the built-in collaborator, Keeper and opted-in external MCP clients. It uses the same validation and service as the UI. A Crux collaborator targets its own workspace; garden-wide agents target the selected workspace. Embedded editors flush before panels unmount; a failed save keeps the existing layout.

Validation (2026-09-22): app `npm run verify` passes 1,388 tests/234 files and build; Electron verify passes. Unit regressions cover invalid/duplicate/recursive trees, retained draft/editor state and failed-save protection. The real desktop `workspace-layouts.spec.ts` passes (9.2 s): UI save → MCP inspect/save → UI apply → second Crux → retained original draft → MCP restore → UI delete → restart. The initial restart check sent the Settings shortcut before workspace restoration mounted its handler; it now waits for the restored workspace before invoking the shortcut.

This is reusable panel geometry, not yet full saved project/session bindings. Supporting panels, the bar/navigation redesign and WWW browser are subsequent work tracked in the root ROADMAP.
