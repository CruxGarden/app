# pdfme in Crux Garden

Upstream: https://github.com/pdfme/pdfme — `@pdfme/ui`, `@pdfme/generator`, `@pdfme/schemas`, `@pdfme/common`, `@pdfme/converter` 6.1.12, MIT. This independent adaptation is not a pdfme product.

pdfme is a page layout designer and PDF generator: a WYSIWYG Designer (text, multi-variable text, images, tables, lines, rectangles, ellipses, QR codes), a Viewer and a generator whose output is a real PDF; the layout is a JSON template. It ships as ES modules with no page and no storage, so this Crux adds the smallest shell (the EventCalendar rule): `index.html` with a name field, a page-size choice and Design/Preview tabs, `src/main.ts` holding the name, the page and the template as plain data, and the Garden bridge (`src/garden/bridge.ts`). `npm run build:garden` bundles it with Vite into `runtime/`, which the Workshop shows.

- `data/project.json` is the document: `{ name, page, template, saved }` (`garden/document.js` validates it; the host runs the same check). Every change in the Designer marks the project dirty; a confirmed save writes it.
- Outputs: the bar's "Save PDF to Cruxspace" and "Save image to Cruxspace" (the first page as PNG at 2×) write into `exports/` as Cruxspace outputs with the name given (App Tools `save_layout_pdf`, `save_layout_image` do the same).
- App Tools: `inspect_layout`, `set_layout_name`, `set_layout_page`, `add_layout_text` (a text block at millimetre coordinates), `save_layout_pdf`, `save_layout_image`.
- A layout is a local creation tool (no public edition); its outputs travel to a site or a notebook through a Cruxspace.

Build: `npm install`, `npm run build:garden` → `runtime/`; `npm run check`; `npm run test:garden`.

## Multi-page handouts (2026-09-14)

App Tools inspect a chosen page in bounded batches, append pages, add text on a chosen page, update named blocks without dropping other pages, and select the page rendered to PNG. The native Designer still edits the same template through its public `updateTemplate`/`onChangeTemplate` API. The person can add pages with the header button or native page controls, edit/select blocks in the Designer and choose “Image page” in the output bar.

pdfme 6.1.12's public template update does not register native per-page Undo. Garden therefore records whole-layout changes from both native Designer callbacks and collaborator commands in one history, exposed as Undo/Redo header buttons and Command/Control+Z, Shift+Z or Y. It survives pane resize/remount during the session, covers page additions and name/size edits, and discards Redo after new edits. History is transient and bounded to 40 entries / 16 MB of past snapshots; saved layouts and outputs still use the fingerprint-guarded Garden bridge. Existing Project Folders retain their runtime. The round-trip journey is `electron/e2e/web-print-depth.spec.ts`.
