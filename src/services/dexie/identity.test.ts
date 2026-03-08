import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './schema';

// Identity module caches the result, so we need a fresh import per test.
// We can't easily reset the module cache in vitest without some effort,
// so we test the underlying mechanism directly via the database.

describe('Local Identity', () => {
  beforeEach(async () => {
    // The setup.ts afterEach deletes all DBs, which resets identity.
    // But we also need to clear the module-level cache.
    // For this test, we'll work with the identity module's public API
    // and accept that the cache persists within a single test file.
  });

  it('generates UUIDs on first call and stores them in settings', async () => {
    // Dynamically import to get fresh module state
    const { getLocalIdentity } = await import('./identity');

    const identity = await getLocalIdentity();

    expect(identity.authorId).toHaveLength(36);
    expect(identity.homeId).toHaveLength(36);

    // Verify stored in settings
    const authorRow = await db.settings.get('local:authorId');
    const homeRow = await db.settings.get('local:homeId');
    expect(authorRow?.value).toBe(identity.authorId);
    expect(homeRow?.value).toBe(identity.homeId);
  });

  it('returns the same identity on subsequent calls', async () => {
    const { getLocalIdentity } = await import('./identity');

    const first = await getLocalIdentity();
    const second = await getLocalIdentity();

    expect(first.authorId).toBe(second.authorId);
    expect(first.homeId).toBe(second.homeId);
  });
});
