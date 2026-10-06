# Tool distribution — single-package versions

## Current acceptance (2026-09-21)

The local Explore catalog has all 34 optional Crux Tools. Each is now one ZIP, one SHA-256 fingerprint, one API Artifact and one stored object. Those archives contain 25,907 files in total (652 MiB compressed), including original licenses, provenance, runtime, source and tool-specific adapters. No production publication or deployment occurred.

GDevelop's isolated desktop journey passes in 36.0 seconds against a starter-only build and the local API. It proves exactly one artifact download, exactly one local installed-tool Artifact, creation of an editable Project Folder, adding a 3D Box and scene instance in the real GDevelop UI, saving, and preserving that edit after a complete desktop restart. Its package holds 7,772 files and downloads at about 110 MiB. Creating a creative project still uses ordinary file-level Artifacts/Growth; the opaque package applies to tool distribution and installation.

The all-tools catalog acceptance passes in 8.8 seconds. Every published tool has one Artifact; its archive downloads once, matches the advertised fingerprint, contains its declared entry and UPSTREAM.md, and has real CSS rather than Vite URL-export stubs. Maps and Form preserve the complete tool instead of building visitor editions. Vite now emits embedded runtime assets unchanged. The previously corrupted GLSL and Recorder CSS was repaired during local catalog conversion.

Package tests cover deterministic fingerprints, binary/source/empty files, wrong identity or digest, traversal, extra/missing files, size declarations, one-download installation, editable local unpacking and preservation of the prior installation after failure. Private runtime-reference archives can restore bytes from a locally installed package while offline. Legacy per-file installations remain readable.

API `adf8d61` and `0ad16a9` validate packages before replacing publications, exposes the package reference through public metadata, and retrieves published archives from either storage layout. Full API verification passes 636 tests with five existing skips and build. The full app gate passes 1,379 tests in 231 files, bundled-tool gates and build; Electron typecheck/lint passes. The refreshed starter-only p5 install/edit/restart recheck passes in 12.4 seconds, again with one download and one installed package Artifact. Earlier API `3ab06d3` separately fixes recursive Multer cleanup on rejected uploads.

## Evidence and recipes

- Catalog metadata: `catalog-packages.json` (local acceptance records only).
- Desktop GDevelop: `/private/tmp/crux-gdevelop-package.log`; screenshot `installed-gdevelop.png`.
- Catalog: `/private/tmp/crux-package-template-acceptance.log`.
- API: `/private/tmp/crux-single-object-read-verify.log`.
- App: `/private/tmp/crux-v1-final-verify.log`; Electron: `/private/tmp/crux-v1-electron-final-verify.log`.
- p5: `/private/tmp/crux-final-template-journeys.log`.
- Package/archives: `/private/tmp/crux-v1-final-focused.log`.

Build the starter-only renderer with `CRUX_BUNDLE_TOOLS=bundled npx vite build` from app. From app/electron, run `CRUX_LOCAL_API=http://localhost:3001 CRUX_INSTALL_TOOL=gdevelop-app npx playwright test e2e/tool-install.spec.ts`. The same test accepts `p5-app`. The fixture isolates its database and Project Folders from the person's garden.

For catalog checking, set `CRUX_PUBLISH_TOOLS=all`, `CRUX_LOCAL_API`, and `CRUX_LOCAL_API_LOG` (the mock-mail log), then run `e2e/jobs/publish-tools.spec.ts`. Already published tools are skipped, but every final archive is checked. Publishing missing tools requires an all-tools build. Never rebuild the renderer while a desktop journey uses it.

Production catalog conversion is a launch operation. The tested local migration used only known `gardener-<number>@example.com` test owners: read their legacy objects from the local publish store, package them through the app's production packer, republish through the ordinary authenticated endpoint, then download and verify the result. It did not write database rows directly.
