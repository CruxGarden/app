import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual Piskel editor, native exporters, rebuild source and Garden bridge', async () => {
  const t = (await loadTemplate('piskel-app'))!;
  const paths = new Set(t.files.map((f) => f.path));
  for (const p of [
    'dest/prod/index.html',
    'dest/prod/garden/bridge.js',
    'src/garden/model.js',
    'src/js/utils/serialization/Serializer.js',
    'src/js/service/storage/FileDownloadStorageService.js',
    'package.json',
    'package-lock.json',
    'vite.config.js',
    'LICENSE',
    'UPSTREAM.md',
    'data/project.json',
  ])
    expect(paths.has(p), p).toBe(true);
}, 20000);
