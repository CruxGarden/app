import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the native chemistry editor, rebuild sources and local-engine notices', async () => {
  const t = (await loadTemplate('ketcher-app'))!;
  const paths = t.files.map((f) => f.path);
  for (const path of [
    'runtime/index.html',
    'main.jsx',
    'garden/model.js',
    'scripts/build.cjs',
    'package-lock.json',
    'LICENSE',
    'runtime/THIRD_PARTY_NOTICES.txt',
  ])
    expect(paths).toContain(path);
  const pkg = JSON.parse(t.files.find((f) => f.path === 'package.json')!.content);
  expect(pkg.dependencies['ketcher-react']).toBe('3.13.0');
  expect(pkg.dependencies['ketcher-standalone']).toBe('3.13.0');
  expect(JSON.parse(t.files.find((f) => f.path === 'data/project.json')!.content)).toEqual({
    version: 1,
    app: 'ketcher',
    project: null,
  });
}, 30000);
