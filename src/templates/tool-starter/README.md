# Make and share your own tool

This working Pocket Notes editor is yours to change. No AI, build command or app release is required. Its document belongs to each new Crux, not to the installation.

1. In Artifacts, edit `index.html` to change the interface. Try its Save note button, close/reopen and check `data/project.json`.
2. Edit `crux-tool.json`: choose a lowercase id, name, description, releaseVersion, defaultTitle, greeting and your own https provenance link. Keep `app: "pocket-notes"`, `contentRoot: "data/"` and `document.path: "data/project.json"` for the shared document bridge. You may choose another app name if you update the editor and seed together; the shared bridge always reads and writes data/project.json. The manifest's document seed is the initial document for each new project. Keep it free of personal test notes.
3. Keep source, licenses and `UPSTREAM.md`. This starter is MIT licensed; credit other code/assets you add under their own terms.
4. Set Details → Kind → Tool template. Close/reopen, connect your publishing account and use Share with Discoverable enabled. The full editor becomes a single downloadable Tool Crux. A malformed manifest or missing entry must be fixed before publishing.
5. For file sharing, use Export Tool (.cruxtool), then Add Crux → Import or drop the file on Home. A `.cruxtool` installs an editor; `.crux` keeps a project archive; `.cruxmood` installs a Mood.
6. From a different test Garden, find your publication in Explore → Tools or your public Garden, install it and create a new Crux from Add Crux. Edit, save, restart and verify. Two publications can use the same manifest id without replacing each other.
7. Publish revisions to the same Tool Crux. Existing projects keep their own files and manifest. New installations use the published package; no automatic project migration is implied. Remove a tool in Settings → Data → Installed tools or from its Add Crux entry; existing projects remain editable.

To resume authoring after marking this a Tool template, change Kind back to Web App. Preview editing/saving is for creative projects, not distributable Tool templates. Test private archives with runtimes included in another isolated installation.

## Editor contract

`garden/client.js` uses the existing owner-bound preview bridge. Read `project.json`, then write JSON with the returned `fingerprint` as `expected`; a stale save fails rather than overwriting somebody else's change. Documents use `{ "version": 1, "app": "pocket-notes", ... }`. The host bounds document size and checks referenced assets. Signal dirty state and implement flush before navigation. Additional bridge operations must follow the Garden protocol; never assume arbitrary filesystem access.

Downloaded host JavaScript is never evaluated in the Garden renderer or Electron main process. Tool code runs in the preview. Custom AI command adapters and arbitrary executable desktop plugins are not provided by this starter; ordinary file editing remains available to collaborators.

A Tool template publishes the editor package. Sharing a visitor-facing edition of a project made with an editor is a separate capability; this starter leaves it disabled.
