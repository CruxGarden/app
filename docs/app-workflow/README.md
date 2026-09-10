# Novel workshop workflow

`novel-workshop.crux` is a fictional Notes demo exported through the real desktop UI. Import it with Add Crux → Import .crux file. It includes an imported notebook, a reviewed and merged editor customization, private notes, app sources, and Growth. The tiny image and conspicuous test phrases are intentional test fixtures; no personal notebook was used.

The desktop journey exercises:

- A folder import preserving Markdown/frontmatter, nested chapters, a raster image and Tigrana metadata. The original folder stays unchanged and imported pages start private.
- Customize app creating a separate Task, while newer chapter content is written on Main. Reviewing, checking and merging the editor change keeps that newer chapter.
- Growth app/content labels and the whole-checkpoint restore explanation.
- Share selected content wording and the production build of only the selected pages, with private content/frontmatter excluded. The site is served locally for this test; nothing was publicly deployed.
- Export complete Crux wording, followed by archive import into a fresh isolated Garden with private content, customized source and all Main Growth checkpoints retained.

Screenshots: `import-review.png`, `customized-notebook.png`, `export-explanation.png`, and `shared-notebook.png`. Machine-readable results are in `evidence.json`. Reproduce with `cd electron && npm run test:e2e -- e2e/app-workflow.spec.ts` after building the app.

The app UI offers Use app, Ask agent and Customize app. Specialized app tools are a proposed follow-on; Ask agent currently opens the existing Collaboration/file-tool workflow. Existing customized Cruxes are not silently upgraded when the built-in template changes.
