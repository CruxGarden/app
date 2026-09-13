import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual BentoPDF: runtime with offline WASM, source, vendored engines, bridge and notices', async () => {
  const template = (await loadTemplate('bentopdf-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/rotate-pdf.html',
    'runtime/merge-pdf.html',
    'runtime/wasm/gs/assets/gs.wasm',
    'runtime/wasm/pymupdf/dist/index.js',
    'runtime/libreoffice-wasm/soffice.js',
    'runtime/pdfjs-viewer/pdf.worker.mjs',
    'runtime/qpdf.wasm',
    'runtime/coherentpdf.browser.min.js',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'runtime/LICENSE',
    'src/js/garden/bridge.ts',
    'src/js/utils/helpers.ts',
    'src/js/main.ts',
    'src/pages/rotate-pdf.html',
    'simple-index.html',
    'public/qpdf.wasm',
    'vendor/bentopdf-pdfium/bentopdf-pdfium-8ff5002c6cd5.tgz',
    'garden/document.js',
    'garden/build.sh',
    'package-lock.json',
    'LICENSE',
    'UPSTREAM.md',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  // The large public/ folders travel once, under runtime/.
  expect(
    paths.some(
      (p) =>
        p.startsWith('public/libreoffice-wasm/') ||
        p.startsWith('public/wasm/') ||
        p.startsWith('public/pdfjs-viewer/'),
    ),
  ).toBe(false);
  expect(
    paths.some(
      (p) =>
        p.includes('/node_modules/') ||
        p.endsWith('.map') ||
        p.endsWith('.br') ||
        p.endsWith('.gz'),
    ),
  ).toBe(false);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe(
    'runtime/index.html',
  );
}, 60000);
