import { describe, it, expect } from 'vitest';
import {
  parseExploreParams,
  parseExplorePage,
  parseExploreSort,
  parseExploreKind,
} from './explore-params';

describe('parseExploreSort', () => {
  it('whitelists the API sorts', () => {
    expect(parseExploreSort('recent')).toBe('recent');
    expect(parseExploreSort('alpha')).toBe('alpha');
    expect(parseExploreSort('foo')).toBeUndefined();
    expect(parseExploreSort('')).toBeUndefined();
    expect(parseExploreSort(null)).toBeUndefined();
  });
});

describe('parseExploreKind', () => {
  it('drops unknown kinds', () => {
    expect(parseExploreKind('mood')).toBe('mood');
    expect(parseExploreKind('spreadsheet')).toBe('');
    expect(parseExploreKind(null)).toBe('');
  });
});

describe('parseExplorePage', () => {
  it('clamps to a positive integer', () => {
    expect(parseExplorePage('3')).toBe(3);
    expect(parseExplorePage('-3')).toBe(1);
    expect(parseExplorePage('0')).toBe(1);
    expect(parseExplorePage('2.5')).toBe(1);
    expect(parseExplorePage('1e3')).toBe(1);
    expect(parseExplorePage('abc')).toBe(1);
    expect(parseExplorePage(null)).toBe(1);
    expect(parseExplorePage('99999999999999999999')).toBe(1);
  });
});

describe('parseExploreParams', () => {
  it('reads a full query string', () => {
    const p = parseExploreParams(
      new URLSearchParams(
        'q=garden&type=authors&sort=alpha&kind=page&tag=a&tag=b&author=dan&page=2',
      ),
    );
    expect(p).toEqual({
      q: 'garden',
      type: 'authors',
      sort: 'alpha',
      kind: 'page',
      tags: ['a', 'b'],
      author: 'dan',
      page: 2,
    });
  });
  it('falls back safely on junk', () => {
    const p = parseExploreParams(new URLSearchParams('type=x&sort=foo&kind=nope&page=-1&tag='));
    expect(p).toEqual({
      q: '',
      type: 'cruxes',
      sort: undefined,
      kind: '',
      tags: [],
      author: '',
      page: 1,
    });
  });
});
