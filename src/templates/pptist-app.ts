import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The actual PPTist editor travels with the Crux (AGPL-3.0): Vue source, fonts,
// bundled templates, the Garden bridge, the pinned lockfile, the built runtime and notices.
const assets = import.meta.glob(
  [
    '../../pptist-crux/{package.json,package-lock.json,index.html,vite.config.ts,tsconfig.json,tsconfig.app.json,tsconfig.node.json,env.d.ts,components.d.ts,LICENSE,UPSTREAM.md,README.md,.cruxignore}',
    '../../pptist-crux/{src,public,garden,runtime}/**/*',
    '!../../pptist-crux/**/node_modules/**',
    '!../../pptist-crux/**/*.css',
    '!../../pptist-crux/**/*.scss',
    '!../../pptist-crux/**/*.map',
    '!../../pptist-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
// Stylesheets and SCSS sources stay text: the host's Vite must not preprocess the fork's SCSS.
const styles = import.meta.glob(
  ['../../pptist-crux/runtime/**/*.css', '../../pptist-crux/src/**/*.css', '../../pptist-crux/src/**/*.scss'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../pptist-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../pptist-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    { path: 'data/project.json', content: JSON.stringify({ version: 1, app: 'pptist', project: null }) },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Build a presentation with PPTist. Add slides, place text, shapes, pictures and charts, pick a theme, then present from the play button. Garden saves the deck with every change.',
  context:
    'Actual PPTist 2.0.0, pinned upstream e491258 (interface in Chinese; PPTist has no i18n). The presentation is PPTist’s own JSON export shape saved as data/project.json after each change, with inserted pictures, video and audio stored as binary Artifacts under data/assets; reopening restores it. App Tools inspect the deck (title, slides and their text, size, theme colours), set the title and add a slide with optional text; they never start the presentation. AI generation, image search and remote templates need PPTist’s hosted server and fail clearly offline; bundled templates and fonts are local. Source, lockfile and notices travel with the Crux; npm ci --ignore-scripts && npm run build:garden rebuilds runtime/. See UPSTREAM.md.',
};
export default template;
