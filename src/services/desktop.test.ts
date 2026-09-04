import { describe, it, expect } from 'vitest';
import { shortenHomePath } from './desktop';

describe('shortenHomePath', () => {
  it('shortens home paths on macOS, Linux and Windows', () => {
    expect(shortenHomePath('/Users/daniel/CruxGarden/blog')).toBe('~/CruxGarden/blog');
    expect(shortenHomePath('/Users/daniel')).toBe('~');
    expect(shortenHomePath('/home/daniel/CruxGarden')).toBe('~/CruxGarden');
    expect(shortenHomePath('C:\\Users\\Daniel\\CruxGarden\\blog')).toBe('~/CruxGarden/blog');
  });
  it('leaves other paths alone', () => {
    expect(shortenHomePath('/opt/crux')).toBe('/opt/crux');
    expect(shortenHomePath('D:\\Projects\\x')).toBe('D:\\Projects\\x');
  });
});
