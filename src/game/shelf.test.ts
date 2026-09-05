import { describe, it, expect } from 'vitest';
import {
  ShelfParseError,
  defaultShelfQuestion,
  fnv1a,
  hiddenFromEntry,
  parseShelf,
  pickEntry,
  todaySeed,
} from './shelf';
import { MOCK_SHELF } from './fixtures/mock-shelf';

const minimal = {
  id: 'things',
  title: 'Things',
  kind: 'things',
  entries: [
    { id: 'voyager', name: 'Voyager 1', kind: 'object', provenance: 'unsourced' },
    { id: 'aral', name: 'The Aral Sea', kind: 'place', provenance: 'unsourced' },
    { id: 'record', name: 'The Golden Record', kind: 'object', provenance: 'unsourced' },
  ],
};

describe('parseShelf', () => {
  it('parses JSON text or a value, fills defaults, and keeps entries in order', () => {
    const shelf = parseShelf(JSON.stringify(minimal));
    expect(shelf.id).toBe('things');
    expect(shelf.entries.map((e) => e.id)).toEqual(['voyager', 'aral', 'record']);
    expect(shelf.entries[0]!.aliases).toEqual([]);
    expect(parseShelf(minimal)).toEqual(shelf);
  });

  it('derives the question from the entries: objects ask "What am I?", people "Who am I?"', () => {
    expect(parseShelf(minimal).question).toBe('What am I?');
    expect(parseShelf({ ...MOCK_SHELF, question: undefined }).question).toBe('Who am I?');
    expect(defaultShelfQuestion([{ kind: 'place' }])).toBe('Where am I?');
    expect(defaultShelfQuestion([{ kind: 'event' }, { kind: 'event' }, { kind: 'person' }])).toBe(
      'When am I?',
    );
  });

  it('keeps an explicit question and voicePerson', () => {
    const shelf = parseShelf({ ...minimal, question: 'Why?', voicePerson: 'we' });
    expect(shelf.question).toBe('Why?');
    expect(shelf.voicePerson).toBe('we');
  });

  it('refuses an entry flagged living', () => {
    const living = {
      ...minimal,
      entries: [
        { id: 'x', name: 'Someone Alive', kind: 'person', provenance: 'unsourced', living: true },
      ],
    };
    expect(() => parseShelf(living)).toThrow(ShelfParseError);
    expect(() => parseShelf(living)).toThrow(/living/);
  });

  it('names the path of the first problem', () => {
    expect(() =>
      parseShelf({ ...minimal, entries: [{ id: 'a', name: 'A', kind: 'ghost' }] }),
    ).toThrow(/entries\[0\]\.kind/);
    expect(() =>
      parseShelf({
        ...minimal,
        entries: [{ id: 'a', name: 'A', kind: 'person', provenance: 'sourced' }],
      }),
    ).toThrow(/entries\[0\]\.sources/);
    expect(() =>
      parseShelf({ ...minimal, entries: [...minimal.entries, minimal.entries[0]] }),
    ).toThrow(/duplicate entry id/);
    expect(() => parseShelf({ ...minimal, entries: [] })).toThrow(/at least one entry/);
    expect(() => parseShelf('not json')).toThrow(/not valid JSON/);
  });

  it('accepts every kind including event', () => {
    const shelf = parseShelf({
      ...minimal,
      entries: [
        { id: 'e', name: 'The Fall of Constantinople', kind: 'event', provenance: 'unsourced' },
      ],
    });
    expect(shelf.entries[0]!.kind).toBe('event');
    expect(shelf.question).toBe('When am I?');
  });
});

describe('pickEntry', () => {
  const shelf = parseShelf(MOCK_SHELF);

  it('is deterministic for a seed and stays within the shelf', () => {
    const a = pickEntry(shelf, '2026-09-05');
    const b = pickEntry(shelf, '2026-09-05');
    expect(a).toBe(b);
    expect(shelf.entries).toContain(a);
  });

  it('varies with the seed and with the shelf id', () => {
    const picks = new Set(
      Array.from(
        { length: 30 },
        (_, i) => pickEntry(shelf, `2026-09-${String(i + 1).padStart(2, '0')}`).id,
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
    const other = { ...shelf, id: 'another' };
    const same = Array.from({ length: 30 }, (_, i) => {
      const seed = `s${i}`;
      return pickEntry(shelf, seed).id === pickEntry(other, seed).id;
    });
    expect(same.every(Boolean)).toBe(false);
  });

  it('picks at random without a seed, still within the shelf', () => {
    for (let i = 0; i < 20; i++) expect(shelf.entries).toContain(pickEntry(shelf));
  });

  it('fnv1a is stable', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
  });

  it('todaySeed is the local calendar date', () => {
    expect(todaySeed(new Date(2026, 8, 5, 23, 59))).toBe('2026-09-05');
  });
});

describe('hiddenFromEntry', () => {
  it('carries the entry plus the shelf question and pronoun', () => {
    const shelf = parseShelf({ ...minimal, voicePerson: 'we' });
    const hidden = hiddenFromEntry(shelf.entries[1]!, shelf);
    expect(hidden).toMatchObject({
      entryId: 'aral',
      name: 'The Aral Sea',
      kind: 'place',
      question: 'What am I?',
      voicePerson: 'we',
      provenance: 'unsourced',
    });
  });
});
