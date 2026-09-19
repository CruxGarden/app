import type { ToolTemplateFiles } from './index';
// Glyphr Studio 2 travels with the Crux: upstream's source, the Garden bridge, the
// lockfile and notices as text; the built app (runtime/) and its images as assets.
const source = import.meta.glob(
  [
    '../../glyphr-crux/{package.json,package-lock.json,jsconfig.json,raw.d.ts,eslint.config.js,scripts.js,LICENSE-gpl-3.0.txt,README.md,UPSTREAM.md,.cruxignore}',
    '../../glyphr-crux/{src,garden,licenses}/**/*.{js,cjs,mjs,ts,json,html,css,svg,txt,md,gs2}',
    '!../../glyphr-crux/**/node_modules/**',
    '!../../glyphr-crux/**/*.test.*',
    '!../../glyphr-crux/src/**/tests/**',
    '../../glyphr-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../glyphr-crux/runtime/**/*',
    '!../../glyphr-crux/runtime/**/*.css',
    '../../glyphr-crux/favicon.ico',
    '../../glyphr-crux/src/**/*.{png,jpg,jpeg,gif,ico,woff,woff2,ttf,otf,eot}',
    '!../../glyphr-crux/src/**/tests/**',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../glyphr-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../glyphr-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
