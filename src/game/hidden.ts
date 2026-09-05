/**
 * The interrogable-crux primitive (ADR 0016): a crux that holds something
 * back. Four parts — the Hidden State (the secret), a Voice (how it speaks),
 * a Disclosure Rule (what it may never say outright) and a Reveal (what it
 * says when the round ends). *Who Am I?* is one configuration of these; a
 * ghost story or a mystery is another shelf and another config.
 *
 * Everything here is data. The model calls that consume it live in
 * `prompts.ts`; the game loop in `round.ts`. Nothing in this module imports
 * React, the stores or the services.
 */

/** What kind of thing is hidden. Drives the default question and the pronoun used to explain the game to the model. */
export type HiddenKind = 'person' | 'character' | 'object' | 'place' | 'event';

export const HIDDEN_KINDS: readonly HiddenKind[] = [
  'person',
  'character',
  'object',
  'place',
  'event',
];

/**
 * Provenance signal, designed before the first confabulation complaint:
 * `sourced` entries carry the pages their facts can be checked against.
 */
export type Provenance = 'sourced' | 'unsourced';

/**
 * The secret, fixed before the round opens and passed into every later call
 * as context. The model is told who it is each turn — never asked to
 * remember — so it cannot drift toward whoever the player has been guessing.
 */
export interface HiddenState {
  /** Shelf entry id this was drawn from. */
  entryId: string;
  /** The name that must never be said. */
  name: string;
  /** Alternate forms that count as the name (also never said; also accepted as a guess). */
  aliases: string[];
  kind: HiddenKind;
  /** Free text — "1st century BC", "Late Bronze Age", "1977–". */
  era?: string;
  /** One line of temperament for the voice — "proud, quick to take offence, funnier than she lets on". */
  voiceNote?: string;
  provenance: Provenance;
  /** Pages the facts can be checked against (required when sourced). */
  sources?: string[];
  /**
   * The single most famous work / invention / battle / act — the things that
   * must never be named outright. Optional: when absent the model is asked to
   * infer what "most famous" means for this thing and hold it back.
   */
  mostFamous?: string[];
  /** The Shelf's question — "Who am I?", "What am I?", "Where am I?", "When am I?". */
  question: string;
  /** How the hidden thing refers to itself. Default 'I'. */
  voicePerson?: string;
}

/**
 * How the hidden thing speaks. The voice is the product: every answer must be
 * enjoyable to read even when it tells the player nothing.
 */
export interface Voice {
  /** Temperament in one line. Defaults to the entry's voice note. */
  note: string;
  /** Upper bound on sentences per answer — short keeps the round at five minutes. */
  maxSentences: number;
  /** The pronoun the thing uses for itself ('I' — or 'we' for a crowd, a city, a fleet). */
  person: string;
}

export const DEFAULT_VOICE: Readonly<Omit<Voice, 'note'>> = {
  maxSentences: 3,
  person: 'I',
};

/** Build the Voice for a hidden state: its note, its pronoun, the default budget. */
export function voiceFor(hidden: HiddenState, overrides: Partial<Voice> = {}): Voice {
  return {
    note: hidden.voiceNote?.trim() || defaultVoiceNote(hidden.kind),
    maxSentences: DEFAULT_VOICE.maxSentences,
    person: hidden.voicePerson?.trim() || DEFAULT_VOICE.person,
    ...overrides,
  };
}

function defaultVoiceNote(kind: HiddenKind): string {
  switch (kind) {
    case 'object':
      return 'patient, a little weary of being handled, amused that anyone is asking';
    case 'place':
      return 'old, unhurried, fond of the people who passed through and unbothered by the rest';
    case 'event':
      return 'certain of its own importance, impatient with how it has been retold';
    case 'character':
      return 'exactly as its author wrote it, and slightly annoyed to be asked';
    default:
      return 'wry, proud, evasive, reacting to the question in front of them';
  }
}

/**
 * What the voice may never say outright. Evasion, pride and refusal in
 * character are fine; a lie never is. Everything not listed is fair game —
 * a vivid, quotable line is a gift to a good searcher, and difficulty lives
 * in oblique phrasing, not in withholding.
 */
export interface DisclosureRule {
  /** Never the name or any alias. */
  neverName: boolean;
  /** Never the single most famous work, invention, battle or act, named outright. */
  neverMostFamous: boolean;
  /** Refuse as the hidden thing would — never "I can't reveal that", never "as an AI". */
  refuseInCharacter: boolean;
  /** Never a false fact. Silence, deflection and pride are the only tools. */
  neverLie: boolean;
  /** Extra terms a shelf or entry wants held back (a nickname, a catchphrase). */
  extraForbidden?: string[];
}

export const DEFAULT_DISCLOSURE: Readonly<DisclosureRule> = {
  neverName: true,
  neverMostFamous: true,
  refuseInCharacter: true,
  neverLie: true,
};

/** The Disclosure Rule for a hidden state, defaults filled. */
export function disclosureFor(overrides: Partial<DisclosureRule> = {}): DisclosureRule {
  return { ...DEFAULT_DISCLOSURE, ...overrides };
}

/** One question and its answer, as the voice gave it — the unit every call is given as context. */
export interface Exchange {
  question: string;
  answer: string;
}

/** The result of the adjudication call: ground truth vs the player's guess. */
export interface Adjudication {
  correct: boolean;
  /** The guess as a canonical name, when it names someone/something real ("napolean" → "Napoleon Bonaparte"). */
  normalized: string;
  /** One line: why it is (not) the hidden thing. Shown only in the reveal. */
  why: string;
}

/** One wrong guess and why it was a reasonable thing to think. */
export interface RevealMiss {
  guess: string;
  whyReasonable: string;
}

/**
 * The end of a Round: what it was, why it matters, and — not optional — why
 * each wrong guess was reasonable. The misses are the curriculum.
 */
export interface Reveal {
  /** "This was …" — the name, plainly, with the era; the first time it is said. Every kind. */
  who: string;
  /** Why anyone still says the name — a life, a machine, a place, a day. */
  whyItMatters: string;
  misses: RevealMiss[];
  /** One last line in voice. */
  parting: string;
}

/**
 * The default question for a kind — the Shelf may override it (a shelf of
 * years asks "When am I?"; a shelf of causes asks "Why?").
 */
export function defaultQuestionFor(kind: HiddenKind): string {
  switch (kind) {
    case 'object':
      return 'What am I?';
    case 'place':
      return 'Where am I?';
    case 'event':
      return 'When am I?';
    default:
      return 'Who am I?';
  }
}

/**
 * The noun the game uses when explaining the rule to the model — "never say
 * who you are" for a person, "what you are" for an object, "where you are"
 * for a place, "what happened" for an event. The voice is "I" whatever it is.
 */
export function identityNounFor(kind: HiddenKind): string {
  switch (kind) {
    case 'object':
      return 'what you are';
    case 'place':
      return 'where you are';
    case 'event':
      return 'what happened';
    default:
      return 'who you are';
  }
}

/**
 * Case- and diacritic-insensitive form for matching names: "Émile Zola" →
 * "emile zola". Apostrophes vanish and other punctuation collapses to single
 * spaces, so "O'Neill" and "ONeill" meet, and "J'accuse" and "Jaccuse".
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’ʼ`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** All the forms of the name: the name itself plus its aliases, deduplicated by normalized form. */
export function nameForms(hidden: Pick<HiddenState, 'name' | 'aliases'>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const form of [hidden.name, ...hidden.aliases]) {
    const key = normalizeName(form);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(form);
  }
  return out;
}

/** True when the guess is the name or an alias, allowing case, diacritics and punctuation. */
export function matchesName(hidden: Pick<HiddenState, 'name' | 'aliases'>, guess: string): boolean {
  const g = normalizeName(guess);
  if (!g) return false;
  return nameForms(hidden).some((f) => normalizeName(f) === g);
}
