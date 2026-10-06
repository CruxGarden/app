# V1 workflow polish — October 1

- Local Crux cards offer Duplicate, with visible progress. It uses the complete archive copy path, preserves history/Tasks/files/Store, names the independent result “— copy”, and leaves the source intact. Garden duplication remains its existing export/import workflow.
- Installed tools from Explore offer Source and updates, opening the existing creator publication and its Install/Update controls. File-only installs have no invented source. Removal failures retain the installation record and report an error.
- Browser `.crux` archives now retain visitor identity, reject invalid/colliding Store rows before replacement, and fail rather than silently dropping Store data. Failed restoration follows the existing rollback path. Desktop uses the separate API-owned version3 graph archive and was not affected by this omission.

Evidence:

- Browser reproduction:7 failing regression cases before the fix (`/tmp/store-archive-red.log`); fixed format/export-import checks62/62 (`/tmp/store-archive-green.log`). These use real SQLite; Store failures are explicitly injected.
- Desktop API graph-transfer checks21/21 (`/tmp/v1-archive-native-check.log`), including visitor identity. API source/runtime unchanged.
- Full app gate1,686/267 +18 skips/build (`/tmp/workflow-polish-final.log`).
- Actual desktop Duplicate passes13.6s: text/binary bytes, two separate visitor values, editing the copy without changing the source, restart. Both private-archive UI cases pass in the same batch. Initial creator/source journey needed its test to expand the existing collapsed Garden section; that first batch was3 passes/one harness failure (`/tmp/workflow-polish-desktop.log`).

Corrected creator/source journey passes1/42.1s (`/tmp/workflow-tool-source-final.log`), including the creator publication and installed state. Final package acceptance follows. Hosted production and manual provider/signing acceptance remain separate.
