# Mermaid Live Editor in the Workshop

Actual Mermaid Live Editor with Garden project saves, source-editing agent tools and native SVG/PNG exports. The desktop test exercises manual source edits, clearing the editor, bookmarking a diagram, agent edits, exports, external conflicts, reload and restoring a native history entry after a full restart.

- `mermaid-workshop.png`: native editor after loading an external diagram change.
- `mermaid-reopened.png`: bookmarked diagram restored from native history after restart.

Validation: app/electron verify gates, 104 native Mermaid tests, 909 host tests, actual Electron Playwright and a rebuild from an app-created Crux's packaged source. See `mermaid-crux/UPSTREAM.md` for the pinned source and scope.
