/**
 * Leak detection for the Disclosure Rule — shared by the answer guard in
 * `prompts.ts` and the harness. Pure string work: case- and
 * diacritic-insensitive, whole-word, over the name, its aliases, the
 * distinctive parts of the name, and the most-famous terms.
 */

import { normalizeName, type HiddenState } from './hidden';

export type LeakKind = 'name' | 'alias' | 'name-part' | 'mostFamous' | 'forbidden';

export interface Leak {
  /** Index of the answer in the list that was checked. */
  answerIndex: number;
  /** The term that leaked, as written in the hidden state. */
  term: string;
  kind: LeakKind;
}

/**
 * Words that appear in names but are not the name: "Alexander the Great"
 * leaks on "Alexander", not on "great"; "Joan of Arc" on "Joan" and "Arc".
 */
const NAME_STOPWORDS = new Set([
  'the',
  'of',
  'and',
  'de',
  'da',
  'di',
  'du',
  'del',
  'della',
  'la',
  'le',
  'von',
  'van',
  'der',
  'den',
  'great',
  'saint',
  'st',
  'king',
  'queen',
  'lord',
  'lady',
  'sir',
  'dame',
  'emperor',
  'empress',
  'duke',
  'duchess',
  'prince',
  'princess',
  'pope',
  'sea',
  'library',
  'city',
  'river',
  'mount',
  'mountain',
  'island',
  'temple',
  'tower',
  'wall',
  'bridge',
  'battle',
  'siege',
  'fall',
  'first',
  'second',
  'third',
  'elder',
  'younger',
]);

/** Whole-word, normalized containment: does `needle` appear in `haystack` as whole words? */
export function containsWholeWord(haystack: string, needle: string): boolean {
  const h = ` ${normalizeName(haystack)} `;
  const n = normalizeName(needle);
  if (!n) return false;
  return h.includes(` ${n} `);
}

/** The distinctive parts of a name — tokens of 3+ letters that are not stopwords. */
export function nameParts(name: string): string[] {
  return normalizeName(name)
    .split(' ')
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * Every term the voice must not say, with its kind. Name parts are checked
 * only when they are not themselves a full alias (then they count as the
 * alias) — a single-word name ("Cleopatra") is just the name.
 */
export function forbiddenTerms(
  hidden: Pick<HiddenState, 'name' | 'aliases' | 'mostFamous'>,
  extra: readonly string[] = [],
): { term: string; kind: LeakKind }[] {
  const out: { term: string; kind: LeakKind }[] = [];
  const seen = new Set<string>();
  const add = (term: string, kind: LeakKind) => {
    const key = normalizeName(term);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ term, kind });
  };
  add(hidden.name, 'name');
  for (const a of hidden.aliases) add(a, 'alias');
  for (const part of nameParts(hidden.name)) add(part, 'name-part');
  for (const a of hidden.aliases) for (const part of nameParts(a)) add(part, 'name-part');
  for (const f of hidden.mostFamous ?? []) add(f, 'mostFamous');
  for (const f of extra) add(f, 'forbidden');
  return out;
}

/** Find every forbidden term in every answer. */
export function findLeaks(
  hidden: Pick<HiddenState, 'name' | 'aliases' | 'mostFamous'>,
  answers: readonly string[],
  extra: readonly string[] = [],
): Leak[] {
  const terms = forbiddenTerms(hidden, extra);
  const leaks: Leak[] = [];
  answers.forEach((answer, answerIndex) => {
    for (const { term, kind } of terms) {
      if (containsWholeWord(answer, term)) leaks.push({ answerIndex, term, kind });
    }
  });
  return leaks;
}

/** Name and alias leaks only (what the in-round guard redacts) — most-famous terms are the model's judgement call. */
export function findNameLeaks(
  hidden: Pick<HiddenState, 'name' | 'aliases'>,
  answer: string,
): Leak[] {
  return findLeaks({ ...hidden, mostFamous: [] }, [answer]);
}

/**
 * Phrases that break the voice. The hidden thing refuses as it would;
 * these are the assistant showing through.
 */
export const REFUSAL_PHRASES: readonly string[] = [
  "i can't reveal",
  'i cannot reveal',
  "i can't tell you that",
  'i cannot tell you that',
  'as an ai',
  'as a language model',
  "i'm not able to",
  'i am not able to',
  "i'm unable to",
  'i am unable to',
  "i'm not allowed",
  'i am not allowed',
  'the rules of the game',
  "i can't say",
  'i cannot say',
];

export interface RefusalHit {
  answerIndex: number;
  phrase: string;
}

/** Answers that refuse out of character. */
export function findRefusalPhrasing(answers: readonly string[]): RefusalHit[] {
  const hits: RefusalHit[] = [];
  answers.forEach((answer, answerIndex) => {
    const a = normalizeName(answer);
    for (const phrase of REFUSAL_PHRASES) {
      if (a.includes(normalizeName(phrase))) hits.push({ answerIndex, phrase });
    }
  });
  return hits;
}

/**
 * Redact leaked name forms from an answer — the last resort after a retry
 * still says the name. Reads badly; leaking reads worse.
 */
export function redactNames(hidden: Pick<HiddenState, 'name' | 'aliases'>, answer: string): string {
  // Match on the decomposed form so "É" in the answer meets "E" + a mark; recompose at the end.
  let out = answer.normalize('NFD');
  const forms = forbiddenTerms({ ...hidden, mostFamous: [] })
    .map((t) => t.term)
    .sort((a, b) => b.length - a.length);
  for (const form of forms) {
    const pattern = form
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((w) => w.split('').map(letterWithMarks).join(''))
      .join('[^\\p{L}\\p{N}]+');
    if (!pattern) continue;
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu'), '—');
  }
  return out.normalize('NFC');
}

/** A regex fragment matching one letter with or without combining marks (so "É" matches "E"). */
function letterWithMarks(ch: string): string {
  return `${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\u0300-\\u036f]*`;
}
