import type { ToolTemplateFiles } from './index';
const sources = import.meta.glob(
  '../../jupyterlite-crux/{*.json,*.md,*.txt,LICENSE,.cruxignore,{scripts,garden,vendor}/**/*}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  ['../../jupyterlite-crux/runtime/**/*', '!../../jupyterlite-crux/runtime/**/*.css'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob('../../jupyterlite-crux/runtime/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries({ ...sources, ...styles }).map(([path, content]) => ({
      path: path.replace('../../jupyterlite-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../jupyterlite-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
