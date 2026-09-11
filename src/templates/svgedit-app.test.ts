import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages native vector editing, local extension dependencies and rebuild sources', async () => {
  const t = (await loadTemplate('svgedit-app'))!;
  const paths = t.files.map((f) => f.path);
  for (const path of [
    'runtime/index.html',
    'runtime/Editor.js',
    'runtime/garden/main.js',
    'runtime/extensions/vendor/browser-fs-access/dist/index.modern.js',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'src/editor/Editor.js',
    'packages/svgcanvas/svgcanvas.js',
    'garden/build.cjs',
    'package-lock.json',
    'LICENSE-MIT.txt',
  ])
    expect(paths).toContain(path);
  expect(paths.some((p) => p.includes('/node_modules/'))).toBe(false);
  expect(JSON.parse(t.files.find((f) => f.path === 'data/project.json')!.content)).toEqual({
    version: 1,
    app: 'svgedit',
    project: null,
  });
}, 30000);
