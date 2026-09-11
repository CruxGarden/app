# Bitsy in Crux Garden

Actual Bitsy 8.14.0 editor, pinned to ee412fa8c072d16af4aedd90d4ad3fb7306911b0 from https://github.com/le-doux/bitsy (reviewed 2026-09-11).

Open editor/index.html. The editor is plain source with no build step. Rooms, pixels, sprites, dialogue, tunes and blips remain native Bitsy tools. Play and native game-data/HTML exports stay in the editor.

The adapter replaces Store.getDriver with an in-memory driver hydrated from data/project.json before the editor starts. Native game data, custom font, export settings and editor preferences persist through Garden's owner-bound save bridge and Growth. No browser-origin storage or Git is required to reopen the project. Runtime play state is not saved over authored game data. Native title editing is exposed as a scoped agent operation. Game data is limited to 2 MB; Garden's project metadata limit is 4 MB.

Source and runtime assets accompany the Crux. Preserve LICENSE.md and CREDITS.md. Whole-editor website publishing is not enabled; use the native HTML export for a playable game.

Run `node dev/resource_packager.cjs` after changing engine/export resources to regenerate the engine used by native HTML exports. This is the upstream resource packager with a .cjs extension for Node compatibility. Help pages open the upstream hosted documentation. Bundled Nunito font license comes from google/fonts at a5bd0ea86b2576f86672aab557a6024d272187a5, ofl/nunito/OFL.txt.
