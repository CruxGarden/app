import type { ToolTemplateFiles } from './index';
const sources = import.meta.glob(
  '../../piskel-crux/{*.js,*.json,*.md,LICENSE,{src,scripts,vite-plugins,tests}/**/*.{js,mjs,ts,json,html,css,md,txt,svg}}',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../piskel-crux/{dest/prod/**/*,{src,scripts,tests}/**/*.{png,jpg,jpeg,gif,woff,woff2,ttf,eot,piskel,zip}}',
    '!../../piskel-crux/**/*.css',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
// Preserve stylesheet-relative URLs; Vite processes CSS imported with ?url.
const styles = import.meta.glob('../../piskel-crux/dest/prod/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: ToolTemplateFiles = {
  files: [
    ...Object.entries({ ...sources, ...styles }).map(([path, content]) => ({
      path: path.replace('../../piskel-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../piskel-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
  ],
};
export default template;
