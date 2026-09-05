import { describe, it, expect } from 'vitest';
import {
  BOARD_CAP,
  boardKey,
  clampScore,
  clockOf,
  markPlayed,
  normalizeBoard,
  playedKey,
  postScore,
  rankOf,
  readBoard,
  readPlayed,
  sortEntries,
  utcDayAgo,
  withEntry,
  type LeaderboardEntry,
} from './src/lib/leaderboard';
import type { KeyStore, StoreMode } from './src/lib/store';

/** A store that remembers what it was asked, with a hook to change under the page's feet. */
function memoryStore(values: Record<string, unknown> = {}) {
  const writes: Array<{ key: string; value: unknown; mode: StoreMode }> = [];
  const reads: string[] = [];
  let onRead: ((key: string) => void) | null = null;
  const store: KeyStore = {
    via: 'api',
    get: async (key) => {
      reads.push(key);
      onRead?.(key);
      return values[key] ?? null;
    },
    set: async (key, value, mode) => {
      writes.push({ key, value, mode });
      values[key] = value;
    },
  };
  return {
    store,
    writes,
    reads,
    values,
    onRead(fn: (key: string) => void) {
      onRead = fn;
    },
  };
}

const DAY = '2026-09-05';
const entry = (name: string, score: number, seconds: number, at: string): LeaderboardEntry => ({
  name,
  score,
  seconds,
  at,
});
const ADA = entry('ada', 10, 74, `${DAY}T08:00:00.000Z`);
const GRACE = entry('grace', 8, 121, `${DAY}T08:10:00.000Z`);

describe('the board, as one common value the page maintains', () => {
  it('normalizes what the store holds: sorted by score, then seconds, then post time; capped', () => {
    const board = normalizeBoard(
      {
        entries: [
          entry('hedy', 9, 140, `${DAY}T08:20:00.000Z`),
          entry('grace', 9, 121, `${DAY}T08:10:00.000Z`),
          ADA,
          entry('late', 9, 121, `${DAY}T09:00:00.000Z`),
        ],
      },
      DAY,
    );
    expect(board.day).toBe(DAY);
    expect(board.entries.map((e) => e.name)).toEqual(['ada', 'grace', 'late', 'hedy']);
    expect(board.entries[0]).toEqual(ADA);
    const many = normalizeBoard(
      { entries: Array.from({ length: 60 }, (_, i) => entry(`p${i}`, i % 11, i, `${i}`)) },
      DAY,
    );
    expect(many.entries).toHaveLength(BOARD_CAP);
    expect(many.entries[0]!.score).toBe(10);
  });

  it('drops malformed entries; nothing reads as an empty board', () => {
    expect(normalizeBoard(null, DAY)).toEqual({ day: DAY, entries: [] });
    expect(normalizeBoard('nope', DAY).entries).toEqual([]);
    const board = normalizeBoard(
      {
        entries: [
          ADA,
          { name: 'bad', score: 'ten', seconds: 1 },
          { score: 1, seconds: 1 },
          null,
          'str',
        ],
      },
      DAY,
    );
    expect(board.entries.map((e) => e.name)).toEqual(['ada']);
  });

  it('withEntry replaces the entry of the same name — one entry per name, the page’s convention', () => {
    const board = { day: DAY, entries: [ADA, GRACE] };
    const next = withEntry(board, entry('grace', 10, 60, `${DAY}T09:00:00.000Z`));
    expect(next.entries.map((e) => [e.name, e.score])).toEqual([
      ['grace', 10],
      ['ada', 10],
    ]);
    expect(board.entries).toHaveLength(2); // untouched
    expect(rankOf(next, 'grace')).toBe(1);
    expect(rankOf(next, 'ada')).toBe(2);
    expect(rankOf(next, 'nobody')).toBeNull();
  });

  it('readBoard never throws — a store that fails is an empty board', async () => {
    const broken: KeyStore = {
      via: 'host',
      get: async () => {
        throw new Error('down');
      },
      set: async () => {},
    };
    expect(await readBoard(broken, DAY)).toEqual({ day: DAY, entries: [] });
    const { store } = memoryStore({ [boardKey(DAY)]: { entries: [ADA] } });
    expect((await readBoard(store, DAY)).entries).toEqual([ADA]);
  });

  it('postScore: read, add this name, sort, cap, write the day back as a common key, clamped', async () => {
    const { store, writes } = memoryStore({ [boardKey(DAY)]: { entries: [ADA, GRACE] } });
    const board = await postScore(store, DAY, 'tester', { score: 9.4, seconds: 80.6 });
    expect(board.entries.map((e) => e.name)).toEqual(['ada', 'tester', 'grace']);
    expect(rankOf(board, 'tester')).toBe(2);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.key).toBe('leaderboard:2026-09-05');
    expect(writes[0]!.mode).toBe('common');
    const written = writes[0]!.value as { entries: LeaderboardEntry[] };
    expect(written.entries.map((e) => e.name)).toEqual(['ada', 'tester', 'grace']);
    expect(written.entries[1]).toEqual({
      name: 'tester',
      score: 9,
      seconds: 81,
      at: expect.any(String),
    });
    expect(new Date(written.entries[1]!.at).toISOString()).toBe(written.entries[1]!.at);
  });

  it('postScore reads the board again right before it writes, so a post that landed since it was shown is kept', async () => {
    const m = memoryStore({ [boardKey(DAY)]: { entries: [ADA] } });
    const shown = await readBoard(m.store, DAY); // the reveal showed one entry
    expect(shown.entries).toEqual([ADA]);
    m.values[boardKey(DAY)] = { entries: [ADA, GRACE] }; // grace posts while the visitor signs in
    const board = await postScore(m.store, DAY, 'tester', { score: 9, seconds: 80 });
    expect(m.reads.filter((k) => k === boardKey(DAY))).toHaveLength(2);
    expect(board.entries.map((e) => e.name)).toEqual(['ada', 'tester', 'grace']);
    // A post that lands between that read and the write is the accepted lost write: one value, last writer wins
  });

  it('postScore replaces this name’s earlier entry rather than adding a second', async () => {
    const { store, writes } = memoryStore({
      [boardKey(DAY)]: { entries: [ADA, entry('tester', 3, 300, `${DAY}T07:00:00.000Z`)] },
    });
    const board = await postScore(store, DAY, 'tester', { score: 9, seconds: 80 });
    expect(board.entries.filter((e) => e.name === 'tester')).toHaveLength(1);
    expect((writes[0]!.value as { entries: LeaderboardEntry[] }).entries).toHaveLength(2);
  });

  it('postScore throws when the store refuses the write', async () => {
    const refusing: KeyStore = {
      via: 'api',
      get: async () => null,
      set: async () => {
        throw new Error('401');
      },
    };
    await expect(postScore(refusing, DAY, 'tester', { score: 9, seconds: 80 })).rejects.toThrow(
      '401',
    );
  });

  it('sortEntries is stable and leaves its input alone', () => {
    const input = [entry('b', 5, 10, '2'), entry('a', 5, 10, '1')];
    expect(sortEntries(input).map((e) => e.name)).toEqual(['a', 'b']);
    expect(input[0]!.name).toBe('b');
  });
});

describe('played today, as a protected key', () => {
  it('round-trips the record and reads nothing as null', async () => {
    const { store, writes } = memoryStore();
    expect(await readPlayed(store, DAY)).toBeNull();
    await markPlayed(store, DAY, { entry: 'hypatia', shelf: 'history', score: 9, seconds: 88.6 });
    expect(writes).toEqual([
      {
        key: 'played:2026-09-05',
        value: { entry: 'hypatia', shelf: 'history', score: 9, seconds: 89 },
        mode: 'protected',
      },
    ]);
    expect(await readPlayed(store, DAY)).toEqual({
      entry: 'hypatia',
      shelf: 'history',
      score: 9,
      seconds: 89,
    });
  });

  it('a store that cannot answer reads as not played', async () => {
    const broken: KeyStore = {
      via: 'host',
      get: async () => {
        throw new Error('down');
      },
      set: async () => {},
    };
    expect(await readPlayed(broken, DAY)).toBeNull();
    const { store } = memoryStore({ [playedKey(DAY)]: 'garbage' });
    expect(await readPlayed(store, DAY)).toBeNull();
  });
});

describe('days and display', () => {
  it('keys are per UTC day', () => {
    expect(boardKey(DAY)).toBe('leaderboard:2026-09-05');
    expect(playedKey(DAY)).toBe('played:2026-09-05');
    const now = new Date('2026-09-05T00:30:00.000Z');
    expect(utcDayAgo(0, now)).toBe('2026-09-05');
    expect(utcDayAgo(1, now)).toBe('2026-09-04');
  });

  it('clockOf and clampScore', () => {
    expect(clockOf(74)).toBe('1:14');
    expect(clockOf(0)).toBe('0:00');
    expect(clockOf(Number.NaN)).toBe('0:00');
    expect(clampScore({ score: -1, seconds: 400 })).toEqual({ score: 0, seconds: 330 });
  });
});
