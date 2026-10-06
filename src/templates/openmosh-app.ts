import type { ToolTemplateFiles } from './index';
const sources = import.meta.glob(
  [
    '../../openmosh-crux/{src/**/*,tests/**/*,playwright.config.ts,package.json,package-lock.json,index.html,vite.config.ts,svelte.config.js,.prettierrc.json,.prettierignore,tsconfig.*.json,LICENSE,README.md,UPSTREAM.md,NOTICES.md}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  ['../../openmosh-crux/{runtime,public}/**/*', '!../../openmosh-crux/**/*.css'],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;
// Preserve stylesheet-relative URLs; Vite processes CSS imported with ?url.
const styles = import.meta.glob('../../openmosh-crux/{runtime,public}/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries({ ...sources, ...styles }).map(([path, content]) => ({
      path: path.replace('../../openmosh-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../openmosh-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
