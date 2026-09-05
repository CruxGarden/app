/**
 * A Shelf: a curated, bounded set of hidden things a round draws from —
 * published as a crux, forkable. Bounded so deduction has edges: a curated
 * forty beats a random thousand. A shelf is a genre; the Shelf is the game
 * (its `question` is what the player is trying to answer), the engine is
 * generic.
 *
 * `shelf.json` is the file; `parseShelf` is the only way in, and it refuses
 * anything flagged living — generating speech for someone who can object to
 * it is not a mode worth building (ADR 0016).
 */

import {
  HIDDEN_KINDS,
  defaultQuestionFor,
  type HiddenKind,
  type HiddenState,
  type Provenance,
} from './hidden';

export interface ShelfEntry {
  id: string;
  name: string;
  aliases: string[];
  kind: HiddenKind;
  era?: string;
  /** One line of temperament for the voice. */
  voiceNote?: string;
  provenance: Provenance;
  /** Required (non-empty) when `provenance` is `sourced`. */
  sources?: string[];
  /** The most famous work/invention/battle/act — never said outright. Inferred by the model when absent. */
  mostFamous?: string[];
  /**
   * Editorial flag. Whether someone is dead is not enforceable here; an entry
   * that *declares* itself living is refused by `parseShelf`.
   */
  living?: boolean;
}

export interface Shelf {
  id: string;
  title: string;
  /** The genre — 'history', 'things', 'myth', … Free text, shown to the player. */
  kind: string;
  description?: string;
  /**
   * What the player is trying to answer: "Who am I?", "What am I?", "Where am
   * I?", "When am I?", "Why?". Derived from the entries' kind when absent.
   */
  question: string;
  /** How the hidden things refer to themselves. Default 'I'. */
  voicePerson?: string;
  entries: ShelfEntry[];
}

export class ShelfParseError extends Error {
  constructor(
    message: string,
    /** JSON path of the offending value — "entries[3].kind". */
    readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ShelfParseError';
  }
}

/**
 * Parse and validate a shelf from `shelf.json` text or an already-parsed
 * value. Throws `ShelfParseError` naming the path of the first problem.
 */
export function parseShelf(input: string | unknown): Shelf {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (err) {
      throw new ShelfParseError(`not valid JSON (${(err as Error).message})`, '$');
    }
  }
  if (!isRecord(raw)) throw new ShelfParseError('shelf must be an object', '$');

  const id = requireString(raw, 'id', '$');
  const title = requireString(raw, 'title', '$');
  const kind = requireString(raw, 'kind', '$');
  const description = optionalString(raw, 'description', '$');
  const voicePerson = optionalString(raw, 'voicePerson', '$');

  if (!Array.isArray(raw.entries)) throw new ShelfParseError('entries must be an array', '$');
  if (raw.entries.length === 0) throw new ShelfParseError('a shelf needs at least one entry', '$');

  const entries: ShelfEntry[] = [];
  const ids = new Set<string>();
  raw.entries.forEach((e, i) => {
    const entry = parseEntry(e, `entries[${i}]`);
    if (ids.has(entry.id)) {
      throw new ShelfParseError(`duplicate entry id "${entry.id}"`, `entries[${i}].id`);
    }
    ids.add(entry.id);
    entries.push(entry);
  });

  const question = optionalString(raw, 'question', '$') ?? defaultShelfQuestion(entries);

  return {
    id,
    title,
    kind,
    ...(description ? { description } : {}),
    question,
    ...(voicePerson ? { voicePerson } : {}),
    entries,
  };
}

/**
 * The question a shelf asks when it does not say: from the kind of its
 * entries — the most common kind wins; ties go to the first entry's kind.
 */
export function defaultShelfQuestion(entries: readonly Pick<ShelfEntry, 'kind'>[]): string {
  const counts = new Map<HiddenKind, number>();
  for (const e of entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  let best: HiddenKind = entries[0]?.kind ?? 'person';
  let bestCount = 0;
  for (const e of entries) {
    const n = counts.get(e.kind) ?? 0;
    if (n > bestCount) {
      best = e.kind;
      bestCount = n;
    }
  }
  return defaultQuestionFor(best);
}

function parseEntry(raw: unknown, path: string): ShelfEntry {
  if (!isRecord(raw)) throw new ShelfParseError('entry must be an object', path);
  const id = requireString(raw, 'id', path);
  const name = requireString(raw, 'name', path);
  const aliases = optionalStringList(raw, 'aliases', path) ?? [];
  const kind = requireString(raw, 'kind', path);
  if (!(HIDDEN_KINDS as readonly string[]).includes(kind)) {
    throw new ShelfParseError(`kind must be one of ${HIDDEN_KINDS.join(', ')}`, `${path}.kind`);
  }
  const provenance = requireString(raw, 'provenance', path);
  if (provenance !== 'sourced' && provenance !== 'unsourced') {
    throw new ShelfParseError('provenance must be "sourced" or "unsourced"', `${path}.provenance`);
  }
  const sources = optionalStringList(raw, 'sources', path);
  if (provenance === 'sourced' && (!sources || sources.length === 0)) {
    throw new ShelfParseError('a sourced entry needs at least one source', `${path}.sources`);
  }
  if (raw.living === true) {
    throw new ShelfParseError(`"${name}" is flagged living — living people are not a shelf`, path);
  }
  if (raw.living !== undefined && typeof raw.living !== 'boolean') {
    throw new ShelfParseError('living must be a boolean', `${path}.living`);
  }
  const era = optionalString(raw, 'era', path);
  const voiceNote = optionalString(raw, 'voiceNote', path);
  const mostFamous = optionalStringList(raw, 'mostFamous', path);

  return {
    id,
    name,
    aliases,
    kind: kind as HiddenKind,
    ...(era ? { era } : {}),
    ...(voiceNote ? { voiceNote } : {}),
    provenance,
    ...(sources ? { sources } : {}),
    ...(mostFamous && mostFamous.length > 0 ? { mostFamous } : {}),
    ...(raw.living === false ? { living: false } : {}),
  };
}

/** The Hidden State for a round drawn from this shelf: the entry plus the shelf's question and pronoun. */
export function hiddenFromEntry(
  entry: ShelfEntry,
  shelf: Pick<Shelf, 'question' | 'voicePerson'>,
): HiddenState {
  return {
    entryId: entry.id,
    name: entry.name,
    aliases: [...entry.aliases],
    kind: entry.kind,
    ...(entry.era ? { era: entry.era } : {}),
    ...(entry.voiceNote ? { voiceNote: entry.voiceNote } : {}),
    provenance: entry.provenance,
    ...(entry.sources ? { sources: [...entry.sources] } : {}),
    ...(entry.mostFamous ? { mostFamous: [...entry.mostFamous] } : {}),
    question: shelf.question,
    ...(shelf.voicePerson ? { voicePerson: shelf.voicePerson } : {}),
  };
}

/**
 * Pick an entry deterministically from a seed — the date string for "today's
 * entry", any string for a replayable round — or at random when no seed is
 * given. The shelf id is folded in so two shelves do not move in lockstep on
 * the same day.
 */
export function pickEntry(shelf: Shelf, seed?: string): ShelfEntry {
  const n = shelf.entries.length;
  if (n === 0) throw new ShelfParseError('cannot pick from an empty shelf', '$.entries');
  const index =
    seed === undefined ? Math.floor(Math.random() * n) : fnv1a(`${shelf.id}:${seed}`) % n;
  return shelf.entries[index]!;
}

/** The seed for "today's entry": the local calendar date as YYYY-MM-DD. */
export function todaySeed(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FNV-1a 32-bit — small, fast, and stable across runtimes. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function requireString(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ShelfParseError(`${key} must be a non-empty string`, `${path}.${key}`);
  }
  return v.trim();
}

function optionalString(o: Record<string, unknown>, key: string, path: string): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new ShelfParseError(`${key} must be a string`, `${path}.${key}`);
  const t = v.trim();
  return t === '' ? undefined : t;
}

function optionalStringList(
  o: Record<string, unknown>,
  key: string,
  path: string,
): string[] | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new ShelfParseError(`${key} must be an array of strings`, `${path}.${key}`);
  }
  return (v as string[]).map((x) => x.trim()).filter((x) => x !== '');
}
