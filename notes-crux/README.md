# Notes Crux

Adapted from Tigrana commit 8bc710031acb38b0d8aeca7b1f2ecbc38eca3f84, copyright Dave Haynes, under MIT (TIGRANA-LICENSE). The editor and Markdown conversion in src/tigrana are vendored; the notebook shell, Garden adapter and public reader are the Crux integration. Tauri is not included.

Use inside Crux Garden. Notes and images live in notebook/. Edit the app under src/ in a Task. Sources and notebook travel together in the private .crux archive. Whole Growth restore restores both. This version does not implement Tigrana stable note identities, rename/backlink repair or native menus.

Select pages in the editor before publishing. npm run build produces a read-only edition with selected pages and referenced raster images only. Do not move private material into src/ or public/, which are application/build inputs. Public edition title comes from notebook/publish.json.

Import notebook folder copies Markdown, raster images and Tigrana metadata into a new notebook/Imported/<name>/ folder. Folders, relative links and frontmatter remain intact; originals are unchanged and imported notes start private. Review shows skipped unsupported files. Up to 2,000 files / 48 MB per import, 5 MB per image. Tigrana pinning, colors and identity metadata are retained but not interpreted. There is no synchronization with the original folder.

Use app opens the notebook. Ask agent opens Collaboration for requests such as organizing a novel into outline, characters and chapters. Customize app starts a Task for changes to the editor. Share selected content creates the public read-only website. Export complete Crux includes private notes and history as well as the editable app.
