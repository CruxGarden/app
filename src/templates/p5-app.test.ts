import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the sketch tool: the page, the starter sketch, the bridge, the validator, the licence and p5 itself', async () => {
  const template = (await loadTemplate('p5-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'index.html',
    'sketch.js',
    'style.css',
    'garden/bridge.js',
    'garden/document.js',
    'licenses/p5-LICENSE.txt',
    'package.json',
    'UPSTREAM.md',
    'runtime/p5.min.js',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'runtime/p5.min.js')!.encoding).toBe('asset-url');
  expect(template.files.find((f) => f.path === 'sketch.js')!.content).toContain('window.garden');
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe(
    'index.html',
  );
});
