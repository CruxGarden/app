import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the fantasy map tool: upstream source, the bridge and validator, the licence, the built runtime and an empty project', async () => {
  const template = (await loadTemplate('fmg-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'src/index.html',
    'src/main.ts',
    'garden/bridge.js',
    'garden/document.js',
    'garden/build.cjs',
    'licenses/NOTICES.md',
    'LICENSE',
    'UPSTREAM.md',
    'runtime/index.html',
    'public/libs/jquery-3.1.1.min.js',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(paths.filter((p) => /\.test\./.test(p))).toEqual([]);
  expect(paths.some((p) => /^runtime\/index-.*\.js$/.test(p))).toBe(true);
  expect(paths).toContain('runtime/garden/bridge.js');
  expect(paths.some((p) => /^runtime\/images\/textures\//.test(p))).toBe(true);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'runtime/index.html')!.encoding).toBe('asset-url');
  expect((template.meta?.settings as { entryFile?: string })?.entryFile).toBe('runtime/index.html');
}, 60_000); // 23 MB of upstream assets glob in slowly under a full-suite load
