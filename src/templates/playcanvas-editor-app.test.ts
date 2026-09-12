import { expect, it } from 'vitest';
import { loadTemplate } from './index';
import { readFileSync } from 'node:fs';
it('packages the actual local editor, engine, rebuildable source and notices', async () => {
  const template = (await loadTemplate('playcanvas-editor-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/launch.html',
    'runtime/js/editor.js',
    'runtime/js/playcanvas.js',
    'runtime/js/monaco-editor/min/vs/loader.js',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'src/editor/index.ts',
    'src/editor-api/entities.ts',
    'garden/provider.js',
    'garden/build.mjs',
    'vite.config.mjs',
    'package-lock.json',
    'LICENSE',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.some((path) => path.includes('/node_modules/') || path.startsWith('dist/'))).toBe(
    false,
  );
  expect(readFileSync('playcanvas-editor-crux/runtime/THIRD_PARTY_NOTICES.txt', 'utf8')).toContain(
    'playcanvas@2.22.1',
  );
  expect(template.files.find((file) => file.path === 'data/project.json')?.content).toBe(
    JSON.stringify({ version: 1, app: 'playcanvas-editor', project: null }),
  );
}, 30000);
