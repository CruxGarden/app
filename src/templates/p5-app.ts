import type { ToolTemplateFiles } from './index';
// The sketch tool travels with the Crux: the page, the starter sketch, the bridge, the
// validator, notes and licences as text; p5 itself as the published library.
const sources = import.meta.glob(
  [
    '../../p5-crux/{index.html,sketch.js,style.css,package.json,README.md,UPSTREAM.md}',
    '../../p5-crux/{garden,licenses}/**/*',
    '!../../p5-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../p5-crux/runtime/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../p5-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../p5-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
