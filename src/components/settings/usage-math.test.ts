import { describe, expect, it } from 'vitest';
import { cruxStoreRequests } from './usage-math';

describe('per-Crux Store requests', () => {
  it('counts function runs like the account meter (reads + writes + runs)', () => {
    expect(cruxStoreRequests({ storeReads: 10, storeWrites: 5, fnCalls: 7 })).toBe(22);
  });
  it('treats an older server without function runs as none', () => {
    expect(cruxStoreRequests({ storeReads: 10, storeWrites: 5 })).toBe(15);
  });
});
