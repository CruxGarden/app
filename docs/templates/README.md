# Undertakings

Six reusable Cruxspaces are available from first-garden onboarding and Add Crux: make a home page, make a small game, write a short book, launch a small business, explore a question, and tell a family history. Each includes a planning notebook and an editable creation, a first task without an API key, a collaborator prompt, and a concrete finish line.

Starting fresh with the worked example beside it is the default. “Start from the worked example” clones the finished collection instead. Both use the ordinary `.cruxspace` importer, fresh identities and lineage; histories, members and content remain ordinary Cruxes. A failed restoration is rolled back. The outside MCP `create_cruxspace` tool exposes the same choices through `templateId` and `exampleMode`.

## Authoring and provenance

`cruxspace-templates/recipes.ts` is an authoring input, not a runtime lesson engine. The opt-in `electron/e2e/jobs/author-undertakings.spec.ts` opens a disposable garden, connects through the actual outside MCP interface, writes files, records successive Growth checkpoints, and exports the real collections. The bundled packages are in `public/cruxspace-templates/`.

The recorded histories are actual scripted edits by the example author. They are not invented conversations or evidence of an autonomous live-model session. Sample people, businesses and family memories are fictional; the research data is synthetic and explicitly cannot establish causation. Every reused starter retains its upstream license and attribution, including the Oxygenna/Foxi paid-version support link and Tigrana provenance.

## Acceptance

The desktop journey in `electron/e2e/undertakings.spec.ts` creates a starter and separate worked example without an API key; runs a deterministic collaborator turn through normal tools; makes a manual edit; plays every Walkthrough milestone; restarts; and exports/imports the edited collection into another clean garden. The book also builds and inspects a real EPUB. The game is played to completion and the research chart is checked against changed CSV data.

`electron/e2e/jobs/publish-undertakings.spec.ts` connects an outside MCP client to an isolated garden and the local API. It requests publication, clicks the ordinary visible publication approval, and opens the API's actual published files in a separate browser. This tests native builds and real local storage rather than a mocked publication response. It checks the business FAQ page too: this acceptance caught missing category fields that previously made Astro reject publication.

All six desktop journeys pass together (3.0 minutes), and all six local publication checks pass together (1.1 minutes). The outside-MCP/shared collaborator and desktop Gateway group passes (2 checks, 21.0 seconds). Screenshot review then found the business starter's unconditional animation class and its worked example's remaining placeholder headline; the layout and authored home page were corrected. The refreshed business publication and complete desktop journey both pass (50.3 seconds together). The final screenshots were visually reviewed.

Full app gate: 1,379 tests in 231 files, bundled-tool checks and build. Electron typecheck/lint passes. The business starter also passes its own Astro check and 13-page build. The template collaborator journeys use the deterministic mock model; real-provider quality and Daniel's manual/design acceptance remain separate.

Evidence logs: `/private/tmp/crux-six-undertakings-final.log`, `/private/tmp/crux-published-undertakings.log`, `/private/tmp/crux-garden-controls-final.log`, `/private/tmp/crux-v1-final-verify.log`, `/private/tmp/crux-business-build.log`, `/private/tmp/crux-business-final-acceptance.log`. `local-publications.json` records the local-only published Crux ids. Screenshots are grouped by undertaking below this directory.

## Run it

Use Node 22. Build the renderer from app with `CRUX_BUNDLE_TOOLS=bundled npx vite build`, then from app/electron run `CRUX_E2E_KEEP=1 npx playwright test e2e/undertakings.spec.ts --workers=1`. Set `CRUX_UNDERTAKINGS` to a comma-separated subset to reproduce one journey.

To refresh authored packages, set `CRUX_AUTHOR_UNDERTAKINGS=all` (or a comma-separated subset) and run `e2e/jobs/author-undertakings.spec.ts`. Rebuild the renderer afterwards so the desktop includes the refreshed archives.

To check publication, set `CRUX_PUBLISH_UNDERTAKINGS=all`, `CRUX_LOCAL_API=http://localhost:3001`, and `CRUX_LOCAL_API_LOG` to the local mock-mail log; run `e2e/jobs/publish-undertakings.spec.ts`. This job rejects non-loopback API addresses. Keep `CRUX_E2E_KEEP=1` on concurrent isolated runs so one run's cleanup does not remove another's garden. Never replace app/dist during a desktop journey.

## Launch boundary

These tests publish to the local test API only. Production publication, linking the six examples from the public landing page, and Daniel's manual/design review remain launch work. No production URLs are claimed here. The public site currently serves the prelaunch teaser; its final landing copy and example placement belong to that release change.
