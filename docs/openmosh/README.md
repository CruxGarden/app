# Actual OpenMosh inside Crux Garden

The `openmosh-app` template contains upstream OpenMosh 0.7.3's actual Svelte interface and editor, with Garden persistence behind it. Add Crux → OpenMosh creates this application. Existing `tool-openmosh` sampler Cruxes are preserved.

The tests use isolated Electron gardens and generated media. Screenshots show the real native interface in Workshop:

- `openmosh-start.png`: native mode selection and media import.
- `openmosh-workshop.png`: native effects rack, rendered image and an agent inspect/change/inspect turn.
- `openmosh-reopened.png`: reopening the saved Single session after an application restart.
- `openmosh-editor.png`: native timeline with original video, still image and audio restored.
- `openmosh-slideshow.png`: native Slideshow with its original media, audio and configuration restored.

`electron/e2e/openmosh-app.spec.ts` verifies manual and agent changes, original bytes, PNG and WebM native exports, external-edit conflict retention/reload, full desktop restart, and Editor/Slideshow media/project round trips. `electron/e2e/cruxspace.spec.ts` connects this actual application to a website and Tables tracker, using selected raster output bytes through revisions, membership removal and restart. The service test verifies Growth restore and complete Crux export/import, plus ownership boundaries. Fork tests retain 574 upstream unit tests and add native storage/agent checks.

The package includes original source, build configuration, tests, lockfile, runtime and license notices. Native media limits are 128 MB per file and four million characters of metadata. Preview proxies are rebuilt, not archived. Binary originals stay separate from JSON and reuse Blob Store fingerprints. Slideshow agent inspection is available; effect mutation commands currently apply to Single mode and selected static Editor chains.

This is a local creation tool. Public website sharing is not enabled; Essentia corresponding-source delivery and shader-helper provenance remain release follow-ups documented in `openmosh-crux/NOTICES.md`. No public runtime deployment was made.
