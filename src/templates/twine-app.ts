import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
const source = import.meta.glob(
  [
    '../../twine-crux/{*.json,*.js,*.mts,*.html,*.md,LICENSE,.cruxignore}',
    '../../twine-crux/{garden,scripts}/**/*',
    '../../twine-crux/{src,public}/**/*.{ts,tsx,js,json,css,html,svg,md,txt}',
    '../../twine-crux/public/**/LICENSE*',
    '../../twine-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../twine-crux/runtime/**/*',
    '!../../twine-crux/runtime/**/*.css',
    '../../twine-crux/{src,public}/**/*.{png,jpg,jpeg,gif,ico,woff,woff2,ttf,eot}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../twine-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../twine-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'twine', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Write an interactive story in Twine. Create passages, link choices, and play the result. Garden saves your story library and settings; Twine can export playable HTML, and Export complete Crux preserves your editable library with its history.',
  context:
    'Actual Twine 2.12.0 browser editor with bundled native story formats. Stories, passages, preferences and format records persist as separate fingerprinted Artifacts referenced by data/project.json. Native passage drafts finish saving before Garden closes or checkpoints the app. Play/Test/Proof render native output in a sandboxed preview. inspect_twine lists story IDs; set_twine_title renames through the native reducer; set_twine_passage replaces one existing passage and creates destinations for new links using native behavior. Native HTML/Twee exports remain. External media and user-added remote formats remain external references; built-in formats run locally. Source and GPL-3.0 license travel with the Crux; npm ci --ignore-scripts && npm run build rebuilds runtime. Whole-editor publication unavailable. See UPSTREAM.md.',
};
export default template;
