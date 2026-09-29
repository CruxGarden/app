# Crux Garden: The Zen of Vibecoding

A small garden adventure that exercises **real** Crux Garden Tasks, collaborators,
review/Merge, attention, Notes, Media Tools and Calendar. No network services,
framework, paid assets, telemetry or automatic agent turns. Open `index.html` in a
Crux preview. Keep the guide in **Main** when checking results.

The six stepping stones are replayable and navigable in any order. The intended
path starts with one Task and introduces one new idea at a time. Supplied prompts
name exact outputs and boundaries. Users choose their own provider and initiate
turns; normal provider charges apply. Selecting two different agents is optional
when only one is configured, and the limitation should be recorded.

The game reads actual Artifacts served by its current preview and validates their
shape. It has no privileged host bridge: it cannot prove a file was made by an
agent, inspect other Cruxes, or observe notifications. Clearly labelled observation
checkboxes record the player’s report. Do not treat them as automated integration
evidence. A Blocked journal entry is preferable to pretending a lesson worked.

Journal/progress live in browser storage **for this preview origin**. Download the
journal before switching profiles, changing preview addresses or clearing storage;
restore it with the journal’s file picker. Restore preserves existing observations.
It does not write back into the Project Folder. Export the Crux separately to keep
its artifacts and Task history. PNG checks accept images up to 5 MiB; text lessons
are limited to 64 KiB.

The app's `electron/e2e/zen-vibecoding.spec.ts` exercises the first mission through
real Task creation, watcher ingestion, preview, review/Merge and archive export.
Its direct fixture file writes represent an agent's output; real provider behavior
is left to the hands-on lessons. `node --test examples/zen-vibecoding/game.test.mjs`
checks lesson validation and journal admission. Source is MIT under the parent
repository license; artwork is original inline SVG/CSS.

To make a copy from source, create a Blank Crux and copy `index.html`, `style.css`,
`app.mjs`, `missions.mjs`, `README.md` and the `garden/` folder into its Project
Folder. Open `index.html` in Workshop Preview. Only the supplied practice leaf
is pre-created; mission outputs must be made by the player.

After installing the app/Electron dependencies and building the app, run
`node --test examples/zen-vibecoding/*.test.mjs` (the browser test also needs the
Playwright Chromium binary). Run the desktop spec from `electron/` with
`npx playwright test e2e/zen-vibecoding.spec.ts --project=desktop`. It creates a
portable archive under the OS temporary directory’s `crux-zen-delivery/`; set
`CRUX_ZEN_DELIVERY` to choose a durable output directory. Only set
`CRUX_ZEN_PROFILE` when deliberately installing into a **new isolated profile**.
Do not point it at a real existing Garden.
