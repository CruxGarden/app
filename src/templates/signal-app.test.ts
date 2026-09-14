import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages Signal: the built app with its sounds, upstream’s source packages, the bridge, the validator and the notices', async () => {
  const template = (await loadTemplate('signal-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/soundfonts/A320U.sf2',
    'runtime/soundfonts/A320U_drums.sf2',
    'runtime/LICENSE',
    'runtime/licenses/NOTICES.md',
    'app/edit.html',
    'app/src/index.tsx',
    'app/src/garden/bridge.ts',
    'app/src/helpers/platform.ts',
    'packages/core/src/index.ts',
    'packages/player/src/renderAudio.ts',
    'electron/src/ElectronAPI.ts',
    'garden/document.js',
    'garden/build.cjs',
    'package-lock.json',
    'UPSTREAM.md',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(paths.some((p) => p.startsWith('runtime/assets/main-') && p.endsWith('.js'))).toBe(true);
  expect(paths.some((p) => p.startsWith('runtime/assets/spessasynth_processor'))).toBe(true);
  expect(paths.some((p) => p.includes('.test.') || p.includes('/testdata/') || p.includes('node_modules'))).toBe(false);
  expect(paths.some((p) => p.startsWith('app/public/soundfonts/'))).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'runtime/soundfonts/A320U.sf2')!.encoding).toBe('asset-url');
  expect(template.files.find((f) => f.path === 'garden/document.js')!.encoding).toBeUndefined();
  expect((template.meta?.settings as { entryFile?: string })?.entryFile).toBe('runtime/index.html');
}, 60_000);
