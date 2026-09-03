import { describe, it, expect } from 'vitest';
import { nextPlaylistIndex, validatePlaylist, DEFAULT_PLAYLIST } from './playlist';

describe('playlist', () => {
  it('advances in order and wraps', () => {
    const pl = { ...DEFAULT_PLAYLIST, enabled: true };
    expect(nextPlaylistIndex(pl, 0)).toBe(1);
    expect(nextPlaylistIndex(pl, 2)).toBe(0);
    expect(nextPlaylistIndex({ ...pl, items: [] }, 0)).toBe(-1);
    expect(nextPlaylistIndex({ ...pl, items: [pl.items[0]!] }, 0)).toBe(0);
  });
  it('shuffles to a different item', () => {
    const pl = { ...DEFAULT_PLAYLIST, shuffle: true };
    for (let r = 0; r < 1; r += 0.1) expect(nextPlaylistIndex(pl, 1, () => r)).not.toBe(1);
  });
  it('validates against known mixes and defaults bad numbers', () => {
    const v = validatePlaylist(
      { enabled: true, items: [{ mixId: 'night-rain', minutes: -1 }, { mixId: 'nope' }, 'junk'] },
      ['night-rain'],
    );
    expect(v.enabled).toBe(true);
    expect(v.items).toEqual([{ mixId: 'night-rain', minutes: 15, crossfadeSec: 6 }]);
    expect(validatePlaylist('x', [])).toEqual(DEFAULT_PLAYLIST);
  });
});
