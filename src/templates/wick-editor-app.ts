import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The actual Wick Editor travels with the Crux (GPL-3.0): React source, the engine
// source and its prebuilt bundle, examples and fonts, the pinned lockfile, the Garden
// bridge, the built runtime and notices. Stylesheets and SCSS stay text.
const assets = import.meta.glob(
  [
    '../../wick-editor-crux/{package.json,package-lock.json,yarn.lock,LICENSE.md,CREDITS.md,README.md,README-create-react-app.md,UPSTREAM.md,.cruxignore}',
    '../../wick-editor-crux/{src,public,engine,garden,runtime,svg}/**/*',
    '!../../wick-editor-crux/**/node_modules/**',
    '!../../wick-editor-crux/**/*.css',
    '!../../wick-editor-crux/**/*.scss',
    '!../../wick-editor-crux/**/*.map',
    '!../../wick-editor-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob(
  ['../../wick-editor-crux/{src,public,runtime,engine}/**/*.{css,scss}', '!../../wick-editor-crux/**/node_modules/**'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../wick-editor-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../wick-editor-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    { path: 'data/project.json', content: JSON.stringify({ version: 1, app: 'wick-editor', project: null }) },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Animate with Wick Editor: draw on the canvas, add frames and layers on the timeline, attach scripts to make it interactive, then press play. Garden saves the project as its own .wick file with every change.',
  context:
    'Actual Wick Editor 1.19.3 with its engine, pinned upstream f34f0d9 (a 2021 create-react-app that builds only on Node 14; the built runtime travels with the Crux). The project’s own .wick file is the Garden document, stored as a binary Artifact under data/assets and referenced from data/project.json; reopening restores it. App Tools inspect the project (name, frame rate, size, frames, layers, assets), set the name and set the frame rate; they never play the preview. Wick’s browser autosave still runs for the session but is not the document. The Plausible analytics tag was removed. See UPSTREAM.md.',
};
export default template;
