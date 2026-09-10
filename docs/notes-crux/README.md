# Field notes — Notes Crux demonstration

In the desktop app, choose **Add Crux → Notes**, or import `field-notes.crux`
through **Add Crux → Import .crux file**. First launch installs the notebook's
dependencies using the existing Site Crux toolchain.

Write in Workshop Clean view. Create nested pages with names such as
`Research/Field journal`; paste a PNG, JPEG, GIF or WebP into the rich editor.
Saves write Markdown and images to the Project Folder and create Growth
checkpoints. **Save now** waits for that acknowledgment. External-edit conflicts
keep the open draft available for download or explicit discard and reload.

Select **Include in public edition** for the pages you want to share, then use
Garden's Publish pane. The notebook title is editable in
`notebook/publish.json` through Advanced view. New pages are private by default.
The public reader has search and navigation, without editing controls.

To customize the notebook itself, create a Task and change the application under
`src/`. A source-only Task can merge while preserving newer notes on Main.
Ordinary Growth restore restores the entire checkpoint, including notebook data.
This first version does not provide app-only restore, full Tigrana migration,
stable note identities, rename/backlink repair, private hosted editing or sync.

## Evidence

`electron/e2e/notes-crux.spec.ts` generates these files using an isolated desktop
garden and the real notebook app, filesystem, Blob Store and build toolchain:

- `notebook.png`: editing inside Crux Garden.
- `public-edition.png`: the locally served production build inside Workshop.
- `field-notes.crux`: complete private example, including source, sample notes,
  one clipboard image and Growth. The “private” note contains fictional test
  markers used to prove exclusion from the public build. An archive deliberately
  contains these files; it is not the public edition.
- `evidence.json`: measured checkpoint count and completed journey assertions.

The test switches views immediately after editing, pastes an image, handles an
external edit, preserves frontmatter, restarts the app, exports and imports into
a fresh garden, and checks the actual production output for private content.
Service tests separately exercise Task isolation, source-only merges and the
publication payload's omission of Collaboration and workspace thumbnails.

Nothing in this demo has been deployed publicly. Tigrana's MIT attribution is
retained in both the editable Crux and generated public site.
