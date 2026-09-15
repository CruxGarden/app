# Live Figma collaboration — 2026-09-15

This trial uses the actual disposable Figma file `1UGF8VTtWSz0D3pjGvOWwf`, the installed Figma desktop app on an Apple Silicon M3 Mac, and the official remote Figma MCP. No Figma source changes or client impersonation. The person's existing Explore/Cultivate design was untouched.

## What actually worked

1. Codex's Figma connector created native editable event artwork (`3:2`). Daniel changed SATURDAY to EDITED in Figma; fresh inspection found that exact change. A shared revision (`5:2`) preserved it.
2. **Crux Garden's own Collaboration provider, Claude Code**, inspected that file, created `Garden-agent revision` (`6:2`), changed its appearance and uploaded local `garden-stamp.svg`. Figma imported the SVG as editable vector/text objects (`6:15`–`6:17`).
3. The same Garden provider session resumed after a test-harness interruption, inspected the existing nodes and placed the badge inside `6:2`, preserving `EDITED · 10 AM\nThe community garden`. The final PNG visibly contains the badge, accent rule, rounded corners and pot shadow.
4. The agent downloaded the MCP-rendered image to `figma-output.png` in its Project Folder and wrote a transfer receipt. The actual 960×720 PNG is 48,234 bytes, SHA-256 `a9564ddaadb4e10308e1d595e9df241613ce0a7189a4ee07827498a2b17778e4`. Its bytes were visually inspected and are present in Main and Growth. A reopened Garden displays the saved reply and tool history.
5. The earlier real `5:2` export passed Garden's companion import → Cruxspace asset copy → live Astro route with exact byte equality, plus portable two-member package export (15.4-second desktop journey). The same transfer check for the Garden-agent image also passed in 15.4 seconds; see `agent-transfer/`.
6. A real native Mac test arranged Garden at 420×1084 beside Figma and restored Garden's original 1400×900 bounds exactly. A later edge-position regression was reproduced and fixed (see below). Accessibility was enabled. This does not certify Windows/Linux, multiple Figma windows or full-screen arrangements.

## Important limits

The final **`download_assets` call was refused by Figma's Starter-plan read limit**. `figma-output.png` came from the successful **`get_screenshot` MCP render**, downloaded by the Garden agent; it is not falsely labeled a successful `download_assets` export. A final metadata recheck of the source frame was also refused. Earlier source inspection and the actual bounded clone/edit calls provide preservation evidence; a final full source comparison, native Undo/Redo and stale concurrent-write handling remain untested.

[Figma's current access documentation](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/) lists up to 20 read calls/month for Starter accounts. The POC demonstrates capability, not unlimited access. Other Garden Collaboration providers have not been connected to Figma. Growth preserves local files, exports and conversation, not Figma's remote canvas/history.

The local file arrives in Artifacts automatically. Advertising it as a Cruxspace output currently uses the companion's explicit file import; the agent does not automatically register it with Garden's output service. That transfer retains honest `file-import` provenance and the chosen source frame.

## Setup, interventions and cost

- Separate Claude Code Figma authorization was required; Daniel approved it. His Codex authorization did not cover the Garden provider.
- Claude Code 2.1.177 rejected the configured model; the official updater installed 2.1.272. The next Garden read succeeded (97.6 seconds including approval wait; reported cost $1.04).
- Daniel approved tools in Garden's normal Collaboration banners. The test initially tried to answer an already-resolved banner and interrupted the write trial. Native revision/upload remained. The resumed turn completed in 153.6 seconds with reported cost $0.69. Cost for the interrupted write turn was not recovered; those two figures are not a total trial cost.
- A second harness issue read only Main's current message segment, missing the completed reply after it moved into Growth. Corrected the evidence reader; the persisted transcript was present. The final restart inspection passed in 3.8 seconds without another paid model call, including image fingerprints in Main and Growth and reopening the image through Artifacts.
- Approval handling now matches tool and exact summary and tolerates direct human resolution. Daniel's repeated-approval feedback is retained in the root POC/UI plans; no blanket permission bypass was added.
- The generated Figma Project Folder guide had incorrectly described a website. It now explains the external canvas, local exports, MCP workflow and Growth boundary. Its focused guide suite passes all 17 tests.

## Evidence

- `figma-output.png`, `garden-stamp.svg`, `roundtrip.json`: final image, original upload and sanitized agent receipt.
- `garden-agent-turn.json`: saved resumed Garden turn and actual tool results, with temporary asset URLs, account details and local paths removed. The interrupted first turn is not presented as a complete recorded tool trace.
- `garden-agent.png`: reopened Garden with the actual saved Collaboration turn. Refreshed after final UI changes; shows the saved reply, Artifacts and returned image.
- `garden-gathering.png`, `botanical.svg`: earlier real Codex/Figma exports, kept separate from the Garden-agent result.
- `garden-companion.png`, `cruxspace.png`, `astro-page.png`, `transfer.json`, `figma-to-astro.cruxspace`: initial real-image transfer evidence. Exporting this package does not back up the remote Figma canvas.
- `window-arrangement.json`, `arranged-companion.png`: actual native placement/restore trial.

Opt-in desktop journeys live in `electron/e2e/figma-agent-live.spec.ts`, `figma-asset-trial.spec.ts` and `figma-window-live.spec.ts`. They use isolated Gardens. The agent trial spends real provider usage and requires reviewed decisions; default test runs skip it. `CRUX_FIGMA_AGENT_INSPECT=1` with a prior workspace receipt only inspects the saved result, without sending another agent prompt. Do not rebuild the application while a desktop journey is running.

## Final verification and placement regression

Full app verification passes: all bundled gates/builds, 1,128 host tests/193 files and production build (1m26s). Companion fixture/420px layout passes in 5.7s, Garden-agent image Cruxspace/Astro transfer in 15.4s, and saved-turn/image/Growth restart inspection in 3.8s. The images were visually inspected. `preservation.json` records identical Main/Growth fingerprints.

A native placement rerun found macOS clamping Figma’s width at the right screen edge: x828/width900 could not grow to1296 before moving to x432. Two real failures established the cause; shrink-if-needed → move → resize fixes placement, restoration and rollback. The instrumented fixed trial passed in 6.8s, with exact desired Figma bounds; temporary diagnostics were removed. `window-fit-regression.json` records before/after evidence. Restoration now also checks Figma’s returned bounds rather than only Garden’s position.

Final native rerun after diagnostic cleanup: **6.7s passed** (7.0s total). Electron `npm run verify` passes. No deployment or publication occurred.
