import type { ToolTemplateFiles } from './index';
// The Notation tool travels with the Crux: the page, the starter tune, the bridge, the
// validator, notes and licences as text; abcjs and the piano soundfont as published assets.
const sources = import.meta.glob(
  [
    '../../abc-crux/{index.html,style.css,tune.abc,package.json,README.md,UPSTREAM.md}',
    '../../abc-crux/{garden,licenses}/**/*',
    '!../../abc-crux/**/node_modules/**',
    '!../../abc-crux/**/*.test.*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../abc-crux/runtime/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../abc-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../abc-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
