import type { ToolTemplateFiles } from './index';
// Signal travels with the Crux: upstream's source packages, the Garden bridge,
// the lockfile and notices as text; the built app (runtime/) with its sounds as assets.
const source = import.meta.glob(
  [
    '../../signal-crux/{package.json,package-lock.json,turbo.json,biome.json,LICENSE,README.md,UPSTREAM.md,.cruxignore,.gitignore}',
    '../../signal-crux/app/*.{html,json,mts,mjs}',
    '../../signal-crux/app/src/**/*.{ts,tsx,json,svg,md}',
    '../../signal-crux/app/public/**/*.{svg,webmanifest,html}',
    '../../signal-crux/packages/*/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,README.md}',
    '../../signal-crux/packages/*/src/**/*.{ts,tsx,json,svg,md}',
    '../../signal-crux/electron/src/*.ts',
    '../../signal-crux/garden/**/*.{js,cjs,mjs,ts}',
    '../../signal-crux/licenses/**/*',
    '!../../signal-crux/**/node_modules/**',
    '!../../signal-crux/**/*.test.*',
    '!../../signal-crux/**/test/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../signal-crux/runtime/**/*',
    '../../signal-crux/app/src/assets/*.png',
    '../../signal-crux/app/public/*.png',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../signal-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../signal-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
