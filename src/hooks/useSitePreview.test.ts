import { describe, expect, it } from 'vitest';
import { siteRouteFor } from './useSitePreview';

describe('siteRouteFor', () => {
  it('follows the Astro pages convention', () => {
    expect(siteRouteFor('src/pages/index.astro')).toBe('/');
    expect(siteRouteFor('src/pages/posts/hello.md')).toBe('/posts/hello');
    expect(siteRouteFor('src/pages/about/index.astro')).toBe('/about');
    expect(siteRouteFor('src/layouts/Base.astro')).toBe('/');
  });
  it('maps a content collection onto its served route', () => {
    const wiki = [{ glob: 'src/content/wiki/**/*.md', routeBase: '/wiki/' }];
    expect(siteRouteFor('src/content/wiki/notes/compost.md', wiki)).toBe('/wiki/notes/compost');
    expect(siteRouteFor('src/content/wiki/index.md', wiki)).toBe('/wiki');
    expect(siteRouteFor('src/content/wiki/deep/er/index.md', wiki)).toBe('/wiki/deep/er');
    expect(siteRouteFor('src/content/wiki/notes/compost.mdx', wiki)).toBe('/');
    expect(
      siteRouteFor('src/pages/posts/a.md', [
        { glob: 'src/pages/posts/*.md', routeBase: '/posts/' },
      ]),
    ).toBe('/posts/a');
    expect(siteRouteFor('src/pages/posts/a.md', [{ glob: 'src/pages/posts/*.md' }])).toBe(
      '/posts/a',
    );
  });
});
