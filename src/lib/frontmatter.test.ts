import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  serializeFrontmatter,
  slugify,
  interpolate,
  globToRegex,
} from './frontmatter';

describe('frontmatter', () => {
  it('parses a flat frontmatter block', () => {
    const { data, body, present } = parseFrontmatter(
      '---\ntitle: Hello, world\ndate: 2026-07-01\ndraft: true\n---\n\nBody text.\n',
    );
    expect(present).toBe(true);
    expect(data).toEqual({ title: 'Hello, world', date: '2026-07-01', draft: 'true' });
    expect(body).toBe('\nBody text.\n');
  });

  it('strips simple quotes', () => {
    const { data } = parseFrontmatter("---\ntitle: 'Quoted: title'\n---\n");
    expect(data.title).toBe('Quoted: title');
  });

  it('handles files without frontmatter', () => {
    const { data, body, present } = parseFrontmatter('# Just markdown\n');
    expect(present).toBe(false);
    expect(data).toEqual({});
    expect(body).toBe('# Just markdown\n');
  });

  it('round-trips through serialize', () => {
    const content = serializeFrontmatter(
      { title: 'A: risky title', date: '2026-07-04', description: '' },
      '\nHello.\n',
    );
    const { data, body } = parseFrontmatter(content);
    expect(data.title).toBe('A: risky title');
    expect(data.description).toBe('');
    expect(body).toBe('\nHello.\n');
  });

  it('slugifies titles', () => {
    expect(slugify('My First Post!')).toBe('my-first-post');
    expect(slugify('  Émigré Café — notes  ')).toBe('emigre-cafe-notes');
    expect(slugify('!!!')).toBe('untitled');
  });

  it('interpolates recipes', () => {
    expect(
      interpolate('src/pages/posts/{slug}.md', { slug: 'hi', title: 'Hi', today: '2026-07-04' }),
    ).toBe('src/pages/posts/hi.md');
  });

  it('matches single-star globs', () => {
    const re = globToRegex('src/pages/posts/*.md');
    expect(re.test('src/pages/posts/hello.md')).toBe(true);
    expect(re.test('src/pages/posts/nested/deep.md')).toBe(false);
    expect(re.test('src/pages/index.astro')).toBe(false);
  });
});
