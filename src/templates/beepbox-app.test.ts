import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual BeepBox editor: source, built website, bridge and notices', async () => {
  const template = (await loadTemplate('beepbox-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'website/index.html',
    'website/beepbox_editor.min.js',
    'website/garden/bridge.js',
    'website/lame.min.js',
    'website/THIRD_PARTY_NOTICES.txt',
    'website/LICENSE.md',
    'editor/SongDocument.ts',
    'synth/synth.ts',
    'scripts/compile_editor.sh',
    'garden/document.js',
    'package-lock.json',
    'LICENSE.md',
    'UPSTREAM.md',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.some((p) => p.includes('/node_modules/') || p.endsWith('.map'))).toBe(false);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe('website/index.html');
});
