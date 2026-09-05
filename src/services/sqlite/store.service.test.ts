import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteStoreService } from './store.service';
import { getSqliteClient } from './client';

/**
 * The local Crux Store behind the workshop preview. It mirrors the API's
 * three key modes so a page behaves the same before and after publish —
 * `common` in particular: the crux's one value, read by anyone, written only
 * by a signed-in visitor (the preview's local user).
 */
const CRUX = 'crux-store-test';
const ADA = { id: 'visitor-ada' };
const GRACE = { id: 'visitor-grace' };

describe('SqliteStoreService', () => {
  const store = new SqliteStoreService();

  beforeEach(async () => {
    await getSqliteClient().run('DELETE FROM store WHERE crux_id = ?', [CRUX]);
  });

  it('public: one row per key, read by anyone', async () => {
    await store.set(CRUX, 'hits', 3, 'public');
    await store.set(CRUX, 'hits', 4, 'public', ADA.id); // a visitor writing public still writes the one row
    expect(await store.get(CRUX, 'hits')).toBe(4);
    expect(await store.get(CRUX, 'hits', ADA.id)).toBe(4);
    expect((await store.list(CRUX)).map((e) => [e.key, e.mode, e.visitorId])).toEqual([
      ['hits', 'public', null],
    ]);
  });

  it('protected: one row per visitor, private to them; a stranger falls back to the public row', async () => {
    await store.set(CRUX, 'played:2026-09-05', { entry: 'hypatia' }, 'protected', ADA.id);
    expect(await store.get(CRUX, 'played:2026-09-05', ADA.id)).toEqual({ entry: 'hypatia' });
    expect(await store.get(CRUX, 'played:2026-09-05', GRACE.id)).toBeNull();
    expect(await store.get(CRUX, 'played:2026-09-05')).toBeNull();
    await store.set(CRUX, 'played:2026-09-05', { entry: 'euclid' }, 'protected', ADA.id);
    expect(await store.get(CRUX, 'played:2026-09-05', ADA.id)).toEqual({ entry: 'euclid' });
    expect(await store.list(CRUX)).toHaveLength(1);
  });

  it('common: the crux’s one value, read by anyone, written only by a signed-in visitor', async () => {
    await store.set(
      CRUX,
      'leaderboard:2026-09-05',
      { entries: [{ name: 'ada' }] },
      'common',
      ADA.id,
    );
    expect(await store.get(CRUX, 'leaderboard:2026-09-05')).toEqual({ entries: [{ name: 'ada' }] });
    expect(await store.get(CRUX, 'leaderboard:2026-09-05', GRACE.id)).toEqual({
      entries: [{ name: 'ada' }],
    });

    // Another visitor's write replaces the same one value — never a second row
    await store.set(
      CRUX,
      'leaderboard:2026-09-05',
      { entries: [{ name: 'ada' }, { name: 'grace' }] },
      'common',
      GRACE.id,
    );
    expect(await store.get(CRUX, 'leaderboard:2026-09-05', ADA.id)).toEqual({
      entries: [{ name: 'ada' }, { name: 'grace' }],
    });
    expect((await store.list(CRUX)).map((e) => [e.key, e.mode, e.visitorId])).toEqual([
      ['leaderboard:2026-09-05', 'common', null],
    ]);
  });

  it('common needs a visitor to write; an empty key reads as null', async () => {
    await expect(store.set(CRUX, 'leaderboard:x', { entries: [] }, 'common')).rejects.toThrow(
      /signed-in visitor/,
    );
    expect(await store.get(CRUX, 'leaderboard:x', ADA.id)).toBeNull();
  });
});
