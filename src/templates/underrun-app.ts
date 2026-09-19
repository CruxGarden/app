import type { ToolTemplateFiles } from './index';
// The actual Underrun (MIT) runs from its sources: index.html is upstream's
// debug entry, so edits are live on reload; the 13 KB build tooling travels too.
const sources = import.meta.glob(
  [
    '../../underrun-crux/{index.html,index-debug.html,build.sh,shrinkit.js,package.json,LICENSE.md,README.md,UPSTREAM.md,.cruxignore}',
    '../../underrun-crux/source/**/*.js',
    '../../underrun-crux/build/dummy.txt',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const media = import.meta.glob(['../../underrun-crux/m/*.png'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../underrun-crux/', ''),
      content,
    })),
    ...Object.entries(media).map(([path, content]) => ({
      path: path.replace('../../underrun-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
