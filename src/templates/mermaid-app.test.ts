import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages native Mermaid Live Editor source and its static runtime', async () => {
  const t = (await loadTemplate('mermaid-app'))!;
  const paths = new Set(t.files.map((f) => f.path));
  for (const p of [
    'runtime/edit/index.html',
    'runtime/garden/bridge.js',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'src/lib/util/state.svelte.ts',
    'src/lib/garden.ts',
    'static/garden/model.js',
    'svelte.config.js',
    'vite.config.js',
    'garden-licenses.mjs',
    'package.json',
    'pnpm-lock.yaml',
    'LICENSE',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths.has(p), p).toBe(true);
}, 20000);
