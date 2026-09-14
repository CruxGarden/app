import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the notation tool: the page, the starter tune, the bridge, the validator, the licences, abcjs and the soundfont', async () => {
  const template = (await loadTemplate('abc-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'index.html',
    'tune.abc',
    'style.css',
    'garden/bridge.js',
    'garden/document.js',
    'licenses/abcjs-LICENSE.md',
    'licenses/midi-js-soundfonts-LICENSE.txt',
    'runtime/abcjs-basic-min.js',
    'runtime/abcjs-audio.css',
    'runtime/soundfont/acoustic_grand_piano-mp3/A0.mp3',
    'runtime/soundfont/acoustic_grand_piano-mp3/C8.mp3',
    'UPSTREAM.md',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(paths.filter((p) => p.startsWith('runtime/soundfont/')).length).toBe(88);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'runtime/abcjs-basic-min.js')!.encoding).toBe('asset-url');
  expect(template.files.find((f) => f.path === 'tune.abc')!.content).toContain('X:1');
  expect((template.meta?.settings as { entryFile?: string })?.entryFile).toBe('index.html');
});
