import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// The actual BentoPDF travels with the Crux (AGPL-3.0): source, the vendored engine packages,
// the pinned lockfile, the Garden bridge, the built runtime with its offline WASM and notices.
// The large public/ folders (LibreOffice, the pdf.js viewers, the PyMuPDF and Ghostscript WASM)
// travel once, under runtime/; garden/build.sh restores public/ from there. Stylesheets stay text.
const assets = import.meta.glob(
  [
    '../../bentopdf-crux/{package.json,package-lock.json,LICENSE,README.md,UPSTREAM.md,.cruxignore,.env.example,tsconfig.json,vite.config.ts,vitest.config.ts,eslint.config.mjs,.prettierrc,.prettierignore,serve.json}',
    '../../bentopdf-crux/*.html',
    '../../bentopdf-crux/{src,public,vendor,scripts,garden,runtime,signatures}/**/*',
    '!../../bentopdf-crux/public/{libreoffice-wasm,pdfjs-annotation-viewer,pdfjs-viewer,wasm}/**',
    '!../../bentopdf-crux/**/node_modules/**',
    '!../../bentopdf-crux/**/*.css',
    '!../../bentopdf-crux/**/*.map',
    '!../../bentopdf-crux/**/*.br',
    '!../../bentopdf-crux/**/*.gz',
    '!../../bentopdf-crux/**/.DS_Store',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const styles = import.meta.glob(
  [
    '../../bentopdf-crux/{src,public,runtime}/**/*.css',
    '!../../bentopdf-crux/public/{libreoffice-wasm,pdfjs-annotation-viewer,pdfjs-viewer,wasm}/**',
    '!../../bentopdf-crux/**/node_modules/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(styles).map(([path, content]) => ({
      path: path.replace('../../bentopdf-crux/', ''),
      content,
    })),
    ...Object.entries(assets).map(([path, content]) => ({
      path: path.replace('../../bentopdf-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    {
      path: 'data/project.json',
      content: JSON.stringify({
        version: 1,
        app: 'bentopdf',
        project: { name: 'PDF work', documents: [] },
      }),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'runtime/index.html' } },
  greeting:
    'Work on PDFs with BentoPDF: pick a tool, load a file, and the result is saved to this Crux instead of downloaded. Every paper you load and everything made from it stays here.',
  context:
    'Actual BentoPDF 2.8.8 (Simple Mode: every tool, no marketing pages), pinned upstream 597e369, built with its own Vite toolchain into runtime/ with offline PyMuPDF, Ghostscript, CoherentPDF, LibreOffice and pdf.js. Inside the Crux every result a tool would download is saved as a binary Artifact under data/assets and every loaded file is kept the same way; data/project.json lists them (name, type, size, pages, tool, time). App Tools inspect that list, name the project, rotate a document and merge documents; they add results and never delete. OCR and the digital-signature certificate proxy still use the network, as upstream. See UPSTREAM.md.',
};
export default template;
