import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The actual Record travels with the Crux: upstream's React source unchanged, the Garden bridge
// under src/garden, the pinned lockfile, notes, the validator and the built runtime. Text stays
// text so the Crux is portable.
const sources = import.meta.glob(
  [
    '../../recorder-crux/{index.html,package.json,package-lock.json,tsconfig.json,tsconfig.node.json,vite.config.ts,README.md,UPSTREAM.md,LICENSE,.cruxignore,.eslintrc,.prettierrc,.postcssrc,.stylelintrc,stylelint-config-order.json}',
    '../../recorder-crux/{src,garden}/**/*',
    '!../../recorder-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../recorder-crux/runtime/**/*', '../../recorder-crux/public/**/*'], { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({ path: path.replace('../../recorder-crux/', ''), content })),
    ...Object.entries(runtime).map(([path, content]) => ({ path: path.replace('../../recorder-crux/', ''), content, encoding: 'asset-url' as const })),
    { path: 'data/project.json', content: JSON.stringify({ version: 1, app: 'recorder', project: null }) },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Record your screen, your camera, or both with a camera bubble: choose a layout, press Record, and Stop when done. A finished recording saved from the app becomes an output of this Crux that OpenCut can use.',
  context:
    'The actual Record (addyosmani/recorder, dac533b, MIT): screen, camera or both with picture-in-picture, a teleprompter and a countdown, recorded as WebM in the browser. Inside a Crux the recording the app offers for download is kept as an output under exports/ (named from the bar’s Output name) and listed in data/project.json with the Crux’s name. App Tools inspect the recordings and name the Crux; recording starts and stops by hand. The MP4 conversion needs cross-origin isolation the Crux does not provide, so WebM is the format. See UPSTREAM.md.',
};
export default template;
