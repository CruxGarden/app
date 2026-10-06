import type { CruxUsage } from '@/api/usage';

/**
 * Crux Store requests for one Crux, counted the way the account meter and the
 * plan budget count them (api usage.service: reads + writes + function runs).
 */
export function cruxStoreRequests(
  c: Pick<CruxUsage, 'storeReads' | 'storeWrites'> & { fnCalls?: number },
): number {
  return c.storeReads + c.storeWrites + (c.fnCalls ?? 0);
}
