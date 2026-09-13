import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual Wick Editor: runtime with engine, source, examples, bridge and notices', async () => {
  const template = (await loadTemplate('wick-editor-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/corelibs/wick-engine/wickengine.js',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'runtime/LICENSE.md',
    'src/Editor/Editor.jsx',
    'src/garden/bridge.js',
    'public/corelibs/wick-engine/wickengine.js',
    'engine/package.json',
    'garden/document.js',
    'garden/build.sh',
    'package-lock.json',
    'LICENSE.md',
    'CREDITS.md',
    'UPSTREAM.md',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.some((p) => p.includes('/node_modules/') || p.endsWith('.map') || p === 'runtime/electron.js')).toBe(false);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe('runtime/index.html');
}, 60000);
