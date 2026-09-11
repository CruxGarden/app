import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
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
const template: TemplateDefinition = {
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
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'mermaid', project: null }),
    },
    { path: '.cruxignore', content: '.svelte-kit/\n' },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/edit/index.html' } },
  greeting:
    'Create flowcharts, timelines, sequence diagrams and more in Mermaid Live Editor. Edit the source or configuration, use the native presets and history, then export SVG or PNG. Garden keeps the editable project.',
  context:
    'Actual Mermaid Live Editor source and static runtime. data/project.json carries native codeStore/configuration and saved histories. Use inspect_mermaid and set_mermaid_source while open. Native source/config errors are editable drafts. Rebuild with pnpm install and pnpm build; runtime/ is tracked, .svelte-kit/ and node_modules are ignored. Native SVG/PNG exports are supported. Local preview URLs are not publicly hosted diagrams. Whole-editor publishing is unavailable. See UPSTREAM.md.',
};
export default template;
