import { describe, expect, it } from 'vitest';
import { buildRedirectUrl } from './redirect';

const mockLocation = (url: string): Location => {
  const parsed = new URL(url);
  return { hash: parsed.hash, search: parsed.search } as Location;
};

describe('buildRedirectUrl', () => {
  it('should redirect to /edit by default when hash is empty', () => {
    expect(buildRedirectUrl(mockLocation('https://mermaid.live/'))).toBe('/runtime/edit');
  });

  it('should preserve search params', () => {
    expect(buildRedirectUrl(mockLocation('https://mermaid.live/?utm_source=github'))).toBe(
      '/runtime/edit?utm_source=github'
    );
  });

  it('should extract route and fragment from old hash format', () => {
    expect(buildRedirectUrl(mockLocation('https://mermaid.live/#/edit/pako:abc123'))).toBe(
      '/runtime/edit#pako:abc123'
    );
  });

  it('should place search params before the hash fragment', () => {
    expect(
      buildRedirectUrl(mockLocation('https://mermaid.live/?utm_source=twitter#/edit/pako:abc123'))
    ).toBe('/runtime/edit?utm_source=twitter#pako:abc123');
  });

  it('should handle hash with view route', () => {
    expect(buildRedirectUrl(mockLocation('https://mermaid.live/#/view/pako:xyz'))).toBe(
      '/runtime/view#pako:xyz'
    );
  });

  it('should default to edit when hash has no route', () => {
    expect(buildRedirectUrl(mockLocation('https://mermaid.live/#somethingelse'))).toBe('/runtime/edit');
  });

  it('should handle multiple search params with hash', () => {
    expect(
      buildRedirectUrl(
        mockLocation(
          'https://mermaid.live/?utm_source=gh&utm_medium=link&utm_campaign=test#/edit/pako:data'
        )
      )
    ).toBe('/runtime/edit?utm_source=gh&utm_medium=link&utm_campaign=test#pako:data');
  });
});
