import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The sketch tool travels with the Crux: the page, the starter sketch, the bridge, the
// validator, notes and licences as text; p5 itself as the published library.
const sources = import.meta.glob(
  [
    '../../p5-crux/{index.html,sketch.js,style.css,package.json,README.md,UPSTREAM.md}',
    '../../p5-crux/{garden,licenses}/**/*',
    '!../../p5-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../p5-crux/runtime/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../p5-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../p5-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'p5', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'A p5.js sketch: a flow field to start. Edit sketch.js (or ask me to change it) and the preview restarts; the seed in the bar gives a different drawing, Save frame puts the picture into this Crux’s outputs, and Share selected content publishes the sketch as a live page.',
  context:
    'A creative-coding tool around the actual p5.js (2.3.3, LGPL-2.1, unmodified at runtime/p5.min.js). The sketch is sketch.js, an ordinary p5 global-mode sketch loaded by garden/bridge.js once the seed is known (window.garden.seed; window.garden.frame(n) reports frames; window.garden.saveFrame(label) saves the canvas as a PNG output). The Crux keeps a name and the seed in data/project.json. To change what the sketch draws, read and edit sketch.js with the file tools — keep setup() and draw(), keep reading the seed from window.garden, and declare top-level variables with var (a restart reloads the file in place, so a top-level let or const would already be declared) — then restart_sketch. App Tools inspect the sketch, name it, set its seed (restarts), restart it, pause and resume, and save a frame. Sharing publishes the page as it is, so it must stay self-contained (no remote scripts). See UPSTREAM.md.',
};
export default template;
