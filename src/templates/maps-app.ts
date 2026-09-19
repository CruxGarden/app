import type { ToolTemplateFiles } from './index';
// The map tool travels with the Crux: the shell around MapLibre GL and Terra Draw (pages,
// main.ts, edition.ts, bridge), the pinned package.json, notes, the validator and the built
// runtime. Text stays text so the Crux is portable.
const sources = import.meta.glob(
  [
    '../../maps-crux/{index.html,edition.html,package.json,package-lock.json,tsconfig.json,vite.config.ts,UPSTREAM.md,.cruxignore}',
    '../../maps-crux/{src,garden}/**/*',
    '!../../maps-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../maps-crux/runtime/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../maps-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../maps-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
