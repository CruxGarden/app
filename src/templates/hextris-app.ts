import type { ToolTemplateFiles } from './index';
// The actual Hextris game (GPL-3.0) runs from its sources with no build step.
const assets = import.meta.glob(
  [
    '../../hextris-crux/{index.html,LICENSE.md,README.md,UPSTREAM.md,.cruxignore,favicon.ico,manifest.webmanifest}',
    '../../hextris-crux/{js,vendor,images,garden}/**/*',
    '../../hextris-crux/style/**/*',
    '!../../hextris-crux/**/*.css',
    '!../../hextris-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob(['../../hextris-crux/style/**/*.css'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../hextris-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../hextris-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
