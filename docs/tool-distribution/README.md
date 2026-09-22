# Tool distribution — local API acceptance

## Clean installation, editing and restart (2026-09-21)

`tool-install.spec.ts` passes (14.4 seconds) against the starter-only Vite server on localhost:8083 and API on localhost:3001, using isolated desktop data.

The journey confirms that Notes/Tigrana and all five Astro starters are already available; p5 is absent from the build, is installed through Explore, creates a working native canvas, saves a changed sketch name into its real Project Folder, and retains that name and canvas after a full app restart.

The stronger check reproduced a real bug: downloaded template files were registered by fingerprint but never projected into the new Project Folder. `applyTemplateToCrux` now materializes the files before the workspace opens. An earlier iframe-only assertion missed the 404 page.

App `npm run verify` passes 1,355 tests, tool gates and build. Electron verification passes. Logs: `/private/tmp/crux-outfit-titles-verify.log`, `/private/tmp/crux-outfit-electron-verify.log`, `/private/tmp/crux-local-tool-install-stable.log`. Screenshot: `installed-p5.png`.

## Full optional-tool catalog

The publishing job now includes every optional manifest, including six tools it previously skipped because their entry/build directory was not named `runtime`. It also checks the final Explore listing, each tool's entry artifact, and a successful nonempty download of that entry. Full-catalog execution is pending. Nothing was published to production.

## Running the jobs

Use `CRUX_LOCAL_API=http://localhost:3001` and `CRUX_LOCAL_API_LOG` pointing at the API's local mock-mail log. Installation also uses `CRUX_INSTALL_TOOL=p5-app` and `CRUX_DEV_SERVER=http://localhost:8083` (a server launched with `CRUX_BUNDLE_TOOLS=bundled`). Publishing uses `CRUX_PUBLISH_TOOLS=all` and `CRUX_DEV_SERVER=http://localhost:8080` (all tools available).

Keep every file under app fixed while these dev-server jobs run, including documentation and test files: even a README update can trigger Vite reload. Dev-server startup allows 90 seconds for the unbundled module graph, and failed launches are closed.
