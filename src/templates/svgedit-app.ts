import type { ToolTemplateFiles } from './index';
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
const template: ToolTemplateFiles = {
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
  ],
};
export default template;
