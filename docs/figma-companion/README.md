# Figma companion — 2026-09-15

The isolated Electron fixture journey passes in 5.7 seconds against the verified production bundle. It creates the Figma Crux Type, refuses an invalid link, saves a canonical frame reference, imports an SVG with explicit `file-import` provenance and checks the companion at 420 pixels wide. Both screenshots were visually inspected; no page errors were captured. The narrower header/footer and stronger companion background improve readability while preserving Mood styling.

This fixture test never contacts Figma. Separate [live evidence](../figma-live/README.md) records Garden’s Claude Code native edits, local SVG upload, returned MCP-rendered image, Growth/restart persistence, real-image Cruxspace/Astro transfer and native Mac arrangement. Figma’s Starter read limit refused the final dedicated export call; the returned PNG is clearly attributed as a successful MCP screenshot render.

Full app `npm run verify` passes: all bundled gates/builds, 1,128 host tests in 193 files and production build (1m26s). Electron verification passes. The guide now describes the external canvas and local assets accurately; the companion explains the supported Claude Code plugin/authorization path without claiming every provider is connected.

This is a working local POC with further UX work: repeated per-action approvals, manual registration of downloaded files as Cruxspace outputs, native Undo/Redo and concurrent-edit acceptance remain explicit follow-ups.
