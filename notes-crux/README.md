# Notes Crux

Adapted from Tigrana commit 8bc710031acb38b0d8aeca7b1f2ecbc38eca3f84, copyright Dave Haynes, under MIT (TIGRANA-LICENSE). The editor and Markdown conversion in src/tigrana are vendored; the notebook shell, Garden adapter and public reader are the Crux integration. Tauri is not included.

Use inside Crux Garden. Notes and images live in notebook/. Edit the app under src/ in a Task. Sources and notebook travel together in the private .crux archive. Whole Growth restore restores both. This version does not implement Tigrana stable note identities, rename/backlink repair or native menus.

Select pages in the editor before publishing. npm run build produces a read-only edition with selected pages and referenced raster images only. Do not move private material into src/ or public/, which are application/build inputs. Public edition title comes from notebook/publish.json.
