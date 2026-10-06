import { describe, expect, it } from 'vitest';
import { browserAddress } from './browser-panel';

describe('WWW addresses', () => {
  it('normalizes website addresses and rejects privileged/active protocols and embedded credentials', () => {
    expect(browserAddress('example.org/path')).toBe('https://example.org/path');
    expect(browserAddress('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000/');
    for (const address of [
      '',
      'javascript:alert(1)',
      'file:///tmp/private',
      'crux-app://index',
      'data:text/html,test',
      'https://user:password@example.org',
    ])
      expect(() => browserAddress(address)).toThrow();
  });
});
