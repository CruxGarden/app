import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the form builder: form-js with license, the builder page, the bridge, the edition script', async () => {
  const template = (await loadTemplate('formjs-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'index.html',
    'style.css',
    'builder.js',
    'vendor/form-editor.umd.js',
    'vendor/form-viewer.umd.js',
    'vendor/form-js-editor.css',
    'vendor/form-js.css',
    'vendor/flatpickr/light.css',
    'vendor/LICENSE',
    'vendor/README.md',
    'garden/bridge.js',
    'garden/document.js',
    'scripts/edition.mjs',
    'package.json',
    'UPSTREAM.md',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.every((f) => f.encoding !== 'asset-url')).toBe(true);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe('index.html');
});
