import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the Cactus blog: the Astro project, settings file, seed content, fonts and the licence', async () => {
  const template = (await loadTemplate('astro-blog'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'astro.config.ts',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'src/config.json',
    'src/site.config.ts',
    'src/content.config.ts',
    'src/pages/posts/[...slug].astro',
    'content/posts/hello-from-the-garden.md',
    'content/posts/markdown-elements/index.md',
    'content/notes/first-note.md',
    'content/tags/garden.md',
    'src/assets/roboto-mono-regular.ttf',
    'public/icon.svg',
    'LICENSE',
    'UPSTREAM.md',
    '.cruxignore',
  ])
    expect(paths).toContain(path);
  expect(
    paths.some((p) => p.includes('node_modules') || p.startsWith('content/posts/testing')),
  ).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
  expect(
    template.files.find((f) => f.path === 'src/assets/roboto-mono-regular.ttf')!.encoding,
  ).toBe('asset-url');
  expect(
    template.files.find((f) => f.path === 'content/posts/markdown-elements/logo.png')!.encoding,
  ).toBe('asset-url');
  expect(template.skill).toBe('blog');
  expect(template.contentModel?.collections.map((c) => c.glob)).toEqual([
    'content/posts/**/*.md',
    'content/notes/**/*.md',
  ]);
  expect(
    JSON.parse(template.files.find((f) => f.path === 'package.json')!.content).scripts.postinstall,
  ).toBeUndefined();
});
