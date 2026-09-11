import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const source = import.meta.glob(
  [
    '../../svgedit-crux/{*.json,*.mjs,*.md,*.txt,.cruxignore}',
    '../../svgedit-crux/{garden,scripts,src,packages,tests}/**/*.{js,cjs,mjs,ts,tsx,json,html,css,svg,txt,md}',
    '!../../svgedit-crux/packages/**/dist/**',
    '../../svgedit-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../svgedit-crux/runtime/**/*',
    '!../../svgedit-crux/runtime/**/*.css',
    '../../svgedit-crux/{src,packages,tests}/**/*.{png,jpg,jpeg,gif,ico,woff,woff2,ttf,eot}',
    '!../../svgedit-crux/packages/**/dist/**',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../svgedit-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../svgedit-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'svgedit', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Draw with SVG-Edit: shapes, paths, text, layers and imported images. Garden saves the editable drawing and preferences. Export SVG or PNG from the native menu; Export complete Crux keeps your source, drawing and history together.',
  context:
    'Actual SVG-Edit 7.4.2 editor. Drawing XML, supported preferences and embedded image data persist as separate fingerprinted Artifacts referenced by data/project.json. Browser storage is transient. Native SVG and raster exports stay self-contained when images are embedded; remote URLs remain external. Agents inspect object IDs, change one fill or set the document title through native operations. Apply or close the native SVG source dialog before closing/checkpointing the Crux. Source, pinned dependencies and upstream license notices travel with the Crux; npm ci --ignore-scripts && npm run build rebuilds runtime. Whole-editor publication unavailable. See UPSTREAM.md.',
};
export default template;
