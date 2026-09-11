import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const source = import.meta.glob(
  [
    '../../gephi-crux/{*.json,*.ts,*.js,*.mjs,*.md,.prettierrc.json,.cruxignore}',
    '../../gephi-crux/{garden,scripts}/**/*',
    '../../gephi-crux/packages/*/*.{json,mts,html,md,ts}',
    '../../gephi-crux/packages/*/{src,types,public}/**/*.{ts,tsx,js,json,html,scss,css,md,mdx,svg,gexf,graphml,txt,webmanifest}',
    '../../gephi-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../gephi-crux/runtime/**/*',
    '!../../gephi-crux/runtime/**/*.css',
    '../../gephi-crux/packages/*/{src,public}/**/*.{png,ico,ttf,eot,woff,woff2}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../gephi-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../gephi-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'gephi', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Explore connections in the native Gephi Lite editor. Open a graph file or sample, adjust its layout and appearance, inspect its data, and export a figure. Garden saves the graph and analysis settings automatically.',
  context:
    'Actual Gephi Lite 1.0.2 browser app. Native graph, layout positions, filters, appearance, analysis parameters and preferences persist as separate fingerprinted Artifacts referenced by data/project.json. Native JSON/GEXF/PNG exports remain. Stop running layouts before closing. inspect_gephi and set_gephi_title operate on native graph state. Source and GPL-3.0 license travel with the Crux; npm ci && npm run build rebuilds runtime. Cloud login and duplicate-browser-tab controls are omitted. Whole-editor publishing is unavailable. See UPSTREAM.md.',
};
export default template;
