import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the map tool: the shell around MapLibre and Terra Draw, the bridge, the validator and the runtime', async () => {
  const template = (await loadTemplate('maps-app'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of ['index.html', 'edition.html', 'src/main.ts', 'src/edition.ts', 'src/shared.ts', 'src/garden/bridge.ts', 'garden/document.js', 'package.json', 'vite.config.ts', 'UPSTREAM.md', '.cruxignore', 'runtime/index.html', 'runtime/edition.html', 'data/project.json'])
    expect(paths).toContain(path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'runtime/index.html')!.encoding).toBe('asset-url');
  expect(paths.some((p) => p.endsWith('.map'))).toBe(false);
  expect((template.meta?.settings as { entryFile?: string } | undefined)?.entryFile).toBe('runtime/index.html');
});
