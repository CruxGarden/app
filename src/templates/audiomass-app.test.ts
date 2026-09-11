import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual AudioMass editor and its local runtimes', async () => {
  const template = (await loadTemplate('audiomass-app'))!;
  const paths = new Set(template.files.map((f) => f.path));
  for (const path of [
    'src/index.html',
    'src/engine.js',
    'src/multitrack.js',
    'src/amss-format.js',
    'src/runtime/wavesurfer.js',
    'src/garden/bridge.js',
    'src/libflac.wasm',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'data/project.json',
  ])
    expect(paths.has(path), path).toBe(true);
  expect([...paths].some((p) => p.includes('/dist/'))).toBe(false);
});
