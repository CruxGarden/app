import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
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
const template: TemplateDefinition = {
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
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'piskel', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'dest/prod/index.html' } },
  greeting:
    'Make pixel art and animated sprites in Piskel. Draw with the native tools, add frames and layers, then export PNG, GIF or an editable .piskel file. Garden saves your editable sprite automatically.',
  context:
    'Actual Piskel source and runtime. Native sprites, layers and frames are saved in data/project.json with fingerprinted PNG sprite sheets in data/assets. Use inspect_piskel and set_piskel_speed while the app is open. Rebuild with npm ci --ignore-scripts and npm run build; dest/prod is tracked. Native browser backup libraries and preferences are separate. Native file exports remain; whole-editor publishing is unavailable. See UPSTREAM.md.',
};
export default template;
