import type { ToolTemplateFiles } from './index';
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
  [
    '../../wick-editor-crux/{src,public,runtime,engine}/**/*.{css,scss}',
    '!../../wick-editor-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
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
  ],
};
export default template;
