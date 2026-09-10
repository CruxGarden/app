# Tables in Crux Garden

Double-click cells to edit; click column headings to sort. Filter rows, add columns, select/delete rows, or switch between project, contacts and inventory examples. CSV imports preserve text such as leading-zero identifiers; numeric columns can be created explicitly. Up to 20 columns and 2,000 rows. This is an editable table, not a formula spreadsheet.

Try asking the agent: “Inspect the table and mark the first task Ready while keeping its other fields.” Available App Tools: `inspect_table`, `upsert_table_rows`. The app must be open in Workshop. Commands inspect/change the same project as the manual controls, and success means the save was acknowledged.

The editable document is `data/project.json`; app source and local runtime are separate Artifacts. Changes save automatically with Growth. Save now retries a failed save. Reload saved project loads external changes and asks before discarding a live draft. Conflicting saves preserve that draft. Export buttons save first.

Export Crux preserves the complete editable project and private Collaboration, Tasks and Growth. App-specific downloads are a separate result. Website sharing is not enabled for this local tool. Use Customize app to change source in a Task.

Tabulator 6.5.2, MIT. Local JavaScript, CSS and version metadata are in vendor/. CSV exports prefix potentially executable text formulas with an apostrophe.

Garden adapter sources use `shared/LICENSE.md`. Runtime metadata includes package versions and reproduction details. The pinned build recipe and lockfile live in the Crux Garden app repository under `tool-cruxes/`.
