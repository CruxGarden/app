import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual network editor, native source, local Monaco and licenses', async () => {
  const t = (await loadTemplate('gephi-app'))!;
  const paths = t.files.map((f) => f.path);
  expect(paths).toContain('runtime/index.html');
  expect(paths).toContain('packages/gephi-lite/src/garden-native.ts');
  expect(paths).toContain('packages/gephi-lite/types/react-tether.d.ts');
  expect(paths).toContain('runtime/monaco/vs/loader.js');
  expect(paths).toContain('runtime/THIRD_PARTY_NOTICES.txt');
  expect(paths).toContain('LICENSE.md');
  expect(JSON.parse(t.files.find((f) => f.path === 'data/project.json')!.content)).toEqual({
    version: 1,
    app: 'gephi',
    project: null,
  });
}, 30000);
