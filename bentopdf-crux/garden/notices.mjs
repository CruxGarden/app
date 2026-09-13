import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Runtime dependency notices from the pinned lockfile's production dependencies.
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
let text =
  'BentoPDF local build dependency notices.\nUpstream BentoPDF is licensed under the AGPL-3.0-only: see ../LICENSE. Modified source, the pinned lockfile and UPSTREAM.md accompany this runtime. The offline WASM copies under wasm/ are @bentopdf/pymupdf-wasm (PyMuPDF, AGPL-3.0, with Pyodide and its wheels) and @bentopdf/gs-wasm (Ghostscript, AGPL-3.0); libreoffice-wasm is @matbee/libreoffice-converter (LibreOffice, MPL-2.0); coherentpdf.browser.min.js is CoherentPDF (AGPL-3.0); the pdf.js viewers are Apache-2.0; bentopdf-pdfium and bentopdf-viewer are the upstream authors’ packages under vendor/.\n';
for (const name of Object.keys(pkg.dependencies || {}).sort()) {
  const dir = join(root, 'node_modules', name);
  if (!existsSync(join(dir, 'package.json'))) continue;
  const dep = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  text += `\n=== ${dep.name}@${dep.version}: ${JSON.stringify(dep.license || 'See source')} ===\n`;
  for (const file of [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'license',
    'COPYING',
  ])
    if (existsSync(join(dir, file)))
      text += `\n${file}\n${readFileSync(join(dir, file), 'utf8')}\n`;
}
writeFileSync(join(root, 'runtime/THIRD_PARTY_NOTICES.txt'), text);
for (const file of ['LICENSE', 'UPSTREAM.md'])
  copyFileSync(join(root, file), join(root, 'runtime', file));
console.log('Wrote runtime notices.');
