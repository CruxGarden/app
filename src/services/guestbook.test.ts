import { describe, it, expect } from 'vitest';
import {
  guestbookPlacement,
  guestbookSnippet,
  withGuestbook,
  hasGuestbook,
  pageHasGuestbook,
} from './guestbook';

describe('guestbook placement', () => {
  it('goes into index.html at the root for a static site', () => {
    const p = guestbookPlacement(['index.html', 'style.css']);
    expect(p).toEqual({ scriptPath: 'guestbook.js', pagePath: 'index.html', astro: false });
    expect(guestbookSnippet(p)).toContain('src="guestbook.js"');
  });

  it('goes into public/ and the Astro index page for an Astro site', () => {
    const p = guestbookPlacement(['astro.config.mjs', 'src/pages/index.astro', 'index.html']);
    expect(p).toEqual({
      scriptPath: 'public/guestbook.js',
      pagePath: 'src/pages/index.astro',
      astro: true,
    });
    expect(guestbookSnippet(p)).toContain('is:inline');
  });

  it('writes the script and no snippet when there is no home page', () => {
    expect(guestbookPlacement(['notes/one.md']).pagePath).toBeNull();
  });

  it('knows when the block is there', () => {
    expect(hasGuestbook(['index.html', 'guestbook.js'])).toBe(true);
    expect(hasGuestbook(['src/pages/index.astro', 'guestbook.js'])).toBe(false);
    expect(hasGuestbook(['src/pages/index.astro', 'public/guestbook.js'])).toBe(true);
  });
});

describe('withGuestbook', () => {
  const snippet = '<section data-guestbook></section>\n<script src="guestbook.js" defer></script>';

  it('puts the snippet before </body>', () => {
    const out = withGuestbook('<html><body><h1>Hi</h1></body></html>', snippet);
    expect(out).toBe(
      '<html><body><h1>Hi</h1><section data-guestbook></section>\n<script src="guestbook.js" defer></script>\n</body></html>',
    );
    expect(pageHasGuestbook(out)).toBe(true);
  });

  it('appends when there is no </body>', () => {
    expect(withGuestbook('<h1>Hi</h1>\n', snippet)).toBe(`<h1>Hi</h1>\n${snippet}\n`);
  });

  it('leaves a page that already carries the block alone', () => {
    const page = `<body>${snippet}</body>`;
    expect(withGuestbook(page, snippet)).toBe(page);
  });
});
