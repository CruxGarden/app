/** Browser/test adapters inspect a detached database; desktop uses the API inspector. */
export const RECOVERY_CONTENT_SQL = `
  SELECT fingerprint FROM artifacts WHERE fingerprint IS NOT NULL
  UNION
  SELECT json_extract(meta, '$.avatarFingerprint') AS fingerprint FROM authors
  WHERE json_extract(meta, '$.avatarFingerprint') IS NOT NULL
  ORDER BY fingerprint
`;

export function recoveryFingerprints(rows: Record<string, unknown>[]): string[] {
  return rows.map(({ fingerprint }) => {
    if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint))
      throw new Error('Invalid recovery content fingerprint');
    return fingerprint;
  });
}
