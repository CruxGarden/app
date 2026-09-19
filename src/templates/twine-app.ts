import type { ToolTemplateFiles } from './index';
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
const template: ToolTemplateFiles = {
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
  ],
};
export default template;
