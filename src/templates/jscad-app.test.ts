import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages JSCAD: the page, the starter model, the bridge, the validator, the licences, upstream’s bundle, styles, fonts and examples', async () => {
  const template = (await loadTemplate('jscad-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'index.html',
    'style.css',
    'model.js',
    'garden/bridge.js',
    'garden/document.js',
    'licenses/jscad-LICENSE.txt',
    'licenses/open-sans-LICENSE.txt',
    'licenses/NOTICES.md',
    'dist/jscad-web.min.js',
    'css/demo.css',
    'css/codemirror.css',
    'fonts/Open_Sans/OpenSans-Regular.ttf',
    'imgs/favicon.png',
    'examples/examples.json',
    'examples/core/primitives/primitives3D.js',
    'UPSTREAM.md',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(paths.some((p) => p.includes('.test.') || p.includes('node_modules'))).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'dist/jscad-web.min.js')!.encoding).toBe('asset-url');
  expect(template.files.find((f) => f.path === 'css/demo.css')!.encoding).toBeUndefined();
  expect(template.files.find((f) => f.path === 'css/demo.css')!.content).toContain('../fonts/Open_Sans/OpenSans-Regular.ttf');
  expect(template.files.find((f) => f.path === 'model.js')!.content).toContain('getParameterDefinitions');
  expect((template.meta?.settings as { entryFile?: string })?.entryFile).toBe('index.html');
}, 60_000);
