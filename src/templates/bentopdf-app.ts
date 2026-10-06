import type { ToolTemplateFiles } from './index';
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
const template: ToolTemplateFiles = {
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
  ],
};
export default template;
