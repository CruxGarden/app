import { describe, it, expect } from 'vitest';
import { backupOf, snapshotsBehind } from './backup';
import type { Crux } from '@/api/types';

const crux = (meta: Record<string, unknown>): Crux =>
  ({
    id: 'c1',
    slug: 'c1',
    data: '',
    status: 'living',
    visibility: 'private',
    discoverable: false,
    authorId: 'a',
    homeId: 'h',
    meta,
  }) as unknown as Crux;

describe('backup standing', () => {
  it('reads the record only when it is one', () => {
    expect(backupOf(null)).toBeNull();
    expect(backupOf(crux({}))).toBeNull();
    expect(backupOf(crux({ backup: { at: 5 } }))).toBeNull();
    expect(
      backupOf(crux({ backup: { at: '2026-09-08T00:00:00Z', growthCount: 3, size: 10 } })),
    ).toMatchObject({ growthCount: 3 });
  });

  it('counts snapshots since the backup; never backed up is null, never negative', () => {
    expect(snapshotsBehind(crux({}), 4)).toBeNull();
    const c = crux({ backup: { at: '2026-09-08T00:00:00Z', growthCount: 3, size: 10 } });
    expect(snapshotsBehind(c, 3)).toBe(0);
    expect(snapshotsBehind(c, 5)).toBe(2);
    expect(snapshotsBehind(c, 1)).toBe(0); // history was walked back — not "behind"
  });
});
