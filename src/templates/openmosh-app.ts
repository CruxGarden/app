import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
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
const template: TemplateDefinition = {
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
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'openmosh', local: {}, databases: {} }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'This is OpenMosh: import images or video, build an effects chain, edit a timeline, or make a slideshow with music. Use its original export controls for images and video. Your media and editing sessions save with Growth; reopen them from OpenMosh’s saved work. Save frame to Cruxspace makes a still available to other Cruxes.',
  context:
    'This Crux contains the actual OpenMosh 0.7.3 app and editable source. data/project.json preserves native IndexedDB records and OpenMosh settings; data/assets holds content-addressed original media, audio and custom fonts. Never invent a replacement schema. Use inspect_openmosh before set_openmosh_effect; commands require the actual editor open and use its undo path. Single and selected static Editor effect chains support agent changes; all modes retain their manual controls. Use a Task for app source customization, then npm ci and npm run build; Workshop entry is runtime/index.html. Read UPSTREAM.md and NOTICES.md before distribution. Local creation and complete Crux export are supported; website publication is not enabled. Native media is limited to 128 MB per file; Cruxspace still outputs use Garden’s existing raster limits.',
};
export default template;
