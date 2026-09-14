import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the recipe book: the Keel project, the recipes collection and pages, seed recipes, settings and the licence', async () => {
  const template = (await loadTemplate('astro-recipes'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'astro.config.mjs',
    'package.json',
    'pnpm-lock.yaml',
    'src/config.json',
    'src/content.config.ts',
    'src/pages/recipes/index.astro',
    'src/pages/recipes/[slug].astro',
    'src/content/recipes/tomato-soup.md',
    'src/content/recipes/seed-crackers.md',
    'src/content/blog/hello.md',
    'public/og.jpg',
    'LICENSE',
    'UPSTREAM.md',
    '.cruxignore',
  ])
    expect(paths).toContain(path);
  expect(
    paths.some((p) => p.startsWith('src/pages/works') || p.startsWith('src/content/works')),
  ).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.skill).toBe('recipes');
  expect(template.contentModel?.collections.map((c) => c.name)).toEqual(['Recipes', 'Posts']);
  const recipe = template.contentModel!.collections[0]!;
  expect(recipe.new.body).toContain('## Ingredients');
  expect(recipe.new.body).toContain('## Method');
});
