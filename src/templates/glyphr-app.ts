import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// Glyphr Studio 2 travels with the Crux: upstream's source, the Garden bridge, the
// lockfile and notices as text; the built app (runtime/) and its images as assets.
const source = import.meta.glob(
  [
    '../../glyphr-crux/{package.json,package-lock.json,jsconfig.json,raw.d.ts,eslint.config.js,scripts.js,LICENSE-gpl-3.0.txt,README.md,UPSTREAM.md,.cruxignore}',
    '../../glyphr-crux/{src,garden,licenses}/**/*.{js,cjs,mjs,ts,json,html,css,svg,txt,md,gs2}',
    '!../../glyphr-crux/**/node_modules/**',
    '!../../glyphr-crux/**/*.test.*',
    '!../../glyphr-crux/src/**/tests/**',
    '../../glyphr-crux/runtime/**/*.css',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const assets = import.meta.glob(
  [
    '../../glyphr-crux/runtime/**/*',
    '!../../glyphr-crux/runtime/**/*.css',
    '../../glyphr-crux/favicon.ico',
    '../../glyphr-crux/src/**/*.{png,jpg,jpeg,gif,ico,woff,woff2,ttf,otf,eot}',
    '!../../glyphr-crux/src/**/tests/**',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(source).map(([path, content]) => ({
      path: path.replace('../../glyphr-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../glyphr-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'glyphr', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Your font opens in Glyphr Studio: draw glyphs on the Characters page, set metrics under Settings, and every change saves to Garden. Save font to Cruxspace builds an OTF, TTF, WOFF or WOFF2 as an output. Ask me to name the font or draw a letter from SVG.',
  context:
    'A font editor around the actual Glyphr Studio 2 (2.10, GPL-3.0-or-later; the fork keeps upstream’s source and notices, built into runtime/). The whole Glyphr Studio project (the same object a .gs2 file holds) lives in data/project.json with the font’s name; the bridge saves after every history step. App Tools: inspect_font, set_font_name, set_glyph_svg (draw one character from SVG outlines: an <svg> with paths/polygons/rects/circles; the outlines are flipped and scaled to the em), save_font (otf/ttf/woff/woff2 into exports/ — at least one glyph must be drawn). Read data/project.json before large changes; never edit runtime/. Sharing the editor as a website is not offered; the built fonts are the outputs. See UPSTREAM.md.',
};
export default template;
