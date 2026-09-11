import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const sources = import.meta.glob(
  '../../rawgraphs-crux/{*.json,*.md,LICENSE,yarn.lock,.prettierrc,{src,public,scripts}/**/*.{js,cjs,ts,json,html,css,scss,md,txt,svg,csv,tsv}}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../rawgraphs-crux/{runtime/**/*,{src,public}/**/*.{png,jpg,jpeg,gif,ico,woff,woff2,ttf,otf,eot}}',
    '!../../rawgraphs-crux/**/*.css',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob('../../rawgraphs-crux/runtime/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries({ ...sources, ...styles }).map(([path, content]) => ({
      path: path.replace('../../rawgraphs-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../rawgraphs-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'rawgraphs', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Turn a dataset into a figure with RAWGraphs. Paste or import your data, choose a chart, drag columns into its dimensions, then export SVG, PNG or an editable .rawgraphs project. Garden saves the dataset and chart automatically.',
  context:
    'Actual RAWGraphs editor source and runtime. data/project.json stores native chart mapping and visual options; immutable JSON data/assets preserve source input and raw rows. Use inspect_rawgraphs and set_rawgraphs_size while the editor is open. Rebuild with yarn install --frozen-lockfile --ignore-scripts and yarn build (Yarn 1.22.22, Node 22). The bundled chart catalog works locally; custom JavaScript chart modules are disabled in Garden. URL/SPARQL imports require their remote source; saved datasets reopen locally. Native exports remain; whole-editor publishing is unavailable. See UPSTREAM.md.',
};
export default template;
