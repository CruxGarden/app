import type { TemplateDefinition } from './index';
import { LAYOUT_WRITING } from './index';
const sources = import.meta.glob(
  [
    '../../moqira-crux/{src/**/*,scripts/*,mockups/*,package.json,package-lock.json,astro.config.mjs,tsconfig.json,vitest.config.ts,README.md,.npmrc}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: Object.entries(sources).map(([path, content]) => ({
    path: path.replace('../../moqira-crux/', ''),
    content,
  })),
  layout: LAYOUT_WRITING,
  meta: { settings: { entryFile: 'src/pages/index.astro' } },
  greeting:
    'Your Moqira workspace is ready. Add controls to the canvas, create wireframes, and try Play mode. Changes save automatically with Growth history. Choose which wireframes belong in the public edition before publishing. Ask me to customize the app or help with your designs.',
  context:
    'Moqira is an editable wireframe app in an Astro shell. Private data lives in mockups/project.json; explicit publication choices in mockups/publish.json. Use the scoped crux:app bridge for data, never localStorage. Preserve Moqira attribution. Garden Mood affects only editor chrome, not canvas styling. Production builds include only selected wireframes; keep private data out of src/ and public/. Customize app sources in a Task to avoid overwriting newer design data on Main.',
};
export default template;
