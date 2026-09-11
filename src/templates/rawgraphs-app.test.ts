import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the actual RAWGraphs editor, native exporters, rebuild source and dataset bridge', async () => {
  const t = (await loadTemplate('rawgraphs-app'))!;
  const paths = new Set(t.files.map((f) => f.path));
  for (const p of [
    'runtime/index.html',
    'runtime/THIRD_PARTY_NOTICES.txt',
    'src/App.js',
    'src/garden/model.js',
    'src/components/Exporter/Exporter.js',
    'scripts/project.test.cjs',
    'scripts/build.cjs',
    'package.json',
    'yarn.lock',
    'LICENSE',
    'UPSTREAM.md',
    'data/project.json',
  ])
    expect(paths.has(p), p).toBe(true);
}, 30000);
