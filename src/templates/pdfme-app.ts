import type { ToolTemplateFiles } from './index';
// The layout tool travels with the Crux: the shell around pdfme (page, main.ts, bridge),
// the pinned package.json, notes, the validator and the built runtime. Text stays text so
// the Crux is portable.
const sources = import.meta.glob(
  [
    '../../pdfme-crux/{index.html,package.json,package-lock.json,tsconfig.json,vite.config.ts,UPSTREAM.md,.cruxignore}',
    '../../pdfme-crux/{src,garden}/**/*',
    '!../../pdfme-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../pdfme-crux/runtime/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../pdfme-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../pdfme-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
