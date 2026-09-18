import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The layout tool travels with the Crux: the shell around pdfme (page, main.ts, bridge),
// the pinned package.json, notes, the validator and the built runtime. Text stays text so
// the Crux is portable.
const sources = import.meta.glob(
  [
    '../../pdfme-crux/{index.html,package.json,package-lock.json,tsconfig.json,vite.config.ts,UPSTREAM.md,.cruxignore}',
    '../../pdfme-crux/{src,garden}/**/*',
    '!../../pdfme-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(
  ['../../pdfme-crux/runtime/**/*', '!../../pdfme-crux/runtime/**/*.map'],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../pdfme-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../pdfme-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({ version: 1, app: 'pdfme', project: null }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Lay out a page: pick a page size, add text, images, shapes, tables or QR codes from the designer, arrange them, and use Preview to see the page. Save PDF or Save image in the bar puts the finished page into this Crux’s outputs for a site, a notebook or a print.',
  context:
    'A page layout tool around the actual pdfme 6.1.12 (MIT): the Designer for laying out a page, the Viewer for previews, the generator for PDF and the converter for PNG. The Crux keeps the layout as plain data in data/project.json: a name, a page choice (a4-portrait, a4-landscape, letter-portrait, letter-landscape, a5-portrait, square) and the pdfme template (schemas per page, millimetre coordinates). App Tools inspect the layout, name it, choose the page, add a text block at x/y with width/height and font size, and save the page as a PDF or PNG output. See UPSTREAM.md.',
};
export default template;
