import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual PPTist editor: runtime, source, fonts, templates, bridge and notices', async () => {
  const template = (await loadTemplate('pptist-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'runtime/LICENSE',
    'runtime/mocks/slides.json',
    'src/App.vue',
    'src/garden/bridge.ts',
    'src/store/slides.ts',
    'garden/document.js',
    'public/mocks/template_1.json',
    'vite.config.ts',
    'package-lock.json',
    'LICENSE',
    'UPSTREAM.md',
    '.cruxignore',
    'garden/shared/command-session.js',
    'garden/shared/command-session.d.ts',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.some((p) => p.includes('/node_modules/') || p.endsWith('.map'))).toBe(false);
  expect(
    paths.filter((p) => p.startsWith('runtime/assets/') && p.endsWith('.woff2')).length,
  ).toBeGreaterThan(5);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe(
    'runtime/index.html',
  );
}, 60000);
