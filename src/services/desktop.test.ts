import { describe, it, expect } from 'vitest';
import { shortenHomePath, isOpenableWebUrl, openWeb } from './desktop';

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

describe('isOpenableWebUrl', () => {
  it('admits https anywhere and http only on loopback', () => {
    expect(isOpenableWebUrl('https://checkout.stripe.com/x')).toBe(true);
    expect(isOpenableWebUrl('http://localhost:3000/billing')).toBe(true);
    expect(isOpenableWebUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isOpenableWebUrl('http://localhost.evil.example/')).toBe(false);
    expect(isOpenableWebUrl('http://example.com/')).toBe(false);
    expect(isOpenableWebUrl('file:///etc/passwd')).toBe(false);
    expect(isOpenableWebUrl('https://a b')).toBe(false);
  });
});

describe('openWeb', () => {
  it('refuses non-web URLs without touching the browser', async () => {
    expect(await openWeb('javascript:alert(1)')).toBe(false);
  });
});
