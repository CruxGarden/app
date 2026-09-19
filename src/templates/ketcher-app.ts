import type { ToolTemplateFiles } from './index';
const source = import.meta.glob(
  [
    '../../ketcher-crux/{*.json,*.js,*.jsx,*.html,*.md,LICENSE,.cruxignore}',
    '../../ketcher-crux/{garden,scripts}/**/*',
    '../../ketcher-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  ['../../ketcher-crux/runtime/**/*', '!../../ketcher-crux/runtime/**/*.css'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../ketcher-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../ketcher-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
