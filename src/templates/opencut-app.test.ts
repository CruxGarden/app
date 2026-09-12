import { expect, it } from 'vitest';
import { loadTemplate } from './index';
import { readFileSync } from 'node:fs';
it('packages the native video editor, WASM, original source and a reproducible install', async () => {
  const template = (await loadTemplate('opencut-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'apps/web/src/core/managers/project-manager.ts',
    'apps/web/src/services/renderer/scene-exporter.ts',
    'apps/web/public/effects/preview.jpg',
    'garden/state.ts',
    'garden/bridge.js',
    'garden/main.tsx',
    'garden/notices.mjs',
    'garden/model.test.mjs',
    'vite.config.mjs',
    'index.html',
    '.npmrc',
    'package-lock.json',
    'LICENSE',
  ])
    expect(paths).toContain(path);
  expect(paths.some((path) => path.endsWith('.wasm'))).toBe(true);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.some((path) => path.includes('/node_modules/') || path.endsWith('.map'))).toBe(
    false,
  );
  const notices = readFileSync('opencut-crux/runtime/THIRD_PARTY_NOTICES.txt', 'utf8');
  expect(notices).toContain('opencut-wasm@0.2.10');
  expect(notices).toContain('mediabunny@1.41.0');
  expect(template.files.find((file) => file.path === 'data/project.json')?.content).toBe(
    JSON.stringify({ version: 1, app: 'opencut', project: null }),
  );
}, 30000);
