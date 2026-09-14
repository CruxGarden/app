# p5.js in Crux Garden

Upstream: https://github.com/processing/p5.js (`p5` 2.3.3, LGPL-2.1). `runtime/p5.min.js` is the library as published, unmodified; its licence is in `licenses/p5-LICENSE.txt`. This independent adaptation is not a product of the Processing Foundation.

A sketch Crux is a plain page: `index.html` loads p5, then `garden/bridge.js`, then `sketch.js`. The sketch is the thing you edit — in the Artifacts editor, or by asking the collaborator (`write_file` / `edit_file` on `sketch.js`); the preview restarts on save. A restart reloads `sketch.js` in place, so top-level variables are declared with `var` (a top-level `let` or `const` would already be declared the second time). The Crux keeps only what the sketch needs beside its source in `data/project.json`: a name and the seed (`garden/document.js` validates; the host runs the same check). The bridge hands the seed and name to the sketch (`window.garden.seed`), reports frames, and saves a frame of the canvas as a PNG output of the Crux (`exports/`) from the bar, the S key, or the `save_sketch_frame` tool.

- App Tools: `inspect_sketch` (name, seed, canvas size, frames drawn, whether it is running, the source length), `set_sketch_name`, `set_sketch_seed` (the sketch restarts with it), `restart_sketch`, `save_sketch_frame`.
- Sharing: Share selected content publishes the page as it is — `index.html`, `sketch.js`, `style.css` and the library — so the sketch runs live for visitors with a fresh seed each visit (the bridge is a stand-in outside Garden).
- Standalone (opened outside Garden): a random seed, no saving; the sketch still runs.

Checks: `npm run check`; `npm run test:garden`.
