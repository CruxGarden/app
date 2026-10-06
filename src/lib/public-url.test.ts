import { describe, expect, it } from 'vitest';
import { isolatedPublishUrl } from './public-url';

describe('published HTML origin boundary', () => {
  const app = 'https://crux.garden';
  it.each([
    'https://crux.garden/creation/index.html',
    'https://crux.garden:443/creation/',
    '/__preview/example/index.html',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'blob:https://crux.garden/id',
    'https://user:secret@published.example/',
    '',
  ])('refuses an unsafe or missing publishing address: %s', (source) => {
    expect(isolatedPublishUrl(source, app)).toBeNull();
  });
  it('accepts a distinct publishing origin and preserves the file path', () => {
    expect(
      isolatedPublishUrl('https://creation.publish.crux.garden/docs/index.html', app)?.href,
    ).toBe('https://creation.publish.crux.garden/docs/index.html');
    expect(
      isolatedPublishUrl('http://127.0.0.1:4001/index.html', 'http://127.0.0.1:4000')?.origin,
    ).toBe('http://127.0.0.1:4001');
  });
});
