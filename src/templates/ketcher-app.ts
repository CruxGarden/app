import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const source = import.meta.glob(
  [
    '../../ketcher-crux/{*.json,*.js,*.jsx,*.html,*.md,LICENSE,.cruxignore}',
    '../../ketcher-crux/{garden,scripts}/**/*',
    '../../ketcher-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  ['../../ketcher-crux/runtime/**/*', '!../../ketcher-crux/runtime/**/*.css'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../ketcher-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../ketcher-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'ketcher', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Draw molecules and reactions in Ketcher. Use its native structure tools, import chemistry files, and export structures or images. Garden saves the drawing, editor settings and your custom template library.',
  context:
    'Actual Ketcher 3.13.0 native browser editor with the local Indigo chemistry engine. Native KET and editor settings/custom templates persist as separate fingerprinted Artifacts referenced by data/project.json. Browser storage is isolated per Crux and reconstructed from Artifacts. inspect_ketcher and set_ketcher_structure use native chemistry APIs. Native chemical/image exports remain. Macromolecules are disabled. App source, pinned dependencies and license notices travel with the Crux; npm ci && npm run build rebuilds runtime. Whole-editor publishing is unavailable. See UPSTREAM.md.',
};
export default template;
