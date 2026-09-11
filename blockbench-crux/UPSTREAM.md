# Blockbench in Crux Garden

Native Blockbench web app, v5.1.6, upstream commit `794e964e966b6783b4e9b98ecbdda5152c0620cc` from https://github.com/JannisX11/blockbench. GPL-3.0-or-later; see LICENSE.MD. The Garden adaptation is distributed under the same license. Upstream branding, source and dependency notices are preserved. Models you create belong to you under upstream's stated policy.

Supported workflow: native modeling, texture painting, animation, BBModel import/export and embedded-media glTF export, with Garden saves, scoped agent edits and portable Crux export/import.

`npm ci --ignore-scripts && npm run build` rebuilds runtime with the pinned lockfile. The fork retains the native web editor, formats, modeling, painting and animation UI. Electron packaging is outside this web fork.

Garden stores the model library, individual native BBModel documents, embedded textures/audio and preferences as fingerprinted Artifacts. Closing a native tab retains the model in the library; use Reopen model to restore it. Native exports still produce ordinary files. Browser storage is an isolated runtime cache. Browser auto-backups, PWA installation, remote plugins, online sessions and URL-triggered imports are disabled. Undo and animation playback are transient. External URLs are not offline assets; import media locally for portability.


`npm run test:garden` checks component validation, native media/animation round trips, unchanged media reuse and isolated Storage behavior. The Garden host adds Growth/archive and command-validation tests. Its real desktop Playwright journey covers manual resizing and painting, moving animation keyframes, native exports/import, agent edits, conflicts, multiple model tabs, restart and complete Crux import with the original Project Folder unavailable.

Undo, playback position and global reference-image collections are not durable library state. Project-specific embedded reference images travel in their native model. Remote URLs remain external dependencies. Close or apply native dialogs before checkpointing. The supported library is bounded to 500 models and individual component assets to 64 MiB. Closing retains a model; the library currently offers reopening rather than a separate permanent-delete command. Growth preserves earlier states.
