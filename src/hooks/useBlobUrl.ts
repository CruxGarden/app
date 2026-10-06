import { useState, useEffect, type DependencyList } from 'react';
import { blobObjectUrl } from '@/services/blobs';

/**
 * A temporary object URL for whatever `load` produces, revoked when the deps
 * change or the component leaves. A late result for something no longer shown
 * is revoked instead of leaked; a failed load reads as no URL.
 */
export function useObjectUrl(
  load: (() => Promise<Blob | string | null>) | null,
  deps: DependencyList,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!load) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setUrl(null);
    load()
      .then((result) => {
        const next = result instanceof Blob ? URL.createObjectURL(result) : result;
        if (cancelled) {
          if (next) URL.revokeObjectURL(next);
          return;
        }
        // A string result is a URL the service already made; it is ours to revoke too.
        created = next;
        setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return url;
}

/** Resolve a Blob Store fingerprint to an object URL, revoked on change/unmount. */
export function useBlobUrl(fingerprint?: string | null, type?: string): string | null {
  return useObjectUrl(fingerprint ? () => blobObjectUrl(fingerprint, type) : null, [
    fingerprint,
    type,
  ]);
}
