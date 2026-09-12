import { expect, it } from 'vitest';
import { loadTemplate } from './index';
import { readFileSync } from 'node:fs';
it('packages the native kanban views, local adaptation, source and a reproducible install', async () => {
  const template = (await loadTemplate('kan-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'runtime/LICENSE',
    'apps/web/src/views/board/index.tsx',
    'apps/web/src/views/card/index.tsx',
    'apps/web/src/styles/globals.css',
    'packages/shared/src/utils/dueDateFilters.ts',
    'packages/api/src/schemas/board.ts',
    'garden/model.ts',
    'garden/bridge.js',
    'garden/document.js',
    'garden/notices.mjs',
    'garden/model.test.ts',
    'vite.config.ts',
    'index.html',
    'package-lock.json',
    '.npmrc',
    'package.upstream.json',
    'LICENSE',
    'UPSTREAM.md',
    '.cruxignore',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(
    paths.some(
      (path) =>
        path.includes('/node_modules/') ||
        path.endsWith('.map') ||
        path.startsWith('packages/db/') ||
        path.startsWith('packages/e2e/'),
    ),
  ).toBe(false);
  const notices = readFileSync('kan-crux/runtime/THIRD_PARTY_NOTICES.txt', 'utf8');
  expect(notices).toContain('AGPL-3.0');
  expect(notices).toContain('@tanstack/react-query@');
  expect(notices).toContain('nanoid@5.1.16');
  expect(template.files.find((file) => file.path === 'data/project.json')?.content).toBe(
    JSON.stringify({ version: 1, app: 'kan', project: null }),
  );
}, 30000);
