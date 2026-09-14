import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the digital garden: the Astro project, the seed notes, the link index, the graph and the licence', async () => {
  const template = (await loadTemplate('digital-garden'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'astro.config.mjs',
    'package.json',
    'pnpm-lock.yaml',
    'src/config.json',
    'src/content.config.ts',
    'src/content/wiki/index.md',
    'src/content/wiki/notes/growth-stages.md',
    'src/lib/wiki/links.mjs',
    'src/lib/wiki/garden-index.ts',
    'src/components/wiki/Backlinks.astro',
    'src/pages/graph.astro',
    'src/pages/graph.json.ts',
    'public/favicon.ico',
    'LICENSE',
    'UPSTREAM.md',
    '.cruxignore',
  ])
    expect(paths).toContain(path);
  expect(paths.some((p) => /\.test\./.test(p))).toBe(false);
  expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.files.find((f) => f.path === 'public/favicon.ico')!.encoding).toBe('asset-url');
  expect(template.skill).toBe('digital-garden');
  expect(template.contentModel?.collections[0]?.glob).toBe('src/content/wiki/**/*.md');
  expect(template.contentModel?.settings?.path).toBe('src/config.json');
});
