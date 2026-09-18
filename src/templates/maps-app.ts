import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The map tool travels with the Crux: the shell around MapLibre GL and Terra Draw (pages,
// main.ts, edition.ts, bridge), the pinned package.json, notes, the validator and the built
// runtime. Text stays text so the Crux is portable.
const sources = import.meta.glob(
  [
    '../../maps-crux/{index.html,edition.html,package.json,package-lock.json,tsconfig.json,vite.config.ts,UPSTREAM.md,.cruxignore}',
    '../../maps-crux/{src,garden}/**/*',
    '!../../maps-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(
  ['../../maps-crux/runtime/**/*', '!../../maps-crux/runtime/**/*.map'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../maps-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../maps-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'maps', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Make a map: choose a basemap, add places by clicking, draw routes and areas, and name and colour them in the list. Save image in the bar puts the map picture into this Crux’s outputs; Share selected content publishes the map as a page.',
  context:
    'A map tool around the actual MapLibre GL (6.9.0, BSD-3) and Terra Draw (1.33.0, MIT) with OpenFreeMap tiles (OpenStreetMap data, no key). The Crux keeps the map as plain data in data/project.json: a name, a basemap (liberty, bright, positron, dark), the view and the features as GeoJSON with title, notes and colour. App Tools inspect the map, name it, choose the basemap, add a place at lng/lat, remove a place by id, fit the view and save the map picture as a PNG output. The public edition is the read-only map with its places. See UPSTREAM.md.',
};
export default template;
