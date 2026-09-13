import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the whole web-synth app: source, engine, bridge, runtime and notices', async () => {
  const template = (await loadTemplate('web-synth-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'runtime/LICENSE',
    'src/index.tsx',
    'src/persistance.ts',
    'engine/engine/src/lib.rs',
    'engine/Cargo.lock',
    'public/FMSynthAWP.js',
    'garden/bridge.ts',
    'garden/document.js',
    'garden/notices.mjs',
    'vite.config.mts',
    'index.html',
    'yarn.lock',
    'Justfile',
    'LICENSE',
    'UPSTREAM.md',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.some((p) => p.includes('/node_modules/') || p.endsWith('.map') || p.startsWith('engine/target/'))).toBe(false);
  expect(paths.filter((p) => p.startsWith('runtime/') && p.endsWith('.wasm')).length).toBeGreaterThan(20);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe('runtime/index.html');
});
