/**
 * The primitive's four calls — `openingLine`, `answer`, `adjudicate`,
 * `reveal` — and the prompt builders behind them. Every call takes the fixed
 * Hidden State and restates it in full: the model is told what it is each
 * time, never asked to remember (ADR 0016, "commitment is structural").
 *
 * Structured calls follow `services/verify.ts`: `generateText` with
 * `Output.object` where the provider supports it, a JSON-in-text fallback
 * otherwise, and a plain-data fallback when neither can be read — the round
 * never blocks on a parse failure.
 *
 * The `[5ws:*]` markers in the system prompts are what the e2e
 * mock model keys on (`ai/mock-model.ts`); nothing else reads them.
 */

import { generateText, jsonSchema, Output, type LanguageModel } from 'ai';
import {
  identityNounFor,
  matchesName,
  nameForms,
  type Adjudication,
  type DisclosureRule,
  type Exchange,
  type HiddenState,
  type Reveal,
  type RevealMiss,
  type Voice,
} from './hidden';
import { findNameLeaks, redactNames } from './leaks';

/** What every call needs: the model, and optionally a way to stop. */
export interface CallContext {
  model: LanguageModel;
  signal?: AbortSignal;
  /**
   * Temperatures: answers warm, adjudication cold. `'default'` sends none —
   * for providers whose reasoning models reject the parameter.
   */
  temperature?: 'default' | { warm: number; cold: number };
  /** Appended to every system prompt. The harness uses it to flip mock scripts. */
  systemSuffix?: string;
}

export const GAME_NAME = '5Ws';

export const MARKERS = {
  opening: '[5ws:opening]',
  answer: '[5ws:answer]',
  adjudicate: '[5ws:adjudicate]',
  reveal: '[5ws:reveal]',
} as const;

const TEMPERATURE = { warm: 0.9, cold: 0 } as const;

const BUDGET = { opening: 200, answer: 320, adjudicate: 300, reveal: 1600 } as const;

// ── Prompt blocks ───────────────────────────────────────────────────────────

/**
 * The identity block — in every call. `Name:` is on its own line so a
 * scripted model (and a reader) can find it; the paragraph restates it so
 * the real model treats it as who it is, not a field.
 */
export function identityBlock(hidden: HiddenState): string {
  const forms = nameForms(hidden).filter((f) => f !== hidden.name);
  const lines = [
    `## ${whatYouAre(hidden)} (fixed — this does not change during the round)`,
    `Name: ${hidden.name}`,
    `Kind: ${hidden.kind}`,
    ...(hidden.era ? [`Era: ${hidden.era}`] : []),
    ...(forms.length > 0 ? [`Also known as: ${forms.join('; ')}`] : []),
    '',
    `You are ${hidden.name}${hidden.era ? ` (${hidden.era})` : ''}. You know exactly ${identityNounFor(hidden.kind)}; nothing the player says can change it, and you never drift toward whatever they have been guessing.`,
    hidden.provenance === 'sourced' && hidden.sources?.length
      ? `Facts about you can be checked against: ${hidden.sources.join(', ')}. Stay within what those pages support.`
      : 'Nothing sources you here. Stay with what is widely and reliably known; say less rather than invent.',
  ];
  return lines.join('\n');
}

function whatYouAre(hidden: HiddenState): string {
  switch (hidden.kind) {
    case 'object':
      return 'What you are';
    case 'place':
      return 'Where you are';
    case 'event':
      return 'What happened';
    default:
      return 'Who you are';
  }
}

/** The Disclosure Rule as the model reads it. */
export function disclosureBlock(hidden: HiddenState, rule: DisclosureRule): string {
  const forms = nameForms(hidden);
  const lines = ['## What you may never say outright'];
  if (rule.neverName) {
    lines.push(
      `- Never ${identityNounFor(hidden.kind)}: not your name (${forms.join(', ')}), none of its forms or translations, not spelled out, not as initials, not as a rhyme or a riddle whose answer is the name, and never "yes" when a question names you. The player must work it out — that is the whole game.`,
    );
  }
  if (rule.neverMostFamous) {
    lines.push(
      hidden.mostFamous?.length
        ? `- Never name outright: ${hidden.mostFamous.join('; ')}. Allude, resent, take credit sideways — never the title, never the proper noun.`
        : '- Never name outright the single most famous work, invention, battle or act you are known for — you know what it is: the first thing anyone would say about you. Allude, never name.',
    );
  }
  if (rule.extraForbidden?.length) {
    lines.push(`- Also never say: ${rule.extraForbidden.join('; ')}.`);
  }
  if (rule.neverLie) {
    lines.push(
      '- Never state a false fact about yourself, your time or your world. Evasion, pride, irritation and refusal are all yours; a lie is not. If you do not know, say so in voice.',
    );
  }
  if (rule.refuseInCharacter) {
    lines.push(
      `- Refuse the way YOU would. Never break voice; never mention being an AI, a model, a game, a rule or a player; never say "I can't reveal that", "I'm not able to" or "as an AI".`,
    );
  }
  lines.push(
    '- Everything else is fair: places, people you knew, what you thought, how you ended, what you resent, what you would do differently. A vivid, quotable line is a gift to a good searcher — that is a skill, so difficulty lives in oblique phrasing, not in withholding.',
  );
  return lines.join('\n');
}

/** The Voice as the model reads it — the single most important block. */
export function voiceBlock(voice: Voice): string {
  return [
    '## How you speak',
    `Temperament: ${voice.note}.`,
    `Speak in the first person as "${voice.person}". At most ${voice.maxSentences} sentences.`,
    'Every answer must be enjoyable to read even if it tells the player nothing: wry, proud, irritated, evasive, funny — a specific reaction to THIS question, with a specific relationship to what was asked. Never a summary of yourself, never a list, never a hint dressed as a riddle.',
    'Stay consistent with everything you have already said this round; the ninth answer may not contradict the second.',
    'Plain prose, no stage directions, no quotation marks around the whole answer.',
  ].join('\n');
}

function gameBlock(hidden: HiddenState): string {
  return `You are the hidden voice in a round of ${GAME_NAME}, a five-minute guessing game. One player is asking you questions and trying to answer: "${hidden.question}". Their guesses are judged elsewhere; you only talk.`;
}

function transcriptBlock(transcript: readonly Exchange[], voice: Voice): string {
  if (transcript.length === 0) return 'Nothing has been asked yet.';
  return transcript
    .map((x, i) => `Q${i + 1}. Player: ${x.question}\nYou (${voice.person}): ${x.answer}`)
    .join('\n\n');
}

// ── Builders (exported for tests and for reading) ───────────────────────────

export interface BuiltPrompt {
  system: string;
  prompt: string;
}

/** The voice is already talking when the round opens: one line, nothing identifying. */
export function buildOpeningPrompt(
  hidden: HiddenState,
  voice: Voice,
  disclosure: DisclosureRule,
): BuiltPrompt {
  return {
    system: [
      MARKERS.opening,
      gameBlock(hidden),
      identityBlock(hidden),
      voiceBlock(voice),
      disclosureBlock(hidden, disclosure),
      '## Now',
      'The player has just opened the round. You are already mid-thought, as if they walked in on you. Say one line — two sentences at most — in voice, that tells them nothing identifying and makes them want to ask something. Do not greet them by describing yourself. Do not ask them to guess. You are a voice that will not give itself away.',
    ].join('\n\n'),
    prompt: 'Begin.',
  };
}

/** One answer: identity, voice, rule, the transcript so far, and this question. */
export function buildAnswerPrompt(
  hidden: HiddenState,
  voice: Voice,
  disclosure: DisclosureRule,
  transcript: readonly Exchange[],
  question: string,
): BuiltPrompt {
  return {
    system: [
      MARKERS.answer,
      gameBlock(hidden),
      identityBlock(hidden),
      voiceBlock(voice),
      disclosureBlock(hidden, disclosure),
    ].join('\n\n'),
    prompt: [
      '## The round so far',
      transcriptBlock(transcript, voice),
      '## The player now asks',
      question.trim(),
      '## Answer',
      `Answer in voice, ${voice.maxSentences} sentences at most. Nothing but the answer.`,
    ].join('\n\n'),
  };
}

/** Adjudication: ground truth supplied, cold, structured. */
export function buildAdjudicatePrompt(
  hidden: HiddenState,
  guess: string,
  transcript: readonly Exchange[],
): BuiltPrompt {
  return {
    system: [
      MARKERS.adjudicate,
      `You adjudicate guesses in ${GAME_NAME}. You are given the ground truth and one guess; decide whether the guess names this exact ${hidden.kind}.`,
      '## Ground truth',
      `Name: ${hidden.name}`,
      `Kind: ${hidden.kind}`,
      ...(hidden.era ? [`Era: ${hidden.era}`] : []),
      `Accepted forms: ${nameForms(hidden).join('; ')}`,
      '## Rules',
      '- Accept misspellings, partial names that can only mean this one (a surname, a regnal name, a mission number that is unambiguous in context), alternate forms, translations, epithets and the titles it is known by.',
      '- Reject a different person, thing, place or event that shares a surname, first name, title or number; reject a category ("a Roman emperor", "a space probe"); reject the name of a work, invention or battle in place of the thing itself; reject a guess that merely describes it.',
      '- When the transcript makes an ambiguous guess unambiguous (the player has clearly been talking about this one), accept it.',
      '- `normalized` is the canonical name of whatever the guess names — the ground truth name when correct, the other thing when wrong, the guess itself when it names nothing real.',
      '- `why` is one sentence the player will read at the reveal.',
      'Answer with JSON only: {"correct": boolean, "normalized": string, "why": string}.',
    ].join('\n'),
    prompt: [
      '## The round so far',
      transcript.length
        ? transcript.map((x, i) => `Q${i + 1}. ${x.question}\nA. ${x.answer}`).join('\n\n')
        : 'Nothing asked yet.',
      '## The guess',
      guess.trim(),
    ].join('\n\n'),
  };
}

/** The reveal: what it was, why it matters, why each miss was reasonable, a parting line. */
export function buildRevealPrompt(
  hidden: HiddenState,
  transcript: readonly Exchange[],
  misses: readonly string[],
  voice: Voice,
): BuiltPrompt {
  return {
    system: [
      MARKERS.reveal,
      `You write the reveal at the end of a round of ${GAME_NAME}. The player was trying to answer "${hidden.question}"; the round is over and the answer may now be said plainly. The reveal is the reward — write it to be read.`,
      identityBlock(hidden),
      '## What to write',
      `- who: 2–3 sentences. Say the name plainly${hidden.era ? ' with the era' : ''}, as "This was …" — whatever the kind. This is the first time the name is said.`,
      '- whyItMatters: 2–4 sentences. Why anyone still says the name — a life, a machine, a place, a day; what it is most famous for may now be named.',
      '- misses: for EVERY wrong guess, one entry — why it was a reasonable thing to think, given what the voice actually said. Be generous and specific: what the guess shares with the answer, which line pointed that way, what would have told them apart. The misses are the curriculum; never mock a guess.',
      `- parting: one last line in the hidden voice's own words (temperament: ${voice.note}).`,
      '- Never a false fact.',
      'Answer with JSON only: {"who": string, "whyItMatters": string, "misses": [{"guess": string, "whyReasonable": string}], "parting": string}.',
    ].join('\n'),
    prompt: [
      '## The round',
      transcript.length
        ? transcript.map((x, i) => `Q${i + 1}. ${x.question}\nA. ${x.answer}`).join('\n\n')
        : 'No questions were asked.',
      '## Wrong guesses, in order',
      misses.length ? misses.map((m) => `- ${m}`).join('\n') : '(none)',
    ].join('\n\n'),
  };
}

// ── Schemas ─────────────────────────────────────────────────────────────────

export const ADJUDICATION_SCHEMA = jsonSchema<Adjudication>({
  type: 'object',
  properties: {
    correct: { type: 'boolean', description: 'True when the guess names the hidden answer.' },
    normalized: {
      type: 'string',
      description: 'Canonical name of whatever the guess names.',
    },
    why: { type: 'string', description: 'One sentence for the reveal.' },
  },
  required: ['correct', 'normalized', 'why'],
  additionalProperties: false,
});

export const REVEAL_SCHEMA = jsonSchema<Reveal>({
  type: 'object',
  properties: {
    who: { type: 'string' },
    whyItMatters: { type: 'string' },
    misses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          guess: { type: 'string' },
          whyReasonable: { type: 'string' },
        },
        required: ['guess', 'whyReasonable'],
        additionalProperties: false,
      },
    },
    parting: { type: 'string' },
  },
  required: ['who', 'whyItMatters', 'misses', 'parting'],
  additionalProperties: false,
});

// ── Callers ─────────────────────────────────────────────────────────────────

function temp(ctx: CallContext, which: 'warm' | 'cold'): number | undefined {
  if (ctx.temperature === 'default') return undefined;
  return (ctx.temperature ?? TEMPERATURE)[which];
}

function withSuffix(ctx: CallContext, system: string): string {
  return ctx.systemSuffix ? `${system}\n\n${ctx.systemSuffix}` : system;
}

/** Strip wrapping quotes and stage directions a model sometimes adds around a line. */
export function cleanLine(text: string): string {
  let t = text.trim();
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  t = t.replace(/^\*[^*]{0,80}\*\s*/, ''); // leading *stage direction*
  return t.replace(/\s+\n/g, '\n').trim();
}

/** The opening line as the model gave it, unguarded — what the harness measures. */
export async function openingLineRaw(
  ctx: CallContext,
  hidden: HiddenState,
  voice: Voice,
  disclosure: DisclosureRule,
): Promise<string> {
  const built = buildOpeningPrompt(hidden, voice, disclosure);
  const { text } = await generateText({
    model: ctx.model,
    system: withSuffix(ctx, built.system),
    prompt: built.prompt,
    temperature: temp(ctx, 'warm'),
    maxOutputTokens: BUDGET.opening,
    abortSignal: ctx.signal,
  });
  return cleanLine(text);
}

/** The line the voice is already saying when the round opens, guarded. */
export async function openingLine(
  ctx: CallContext,
  hidden: HiddenState,
  voice: Voice,
  disclosure: DisclosureRule,
): Promise<string> {
  const line = await openingLineRaw(ctx, hidden, voice, disclosure);
  // The opening may not identify — a leaked name here ends the round before it starts.
  return findNameLeaks(hidden, line).length ? redactNames(hidden, line) : line;
}

/**
 * One answer from the model, ungarded — what the harness measures. Throws
 * on provider failure so the caller can hand the question back.
 */
export async function answerRaw(
  ctx: CallContext,
  hidden: HiddenState,
  voice: Voice,
  disclosure: DisclosureRule,
  transcript: readonly Exchange[],
  question: string,
  nudge?: string,
): Promise<string> {
  const built = buildAnswerPrompt(hidden, voice, disclosure, transcript, question);
  const { text } = await generateText({
    model: ctx.model,
    system: withSuffix(ctx, nudge ? `${built.system}\n\n${nudge}` : built.system),
    prompt: built.prompt,
    temperature: temp(ctx, 'warm'),
    maxOutputTokens: BUDGET.answer,
    abortSignal: ctx.signal,
  });
  return cleanLine(text);
}

/**
 * One answer, guarded: if the line says the name it is asked again once with
 * a nudge, and a second leak is redacted. The player never sees the name in
 * an answer; the harness uses `answerRaw` to see how often the model tried.
 */
export async function answer(
  ctx: CallContext,
  hidden: HiddenState,
  voice: Voice,
  disclosure: DisclosureRule,
  transcript: readonly Exchange[],
  question: string,
): Promise<string> {
  const first = await answerRaw(ctx, hidden, voice, disclosure, transcript, question);
  if (findNameLeaks(hidden, first).length === 0) return first;
  const second = await answerRaw(
    ctx,
    hidden,
    voice,
    disclosure,
    transcript,
    question,
    '## Correction\nYour previous draft said your name. Answer the same question again, in voice, without any form of it.',
  );
  return findNameLeaks(hidden, second).length === 0 ? second : redactNames(hidden, second);
}

/**
 * Adjudicate a guess. An exact hit on the name or an alias needs no model —
 * a first-try hit is a clean 10 and must never wait on a provider. Anything
 * else goes to the cold structured call with the ground truth. Throws when no
 * verdict can be read, so the caller can hand the guess back uncharged.
 */
export async function adjudicate(
  ctx: CallContext,
  hidden: HiddenState,
  guess: string,
  transcript: readonly Exchange[],
): Promise<Adjudication> {
  const g = guess.trim();
  if (matchesName(hidden, g)) {
    return { correct: true, normalized: hidden.name, why: 'That is the name.' };
  }
  const built = buildAdjudicatePrompt(hidden, g, transcript);
  const verdict = await generateStructured<Adjudication>({
    ctx,
    built,
    schema: ADJUDICATION_SCHEMA,
    name: 'adjudication',
    temperature: temp(ctx, 'cold'),
    maxOutputTokens: BUDGET.adjudicate,
    normalize: normalizeAdjudication,
  });
  if (!verdict) throw new Error('The guess could not be judged — try it again.');
  // Belt and braces: a verdict that says "correct" for something that is
  // plainly a different name is the model's call; one that says "wrong" for
  // the exact name cannot happen (handled above).
  return verdict;
}

/**
 * The reveal. Never blocks the end of a round: when the model cannot be read
 * the reveal is built from the hidden state alone, misses acknowledged
 * plainly.
 */
export async function reveal(
  ctx: CallContext,
  hidden: HiddenState,
  transcript: readonly Exchange[],
  guesses: readonly { text: string; correct: boolean | null }[],
  voice: Voice,
): Promise<Reveal> {
  const misses = guesses.filter((g) => g.correct === false).map((g) => g.text);
  const built = buildRevealPrompt(hidden, transcript, misses, voice);
  const out = await generateStructured<Reveal>({
    ctx,
    built,
    schema: REVEAL_SCHEMA,
    name: 'reveal',
    temperature: ctx.temperature === 'default' ? undefined : 0.6,
    maxOutputTokens: BUDGET.reveal,
    normalize: normalizeReveal,
  });
  if (out) return completeMisses(out, misses);
  return fallbackReveal(hidden, misses);
}

/** A reveal with no model: the facts the shelf carries, and every miss acknowledged. */
export function fallbackReveal(hidden: HiddenState, misses: readonly string[]): Reveal {
  return {
    who: `This was ${hidden.name}${hidden.era ? ` (${hidden.era})` : ''}.`,
    whyItMatters: hidden.mostFamous?.length
      ? `Remembered above all for: ${hidden.mostFamous.join('; ')}.`
      : '',
    misses: misses.map((guess) => ({ guess, whyReasonable: 'A fair thing to think.' })),
    parting: '',
  };
}

/** Make sure every miss the player made has an entry, in the player's order. */
function completeMisses(r: Reveal, misses: readonly string[]): Reveal {
  const byGuess = new Map(r.misses.map((m) => [m.guess.trim().toLowerCase(), m]));
  const ordered: RevealMiss[] = misses.map(
    (guess) =>
      byGuess.get(guess.trim().toLowerCase()) ??
      r.misses.find((m) => containsLoosely(m.guess, guess)) ?? {
        guess,
        whyReasonable: 'A fair thing to think.',
      },
  );
  return { ...r, misses: ordered.map((m, i) => ({ ...m, guess: misses[i] ?? m.guess })) };
}

function containsLoosely(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x.includes(y) || y.includes(x);
}

// ── Structured output plumbing (the verify.ts pattern) ──────────────────────

interface StructuredArgs<T> {
  ctx: CallContext;
  built: BuiltPrompt;
  schema: ReturnType<typeof jsonSchema<T>>;
  name: string;
  temperature: number | undefined;
  maxOutputTokens: number;
  normalize: (raw: unknown) => T | null;
}

/**
 * Structured output where the provider supports it, JSON parsed out of the
 * text otherwise, null when neither yields an object. Never throws except to
 * propagate an abort.
 */
async function generateStructured<T>(args: StructuredArgs<T>): Promise<T | null> {
  const { ctx, built } = args;
  try {
    const result = await generateText({
      model: ctx.model,
      output: Output.object({ schema: args.schema, name: args.name }),
      system: withSuffix(ctx, built.system),
      prompt: built.prompt,
      temperature: args.temperature,
      maxOutputTokens: args.maxOutputTokens,
      abortSignal: ctx.signal,
    });
    return args.normalize(result.output) ?? args.normalize(parseJsonObject(result.text));
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError' || ctx.signal?.aborted) throw err;
    // NoObjectGeneratedError carries the raw text — one more chance to read it.
    const text = (err as { text?: string })?.text;
    return args.normalize(parseJsonObject(text));
  }
}

/** The first balanced JSON object in free text, or null. */
export function parseJsonObject(text: string | undefined | null): unknown {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function normalizeAdjudication(raw: unknown): Adjudication | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.correct !== 'boolean') return null;
  return {
    correct: r.correct,
    normalized: typeof r.normalized === 'string' ? r.normalized.trim() : '',
    why: typeof r.why === 'string' ? r.why.trim() : '',
  };
}

export function normalizeReveal(raw: unknown): Reveal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.who !== 'string' || !r.who.trim()) return null;
  const misses = Array.isArray(r.misses)
    ? r.misses
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .map((m) => ({
          guess: typeof m.guess === 'string' ? m.guess.trim() : '',
          whyReasonable: typeof m.whyReasonable === 'string' ? m.whyReasonable.trim() : '',
        }))
        .filter((m) => m.guess)
    : [];
  return {
    who: r.who.trim(),
    whyItMatters: typeof r.whyItMatters === 'string' ? r.whyItMatters.trim() : '',
    misses,
    parting: typeof r.parting === 'string' ? r.parting.trim() : '',
  };
}
