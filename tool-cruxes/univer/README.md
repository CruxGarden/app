# Spreadsheet

Edit the example budget in the native Univer editor in Workshop. Cells support values and formulas; add sheets and use the normal formatting controls. Save now commits the active cell edit, waits for calculation and confirms the workbook in Garden. Reload saved project offers to discard an unsaved draft.

Export workbook JSON preserves the native editable workbook. Export sheet CSV writes evaluated values from the active sheet, with CSV quoting and protection for formula-like text. CSV does not preserve formulas or formatting. XLSX import/export is not part of this integration.

`data/project.json` holds the native workbook in a small Garden envelope. This first version allows 20 sheets, 10,000 rows and 256 columns per sheet, 20,000 populated cells total, and a 2 MB project document. These are bounded v1 limits, not claims about handling large Excel workbooks. Native undo is transient; Growth preserves saved versions.

Agents can use `inspect_workbook` and `set_workbook_cells` while this Crux is open in Workshop. Inspection lists sheet IDs and the first 20 populated rows of each sheet. A command sets up to 100 A1-addressed cells on an existing sheet; text beginning with `=` is a formula, and null clears a value. Commands preserve cell formatting and confirm recalculated results before returning success.

Runtime: the open-source Univer core Sheets preset 0.25.1, packaged locally. This does not include Univer Pro services or server features. `vendor/THIRD-PARTY-NOTICES.md` and `vendor/provenance.json` retain dependency notices and hashes. Garden's adapter uses `shared/LICENSE.md`. Use Tasks to customize app source. Export Crux preserves the complete private editable project; website sharing is not implemented for Spreadsheet.
