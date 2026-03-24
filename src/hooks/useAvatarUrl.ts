import { useState, useEffect } from 'react';
import { resolveAvatarUrl, resolveAvatarUrlAsync } from '@/stores/authStore';

/**
 * Resolve an author's avatar URL, handling async OPFS blob loading.
 * Returns a URL string or null. Re-resolves when the author changes.
 */
export function useAvatarUrl(
  author: { meta?: Record<string, unknown>; updated?: string } | null,
): string | null {
  const fingerprint = author?.meta?.avatarFingerprint as string | undefined;
  const [url, setUrl] = useState<string | null>(() => resolveAvatarUrl(author));

  useEffect(() => {
    // Sync resolve first (handles cached OPFS URLs, data URLs, API URLs)
    const syncUrl = resolveAvatarUrl(author);
    setUrl(syncUrl);

    // If there's a fingerprint but no cached URL, load async from OPFS
    if (fingerprint && !syncUrl) {
      let cancelled = false;
      resolveAvatarUrlAsync(author).then((asyncUrl) => {
        if (!cancelled) setUrl(asyncUrl);
      });
      return () => { cancelled = true; };
    }
  }, [fingerprint, author?.meta?.avatarUrl, author?.meta?.avatar_url, author?.updated]);

  return url;
}
