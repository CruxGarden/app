# Figma companion foundation — 2026-09-15

The isolated Electron journey `electron/e2e/figma-companion.spec.ts` passes in 7.1 seconds (11 seconds total). It creates the Figma Crux Type through the picker, refuses an invalid link, persists a canonical file/frame reference, and imports an SVG fixture with its source reference and explicit `file-import` provenance. The screenshot was visually inspected; no page errors were captured.

This is a fixture-based Garden UI test, not a live Figma MCP trial. It does not contact Figma, prove that Figma authored the fixture, arrange native windows or certify the narrow companion layout. Service tests separately verify Cruxspace asset transfer and complete Crux export/import preservation.

Full app `npm run verify` passes, including 1,127 tests across 193 files and the production build. Electron `npm run verify` passes. Live MCP editing, manual-edit handoff, native macOS arrange/restore, real exported asset reuse in Astro, and narrow-window acceptance remain pending.
