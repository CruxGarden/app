import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages native Twine source, story formats and its portable entry', async () => {
  const t = (await loadTemplate('twine-app'))!;
  const paths = t.files.map((f) => f.path);
  for (const path of [
    'runtime/index.html',
    'src/garden-native.tsx',
    'src/native-entry.tsx',
    'src/dialogs/passage-edit/passage-text.tsx',
    'src/store/use-story-launch.ts',
    'public/story-formats/harlowe-3.3.9/format.js',
    'runtime/story-formats/harlowe-3.3.9/format.js',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'LICENSE',
    'scripts/build.cjs',
  ])
    expect(paths).toContain(path);
  expect(JSON.parse(t.files.find((f) => f.path === 'data/project.json')!.content)).toEqual({
    version: 1,
    app: 'twine',
    project: null,
  });
}, 30000);
