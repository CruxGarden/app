import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteStoreService } from './store.service';
import { getSqliteClient } from './client';

/**
 * The local Crux Store behind the workshop preview. It mirrors the API's two
 * key modes so a page behaves the same before and after publish: `public`,
 * the crux's one value read by anyone, and `protected`, one private slot per
 * visitor. Every published write needs an account; in the preview the local
 * user is that account, so the store itself never refuses a write.
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

  it('public: another visitor’s write replaces the same one value — never a second row', async () => {
    await store.set(
      CRUX,
      'leaderboard:2026-09-05',
      { entries: [{ name: 'ada' }] },
      'public',
      ADA.id,
    );
    expect(await store.get(CRUX, 'leaderboard:2026-09-05')).toEqual({ entries: [{ name: 'ada' }] });
    expect(await store.get(CRUX, 'leaderboard:2026-09-05', GRACE.id)).toEqual({
      entries: [{ name: 'ada' }],
    });

    await store.set(
      CRUX,
      'leaderboard:2026-09-05',
      { entries: [{ name: 'ada' }, { name: 'grace' }] },
      'public',
      GRACE.id,
    );
    expect(await store.get(CRUX, 'leaderboard:2026-09-05', ADA.id)).toEqual({
      entries: [{ name: 'ada' }, { name: 'grace' }],
    });
    expect((await store.list(CRUX)).map((e) => [e.key, e.mode, e.visitorId])).toEqual([
      ['leaderboard:2026-09-05', 'public', null],
    ]);
  });

  it('the deprecated mode common is written and listed as public', async () => {
    await store.set(CRUX, 'board', { entries: [] }, 'common' as unknown as 'public', ADA.id);
    expect((await store.list(CRUX)).map((e) => [e.key, e.mode, e.visitorId])).toEqual([
      ['board', 'public', null],
    ]);
    // A row still marked common (written before the rename) reads back as public too.
    await getSqliteClient().run('UPDATE store SET mode = ? WHERE crux_id = ? AND key = ?', [
      'common',
      CRUX,
      'board',
    ]);
    expect((await store.list(CRUX))[0]!.mode).toBe('public');
    expect(await store.increment(CRUX, 'hits', 1)).toBe(1);
    expect(await store.get(CRUX, 'nothing', ADA.id)).toBeNull();
  });
});
