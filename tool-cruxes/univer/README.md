# Spreadsheet

Edit the example budget in the native Univer editor in Workshop. Cells support values and formulas; add sheets and use the normal formatting controls. Save now commits the active cell edit, waits for calculation and confirms the workbook in Garden. Reload saved project offers to discard an unsaved draft.

Export workbook JSON preserves the native editable workbook. Export sheet CSV writes evaluated values from the active sheet, with CSV quoting and protection for formula-like text. CSV does not preserve formulas or formatting. XLSX import/export is not part of this integration.

`data/project.json` holds the native workbook in a small Garden envelope. This first version allows 20 sheets, 10,000 rows and 256 columns per sheet, 20,000 populated cells total, and a 2 MB project document. These are bounded v1 limits, not claims about handling large Excel workbooks. Native undo is transient; Growth preserves saved versions.

Agents can inspect the workbook, read bounded ranges, add and rename sheets, enter up to 100 cells and formulas, and format a range (bold, background, number format). Commands use native editing APIs, preserve Undo, and confirm recalculated results before returning success. Inspection previews the first 20 populated cells across sheets; `read_workbook_range` reads up to 100 cells with a bounded text preview. `save_workbook_csv` and “Save sheet CSV to Cruxspace” save evaluated CSV as a named output. See UPSTREAM.md for the tool-to-control mapping.

Runtime: the open-source Univer core Sheets preset 0.25.1, packaged locally. This does not include Univer Pro services or server features. `vendor/THIRD-PARTY-NOTICES.md` and `vendor/provenance.json` retain dependency notices and hashes. Garden's adapter uses `shared/LICENSE.md`. Use Tasks to customize app source. Export Crux preserves the complete private editable project; website sharing is not implemented for Spreadsheet.
