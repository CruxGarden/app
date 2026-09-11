import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual Bitsy editor, engine and export resources', async () => {
  const t = (await loadTemplate('bitsy-app'))!;
  const paths = new Set(t.files.map((f) => f.path));
  for (const p of [
    'editor/index.html',
    'editor/script/editor.js',
    'editor/script/engine/bitsy.js',
    'editor/script/tools/game.js',
    'editor/script/generated/resources.js',
    'editor/garden/bridge.js',
    'editor/garden/model.js',
    'dev/resource_packager.cjs',
    'dev/resources/export/exportTemplate.html',
    'NUNITO-OFL.txt',
    'LICENSE.md',
    'CREDITS.md',
    'data/project.json',
  ])
    expect(paths.has(p), p).toBe(true);
}, 15000);
