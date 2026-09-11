import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const source = import.meta.glob(
  [
    '../../blockbench-crux/{*.json,*.js,*.html,*.md,*.MD,.cruxignore}',
    '../../blockbench-crux/{garden,scripts,js,css,lib,assets,content,keymaps,lang,themes}/**/*.{js,cjs,mjs,ts,json,html,css,svg,glsl,vue,bbtheme,bbkeymap,md,MD,txt}',
    '../../blockbench-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../blockbench-crux/runtime/**/*',
    '!../../blockbench-crux/runtime/**/*.css',
    '../../blockbench-crux/{*.png,*.ico}',
    '../../blockbench-crux/{assets,font,icons,lib}/**/*.{png,jpg,jpeg,webp,gif,ico,woff,woff2,ttf,eot,svg}',
    '!../../blockbench-crux/assets/**/*.svg',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../blockbench-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../blockbench-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'blockbench', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Model, paint and animate with Blockbench. Garden saves your model library and embedded textures. Closing a model tab keeps it in the library; use Reopen model to return to it. Native export produces ordinary model files. Export complete Crux carries the editor, models and history together.',
  context:
    'Actual Blockbench 5.1.6 web editor. Native BBModel documents, embedded media and preferences persist in separate fingerprinted Artifacts referenced by data/project.json. Browser storage is transient. Remote plugins, cloud collaboration, browser auto-backups and PWA installation are disabled. Import textures locally for portability. Undo and playback are transient. Agents inspect the active model, rename an element through native Undo or name the project. GPL-3.0-or-later source, pinned lockfile and notices travel with the Crux. npm ci --ignore-scripts && npm run build rebuilds runtime. Whole-editor publication unavailable. See UPSTREAM.md.',
};
export default template;
