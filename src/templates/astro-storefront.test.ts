import { expect, it } from 'vitest';
import { loadTemplate } from './index';
it('packages the storefront: the Keel project, the products collection, shop pages, the buy button, seed products and the licence', async () => {
  const template = (await loadTemplate('astro-storefront'))!;
  const paths = template.files.map((file) => file.path);
  for (const path of [
    'astro.config.mjs',
    'package.json',
    'pnpm-lock.yaml',
    'src/config.json',
    'src/content.config.ts',
    'src/components/BuyButton.astro',
    'src/pages/shop/index.astro',
    'src/pages/shop/[slug].astro',
    'src/content/products/garden-print.md',
    'src/content/products/moss-tea.md',
    'src/content/blog/hello.md',
    'LICENSE',
    'UPSTREAM.md',
    '.cruxignore',
  ])
    expect(paths).toContain(path);
  expect(
    paths.some((p) => p.startsWith('src/pages/works') || p.startsWith('src/content/works')),
  ).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
  expect(template.skill).toBe('storefront');
  expect(template.contentModel?.collections.map((c) => c.name)).toEqual(['Products', 'Posts']);
  expect(template.contentModel?.settings?.fields.map((f) => f.key)).toContain('snipcartApiKey');
  const layout = template.files.find((f) => f.path === 'src/layouts/BaseLayout.astro')!.content;
  expect(layout).not.toContain('almanac.p4ni.com');
});
