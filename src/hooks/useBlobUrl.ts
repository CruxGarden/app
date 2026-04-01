import { useState, useEffect } from 'react';

/** Resolve an OPFS blob fingerprint to an object URL */
export function useBlobUrl(fingerprint?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fingerprint) { setUrl(null); return; }
    let revoke = '';
    (async () => {
      const { getSqliteClient } = await import('@/services/sqlite/client');
      const db = getSqliteClient();
      const data = await db.blobRead(fingerprint);
      if (data) {
        const u = URL.createObjectURL(new Blob([data as unknown as BlobPart]));
        revoke = u;
        setUrl(u);
      }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [fingerprint]);
  return url;
}
