import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The shader tool travels with the Crux: the page, the starter shader, the bridge, the
// validator, notes and licences as text; glslEditor's build as published assets.
const sources = import.meta.glob(
  [
    '../../glsl-crux/{index.html,shader.frag,style.css,package.json,README.md,UPSTREAM.md}',
    '../../glsl-crux/{garden,licenses}/**/*',
    '!../../glsl-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(
  ['../../glsl-crux/runtime/**/*', '!../../glsl-crux/runtime/**/*.map'],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../glsl-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../glsl-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'glsl', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'A live fragment shader: rings of light to start. Edit the GLSL beside the canvas and it recompiles as you type; Save frame puts the picture into this Crux’s outputs; Share selected content publishes the shader as a live page.',
  context:
    'A creative-coding tool around the actual glslEditor (0.0.24, MIT; The Book of Shaders’ editor, glslCanvas inside it), unmodified at runtime/. The Crux keeps the name and the whole fragment shader in data/project.json; the editor shows it live with u_resolution, u_time and u_mouse. App Tools inspect the shader (name, size, uniforms, whether it compiles), name it, replace its source (GLSL ES with a main()) and save a frame as a PNG output. Read data/project.json for the current source before changing it; keep shaders self-contained (no #include, no textures yet). Sharing publishes the page as it is. See UPSTREAM.md.',
};
export default template;
