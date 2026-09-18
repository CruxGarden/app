import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The Fantasy Map Generator travels with the Crux: upstream's source, the Garden
// bridge, the lockfile and notices as text; the built app (runtime/) and its
// images, textures and heightmaps as assets.
const source = import.meta.glob(
  [
    '../../fmg-crux/{package.json,package-lock.json,tsconfig.json,vite.config.ts,LICENSE,README.md,UPSTREAM.md,.cruxignore}',
    '../../fmg-crux/{src,garden,licenses}/**/*.{js,cjs,mjs,ts,json,html,css,svg,txt,md}',
    '../../fmg-crux/public/**/*.{js,json,html,css,svg,txt,md,webmanifest}',
    '!../../fmg-crux/**/node_modules/**',
    '!../../fmg-crux/**/*.test.*',
    '../../fmg-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../fmg-crux/runtime/**/*',
    '!../../fmg-crux/runtime/**/*.map',
    '!../../fmg-crux/runtime/**/*.css',
    '../../fmg-crux/public/**/*.{png,jpg,jpeg,gif,webp,ico,woff,woff2,ttf,eot}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../fmg-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../fmg-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'fmg', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'A new world opens in Azgaar’s Fantasy Map Generator: coastlines, rivers, states, cultures, burgs and roads, all editable. The map saves to Garden as you work; Save image to Cruxspace renders it as a PNG or SVG output. Ask me to name the world, describe it, or generate another.',
  context:
    'A world-building tool around the actual Fantasy Map Generator (Azgaar, 1.152, MIT; the fork keeps upstream’s source and notices, built into runtime/). The whole .map save lives in data/project.json with the world’s name and seed; the bridge saves it after changes. App Tools: inspect_map (name, seed, size, cells, burgs, states, cultures), set_map_name, new_map (a fresh world, optional seed — ask before replacing an edited map), save_map_image (PNG or SVG into exports/). The app’s own menus (layers, tools, style, export, notes) do everything else; its “Save to machine” downloads a .map that also loads here. Never edit runtime/. Sharing the editor as a website is not offered; the rendered images are the outputs. See UPSTREAM.md.',
};
export default template;
