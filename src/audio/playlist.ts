/** Playlist rules, pure. */
export interface PlaylistItem {
  mixId: string;
  /** minutes before advancing (fractions allowed) */
  minutes: number;
  crossfadeSec: number;
}
export interface Playlist {
  enabled: boolean;
  shuffle: boolean;
  items: PlaylistItem[];
}

export const DEFAULT_PLAYLIST: Playlist = {
  enabled: false,
  shuffle: false,
  items: [
    { mixId: 'dusk-in-the-garden', minutes: 20, crossfadeSec: 6 },
    { mixId: 'still-air', minutes: 15, crossfadeSec: 6 },
    { mixId: 'night-rain', minutes: 20, crossfadeSec: 6 },
  ],
};

export function validatePlaylist(raw: unknown, knownMixIds: string[]): Playlist {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PLAYLIST };
  const p = raw as Record<string, unknown>;
  const items = Array.isArray(p.items)
    ? ((p.items as unknown[])
        .map((it) => {
          if (!it || typeof it !== 'object') return null;
          const o = it as Record<string, unknown>;
          if (typeof o.mixId !== 'string' || !knownMixIds.includes(o.mixId)) return null;
          const minutes = typeof o.minutes === 'number' && o.minutes > 0 ? o.minutes : 15;
          const crossfadeSec =
            typeof o.crossfadeSec === 'number' && o.crossfadeSec >= 0 ? o.crossfadeSec : 6;
          return { mixId: o.mixId, minutes, crossfadeSec } as PlaylistItem;
        })
        .filter(Boolean) as PlaylistItem[])
    : [];
  return { enabled: p.enabled === true, shuffle: p.shuffle === true, items };
}

/** Index of the item to play after `current` (random when shuffling, never the same twice). */
export function nextPlaylistIndex(
  pl: Playlist,
  current: number,
  rnd: () => number = Math.random,
): number {
  const n = pl.items.length;
  if (n === 0) return -1;
  if (n === 1) return 0;
  if (!pl.shuffle) return (current + 1) % n;
  let i = Math.floor(rnd() * (n - 1));
  if (i >= current) i += 1;
  return i;
}
