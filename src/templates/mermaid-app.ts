import type { ToolTemplateFiles } from './index';
const sources = import.meta.glob(
  '../../mermaid-crux/{*.json,*.yaml,*.js,*.mjs,LICENSE,*.md,{src,static,tests}/**/*.{ts,js,svelte,css,html,json,svg,md}}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../mermaid-crux/{runtime/**/*,{static,tests}/**/*.{png,jpg,woff,woff2,ttf}}',
    '!../../mermaid-crux/**/*.css',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
// Preserve stylesheet-relative URLs; Vite processes CSS imported with ?url.
const styles = import.meta.glob('../../mermaid-crux/runtime/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries({ ...sources, ...styles }).map(([path, content]) => ({
      path: path.replace('../../mermaid-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../mermaid-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    { path: '.cruxignore', content: '.svelte-kit/\n' },
  ],
};
export default template;
