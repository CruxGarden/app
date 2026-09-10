# Clearer creation and the Clean Workshop

A new Crux opens Collaboration beside Clean view. An optional creation idea
becomes an editable draft; creation never submits it to a collaborator.

Clean follows the Entry file under **Crux settings** (in Metadata). Automatic
selection recognizes conventional entry pages or one unambiguous previewable
Artifact. Advanced restores the tabbed editor and content Builder; with no saved
tabs or Builder, it opens the entry Artifact for editing. Choosing an Artifact
also opens Advanced. Unsaved documents remain intact when switching views.

The entry path travels with the Crux and is inherited by new Tasks. New Growth
checkpoints capture it; viewing, restoring and branching use that saved choice.
Older checkpoints use automatic selection. It selects the Workshop preview and
does not rewrite published routing. The view preference stays local per Working
Copy. Tending remains in the top bar in either view.

Verified September 10, 2026: app verification (79 files, 822 tests), Electron
verification, 17 selected desktop checks, and three consecutive final runs of
`electron/e2e/clean-workshop.spec.ts`. The desktop tests cover unsent draft handoff,
automatic preview, entry choice, pointer interaction, refresh after file changes,
dirty tabs, missing/restored entry, workspace switching and restart. Service tests
cover archive/Task inheritance and checkpoint viewing/restore. Existing template,
Task, Tending, Growth and full Glasshouse journeys also passed.

The screenshots show the real app in isolated test gardens. The reading-list
content is a tiny test fixture written into the Project Folder, not a live AI run.

- [Creation](creation.png)
- [Clean view](clean-view.png)

The durable design is recorded in root `docs/adr/0027-workshop-entry-and-clean-view.md`.
