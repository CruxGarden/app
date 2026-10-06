export { recoveryContentSql } from './content-reference-sql';

export function recoveryFingerprints(rows: Record<string, unknown>[]): string[] {
  return rows.map(({ fingerprint }) => {
    if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint))
      throw new Error('Invalid recovery content fingerprint');
    return fingerprint;
  });
}
