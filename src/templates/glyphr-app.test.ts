import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the font tool: upstream source, the bridge and validator, the licence, the built runtime and an empty project', async () => {
  const template = (await loadTemplate('glyphr-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'package.json',
    'package-lock.json',
    'src/index.html',
    'src/app/main.js',
    'src/garden/bridge.js',
    'src/garden/document.js',
    'garden/build.cjs',
    'licenses/NOTICES.md',
    'LICENSE-gpl-3.0.txt',
    'UPSTREAM.md',
    'runtime/index.html',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(paths.filter((p) => /\/tests\//.test(p) || /\.test\./.test(p))).toEqual([]);
  expect(paths.some((p) => /^runtime\/assets\/index-.*\.js$/.test(p))).toBe(true);
  expect(paths.some((p) => /^runtime\/LICENSE-gpl-3\.0\.txt$/.test(p))).toBe(true);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'runtime/index.html')!.encoding).toBe('asset-url');
  expect((template.meta?.settings as { entryFile?: string })?.entryFile).toBe('runtime/index.html');
}, 60000);
