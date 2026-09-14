import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the shader tool: the page, the starter shader, the bridge, the validator, the licence and glslEditor', async () => {
  const template = (await loadTemplate('glsl-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'index.html',
    'shader.frag',
    'style.css',
    'garden/bridge.js',
    'garden/document.js',
    'licenses/glslEditor-LICENSE.txt',
    'package.json',
    'UPSTREAM.md',
    'runtime/glslEditor.min.js',
    'runtime/glslEditor.css',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'runtime/glslEditor.min.js')!.encoding).toBe(
    'asset-url',
  );
  expect(template.files.find((f) => f.path === 'shader.frag')!.content).toContain('void main()');
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe(
    'index.html',
  );
});
