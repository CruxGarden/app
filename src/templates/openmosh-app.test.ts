import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('includes the actual upstream editor, its native tests, reproducible build configuration and local runtime', async () => {
  const template = (await loadTemplate('openmosh-app'))!;
  const paths = new Set(template.files.map((file) => file.path));
  for (const path of [
    'runtime/index.html',
    'src/App.svelte',
    'src/lib/components/editor/Editor.svelte',
    'src/lib/components/slideshow/SlideshowEditor.svelte',
    'src/garden/storage.test.ts',
    'package.json',
    'package-lock.json',
    'svelte.config.js',
    'vite.config.ts',
    'public/licenses/essentia.js-LICENSE.txt',
    'runtime/licenses/essentia.js-LICENSE.txt',
    'data/project.json',
  ])
    expect(paths.has(path), path).toBe(true);
  expect(template.meta?.settings).toMatchObject({ entryFile: 'runtime/index.html' });
  const packageJson = JSON.parse(
    template.files.find((file) => file.path === 'package.json')!.content,
  );
  expect(packageJson.scripts.build).toBe('vite build');
  expect(packageJson.dependencies['essentia.js']).toBeDefined();
}, 15000);
