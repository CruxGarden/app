import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the AM-1 instrument as written, its notes, the bridge and the untouched single file', async () => {
  const template = (await loadTemplate('am-1-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'index.html',
    'am-1.js',
    'am-1-machine.html',
    'garden/bridge.js',
    'garden/document.js',
    'UPSTREAM.md',
    'AM-1-HANDOFF.md',
    'AM-1-VOICING.md',
    'am-1-mockup.png',
    '.cruxignore',
    'data/project.json',
  ])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe(
    'index.html',
  );
});
