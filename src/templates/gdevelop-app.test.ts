import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the native game editor, local runtime and source build inputs', async () => {
  const template = (await loadTemplate('gdevelop-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'runtime/index.html',
    'runtime/libGD.wasm',
    'runtime/GDJS/Runtime/index.html',
    'garden/build.cjs',
    'garden/model.mjs',
    'garden/inspection.mjs',
    'garden/instances.mjs',
    'garden/objects.mjs',
    'garden/events.mjs',
    'garden/shared/command-session.js',
    'newIDE/app/.babelrc.json',
    'newIDE/app/.linguirc',
    'newIDE/app/src/BrowserApp.js',
    'newIDE/app/src/Garden/Project.js',
    'newIDE/app/src/Garden/SceneTools.js',
    'newIDE/app/src/Garden/ObjectTools.js',
    'newIDE/app/src/Garden/EventTools.js',
    'GDJS/package-lock.json',
    'newIDE/app/package-lock.json',
    'GDevelop.js/README.md',
    'LICENSE.md',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(
    paths.some(
      (path) => path.includes('/node_modules/') || /\/(?:\.env|spine-pixi-v7)(?:[./]|$)/.test(path),
    ),
  ).toBe(false);
  expect(
    JSON.parse(template.files.find((file) => file.path === 'data/project.json')!.content),
  ).toEqual({ version: 1, app: 'gdevelop', project: null });
}, 60000);
