import type { ToolTemplateFiles } from './index';
// The actual Record travels with the Crux: upstream's React source unchanged, the Garden bridge
// under src/garden, the pinned lockfile, notes, the validator and the built runtime. Text stays
// text so the Crux is portable.
const sources = import.meta.glob(
  [
    '../../recorder-crux/{index.html,package.json,package-lock.json,tsconfig.json,tsconfig.node.json,vite.config.ts,README.md,UPSTREAM.md,LICENSE,.cruxignore,.eslintrc,.prettierrc,.postcssrc,.stylelintrc,stylelint-config-order.json}',
    '../../recorder-crux/{src,garden}/**/*',
    '!../../recorder-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(
  ['../../recorder-crux/runtime/**/*', '../../recorder-crux/public/**/*'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../recorder-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../recorder-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
