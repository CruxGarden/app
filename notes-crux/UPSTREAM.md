# Tigrana in Crux Garden

Upstream: https://github.com/downcastsystems/tigrana
Revision: 8bc710031acb38b0d8aeca7b1f2ecbc38eca3f84 (main, 2026-09-08), Tigrana 1.0.8, copyright Dave Haynes, MIT (LICENSE). This independent adaptation is not an official Tigrana product or endorsement.

This is the actual Tigrana: `src/` is upstream's React app unchanged except one seam. Tigrana is a Tauri 2 desktop app whose front end reaches its Rust side through a `NotebookStorage` interface (`src/lib/notebookStorage.ts`), with a demo implementation for browsers; inside a Crux that interface is implemented over the Garden bridge (`src/garden/notebook-storage.ts`, chosen by the marker `boot.ts` sets), and the app otherwise runs in its browser mode:

- The workspace is the Crux's `notebook/` folder in Tigrana's own layout: Markdown notes and folders, `.tigrana/metadata.json` (order, pins, bookmarks, icons), per-folder `.tigrana/folder.json` sidecars, images under `.assets/`. The desktop Tigrana opens the same folder. Every list, read, write and delete goes through the scoped `crux:notebook` protocol; writes carry the file's fingerprint (a refused write shows in the bar with Discard draft and reload) and record Growth.
- Not carried over: note history (Growth is the history in a Crux), the Recently Deleted trash (the Garden's Trash keeps deleted notes), the durable link index and workspace watching (the app rebuilds links in memory; external edits show after a reload), multiple windows and native menus.
- `src/garden/bridge.ts`: the protocol, the bottom bar (save state, Import notebook folder… into `notebook/Imported/<name>` through the host, Public edition… choices in `notebook/publish.json`, Appearance), the host's flush (Tigrana's 650 ms autosave, then pending writes), and the Mood appearance protocol mapped onto Tigrana's shell variables (accent and type stay the notebook's own).
- `src/garden/document.ts`: documents (V1-GAPS-PLAN.md §2.1). Import document… in the bar (or the `import_document` App Tool on a `.docx` in the Crux) turns a Word document into a note under `notebook/Imported/<name>/` with its images beside it in `.assets/` — mammoth (BSD-2) reads DOCX to HTML, Tigrana's own `htmlToMarkdown` writes the note. Export note as DOCX (or `export_note_docx`) writes the open note as a Word document into the Crux's outputs (`exports/`, a Cruxspace output) — Tigrana's `markdownToHtml`, then `docx` (MIT): title, headings, emphasis, links, bullet and numbered lists, task items, quotes, code, tables, images. Not carried: tracked changes, comments, footnotes, columns, ODT.
- `scripts/edition.mjs`: the public edition (ADR 0028) with no framework: the chosen notes rendered by remark to static HTML in `dist/` — one searchable page, or one page per note (`separate-pages`, usable without JavaScript) — images inlined, links between chosen notes kept, frontmatter and unchosen notes left out. `npm run build` renders it; `npm run test:garden` covers it. `scripts/epub.mjs`: the book edition (`format: epub` in `notebook/publish.json`) — the same notes as an EPUB 3 with its own ZIP writer, written beside the site and linked from it.
- `vite.config.ts`: relative paths and `OUT_DIR` for the Workshop runtime; upstream's suites run under Vitest with the Garden script excluded.

Build: `npm install --ignore-scripts` (the lockfile is refreshed here), `npm run build:garden` → `runtime/` for the Workshop, `npm run build` → `dist/` public edition, `npm run check`, `npm test`.

## Tool depth — 2026-09-14

Marked additional upstream seam: `src/editor/NotesEditor.tsx` registers the open editor with the Garden bridge. `src/garden/editor-commands.ts` applies ordinary ProseMirror transactions, keeping native Undo and the existing autosave/fingerprint path. The bridge serializes commands and checks that the requested note is still open after pending edits drain.

| Person's action | App Tool | Native seam |
| --- | --- | --- |
| Read the open note | `read_open_note` | Live editor → existing `htmlToMarkdown`; 4,000-character pages |
| Find and replace a unique phrase | `replace_note_text` | Exact text within a paragraph, including across inline marks; `tr.insertText`; ambiguous/missing matches refused |
| Type new paragraphs at the end | `append_note_text` | Paragraph/text nodes inserted in one transaction; text stays literal; separate Undo step |
| Hand the note on as Word | Existing `export_note_docx` | Existing autosave drain and DOCX renderer |

Edits require `activeNote` from `inspect_notebook`, preserve the remaining document and remain editable by the person. This does not add tracked changes or arbitrary document replacement. `editor-commands.test.ts` tests inline formatting, literal text, ambiguity, read-only refusal and Undo. Desktop coverage: `electron/e2e/productivity-depth.spec.ts` in the host app.

These editor handles ship in new Notes Cruxes. Existing Project Folders keep their own runtime; no automatic upgrade is performed.
