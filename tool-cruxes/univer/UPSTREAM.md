# Spreadsheet — upstream seams and Tool depth

Univer 0.25.1, the locally bundled open-source Sheets Core preset. The source runtime is unmodified; Garden's `app.js` supplies persistence and commands. Dependency notices and provenance are in `vendor/`. See [README.md](README.md) for portability and limits.

| Person's action | App Tool | Upstream seam |
| --- | --- | --- |
| View sheets and their contents | `inspect_workbook`, `read_workbook_range` | Workbook snapshot after `endEditingAsync` and `onCalculationResultApplied`; summary plus ranges of at most 100 cells |
| Enter values and formulas | `set_workbook_cells` | `FRange.setValues`, a single sparse native command; no workbook recreation; native Undo retained |
| Add a sheet with the + control | `add_workbook_sheet` | `FWorkbook.create` and `setActiveSheet` |
| Rename a tab | `rename_workbook_sheet` | `FWorksheet.setName`, including formula reference updates |
| Bold/fill/number-format cells | `format_workbook_range` | `FRange.setFontWeight`, `setBackgroundColor`, `setNumberFormat` |
| Save the sheet as CSV | `save_workbook_csv`, “Save sheet CSV to Cruxspace” | Same evaluated `sheetCSV` serializer as the existing download button, saved through Garden's output protocol |

All mutation arguments are bounded and validated in the host before dispatch, and checked again against the live sheet before a mutation. Existing manual edits are captured first. Saves wait for formula calculation and fingerprint confirmation. Native Undo remains transient; Growth preserves saved history. A multi-style formatting request may create multiple native Undo steps, one per formatting control.

The first workflow is a budget with a second sheet for assumptions: person edits a line item, collaborator adds/renames a sheet, enters formulas and formats costs, person revises quantities, collaborator continues and saves CSV. The host's `electron/e2e/productivity-depth.spec.ts` covers Undo, restart and complete-Crux export into a clean Garden.

These changes ship in new Spreadsheet Cruxes. Existing Project Folders keep their own app runtime; this does not automatically upgrade them.
