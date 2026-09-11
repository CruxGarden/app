import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the native model editor, local assets, source and dependency notices', async () => {
  const t = (await loadTemplate('blockbench-app'))!;
  const paths = t.files.map((f) => f.path);
  for (const path of [
    'runtime/index.html',
    'runtime/dist/bundle.js',
    'runtime/garden/main.js',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'js/main.ts',
    'js/formats/bbmodel.js',
    'garden/build.cjs',
    'build.js',
    'package-lock.json',
    'LICENSE.MD',
  ])
    expect(paths).toContain(path);
  const root = resolve('blockbench-crux');
  const inputs = Object.keys(
    JSON.parse(readFileSync(resolve(root, 'dist/esbuild-metafile.json'), 'utf8')).inputs,
  );
  for (const input of inputs) {
    const source = input.includes(root + '/')
      ? input.slice(input.indexOf(root + '/') + root.length + 1)
      : input;
    if (!source.includes('node_modules/') && existsSync(resolve(root, source)))
      expect(paths, `Missing native build input: ${source}`).toContain(source);
  }
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.some((p) => p.includes('/node_modules/'))).toBe(false);
  expect(JSON.parse(t.files.find((f) => f.path === 'data/project.json')!.content)).toEqual({
    version: 1,
    app: 'blockbench',
    project: null,
  });
}, 30000);
