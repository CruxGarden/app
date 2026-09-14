# glslEditor in Crux Garden

Upstream: https://github.com/patriciogonzalezvivo/glslEditor (`glslEditor` 0.0.24, MIT; the friendly GLSL editor behind The Book of Shaders, with glslCanvas inside it). `runtime/glslEditor.min.js` and `runtime/glslEditor.css` are the published build, unmodified; the licence is in `licenses/glslEditor-LICENSE.txt`. This independent adaptation is not a product of its author.

A shader Crux is a plain page: `index.html` loads the editor's build, then `garden/bridge.js`, which creates the editor (`new GlslEditor`, its menu off, the canvas draggable) and gives it the shader. The Crux keeps the name and the fragment shader source in `data/project.json` (`garden/document.js` validates; the host runs the same check); `shader.frag` is the starter the template ships and what the first save carries in. The bridge saves on change, and saves a frame of the shader canvas as a PNG output of the Crux (`exports/`) from the bar or the `save_shader_frame` tool.

- App Tools: `inspect_shader` (name, source length, uniforms used, canvas size, whether it compiles), `set_shader_name`, `set_shader_source` (the whole fragment shader), `save_shader_frame`.
- Sharing: Share selected content publishes the page as it is — the editor with the saved shader loaded — so visitors see the shader running and can play with the code (nothing they type is saved).
- The editor's own menu (open, save, share to the author's servers) is off; the Material icon font it would fetch is never requested.

Checks: `npm run check`; `npm run test:garden`.
