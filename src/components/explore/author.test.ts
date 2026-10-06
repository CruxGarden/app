import { describe, expect, it, vi } from 'vitest';
import { resolveExploreAvatar } from './author';
vi.mock('@/api/client', () => ({ apiBaseUrl: () => 'https://api.example.test/api' }));

describe('published creator avatars', () => {
  it('accepts absolute, API-relative and embedded images without double-prefixing', () => {
    expect(resolveExploreAvatar({ avatarUrl: 'https://images.example.test/avatar.png' })).toBe(
      'https://images.example.test/avatar.png',
    );
    expect(resolveExploreAvatar({ avatar_url: '/avatars/one.png' })).toBe(
      'https://api.example.test/api/avatars/one.png',
    );
    expect(resolveExploreAvatar({ avatarUrl: 'data:image/png;base64,AA==' })).toBe(
      'data:image/png;base64,AA==',
    );
  });
  it('falls back for missing or unsupported image locations', () => {
    expect(resolveExploreAvatar()).toBeNull();
    expect(resolveExploreAvatar({ avatarUrl: 42 })).toBeNull();
    expect(resolveExploreAvatar({ avatarUrl: 'javascript:alert(1)' })).toBeNull();
    expect(resolveExploreAvatar({ avatarUrl: 'file:///private/avatar.png' })).toBeNull();
  });
});
