import type { ToolTemplateFiles } from './index';
// The Fantasy Map Generator travels with the Crux: upstream's source, the Garden
// bridge, the lockfile and notices as text; the built app (runtime/) and its
// images, textures and heightmaps as assets.
const source = import.meta.glob(
  [
    '../../fmg-crux/{package.json,package-lock.json,tsconfig.json,vite.config.ts,LICENSE,README.md,UPSTREAM.md,.cruxignore}',
    '../../fmg-crux/{src,garden,licenses}/**/*.{js,cjs,mjs,ts,json,html,css,svg,txt,md}',
    '../../fmg-crux/public/**/*.{js,json,html,css,svg,txt,md,webmanifest}',
    '!../../fmg-crux/**/node_modules/**',
    '!../../fmg-crux/**/*.test.*',
    '../../fmg-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../fmg-crux/runtime/**/*',
    '!../../fmg-crux/runtime/**/*.css',
    '../../fmg-crux/public/**/*.{png,jpg,jpeg,gif,webp,ico,woff,woff2,ttf,eot}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../fmg-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../fmg-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
