import { useState, useEffect } from 'react';
import { blobObjectUrl } from '@/services/blobs';

/** Resolve a Blob Store fingerprint to an object URL, revoked on change/unmount. */
export function useBlobUrl(fingerprint?: string | null, type?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fingerprint) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    blobObjectUrl(fingerprint, type)
      .then((u) => {
        // A late resolution for a fingerprint we no longer show would leak the URL
        if (cancelled) URL.revokeObjectURL(u);
        else {
          created = u;
          setUrl(u);
        }
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [fingerprint, type]);
  return url;
}
