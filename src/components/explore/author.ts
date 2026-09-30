import { apiBaseUrl } from '@/api/client';

/** Public profiles may contain an absolute URL, API path, or embedded image. */
export function resolveExploreAvatar(meta?: Record<string, unknown>): string | null {
  const value = meta?.avatarUrl || meta?.avatar_url;
  if (typeof value !== 'string' || !value) return null;
  if (/^data:image\//i.test(value)) return value;
  try {
    // API-provided /authors/... paths are relative to the configured API,
    // which may itself live under /api on a custom host.
    const path =
      /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')
        ? value
        : value.replace(/^\//, '');
    const url = new URL(path, `${apiBaseUrl().replace(/\/$/, '')}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
