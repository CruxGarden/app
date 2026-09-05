/**
 * The conversation is the artifact. A finished round becomes a markdown page
 * — frontmatter for the facts, a body a template can style: `**You:**`
 * marks the player's questions (sans, the interface); a plain paragraph is
 * the voice (serif). `## Guesses` and `## Reveal` follow.
 *
 * `renderTranscriptMarkdown` and `parseTranscriptMarkdown` round-trip. The
 * frontmatter is a YAML subset written by hand (no dependency): scalars are
 * JSON-quoted strings, numbers, booleans; nested maps and lists of maps are
 * indented two spaces. Astro's frontmatter parser reads it as ordinary YAML.
 */

import type { HiddenKind, Reveal } from './hidden';
import { durationSeconds, exchangesOf, scoreOf, type KeptPage, type RoundState } from './round';
import type { Exchange } from './hidden';

export type TranscriptOutcome = 'won' | 'lost' | 'gaveUp' | 'timeUp';

export interface TranscriptGuess {
  text: string;
  correct: boolean;
}

export interface TranscriptEntry {
  /** The name — said only after the round ends, so this is always safe to publish. */
  name: string;
  kind: HiddenKind;
  era?: string;
}

export interface RoundTranscript {
  title: string;
  /** ISO timestamp the round opened. */
  date: string;
  /** The Shelf's id. */
  shelf: string;
  /** The Shelf's question — "Who am I?", "What am I?", … */
  question: string;
  entry: TranscriptEntry;
  score: number;
  outcome: TranscriptOutcome;
  /** Questions asked. */
  questions: number;
  guesses: TranscriptGuess[];
  durationSeconds: number;
  keptPages: KeptPage[];
  openingLine: string;
  exchanges: Exchange[];
  reveal: Reveal | null;
}

/** Build the transcript from a finished round. */
export function transcriptOf(
  state: RoundState,
  reveal: Reveal | null,
  opts: { title?: string } = {},
): RoundTranscript {
  const outcome: TranscriptOutcome = state.status === 'open' ? 'gaveUp' : state.status;
  return {
    title: opts.title ?? defaultTitle(state),
    date: state.startedAt,
    shelf: state.shelfId,
    question: state.entry.question,
    entry: {
      name: state.entry.name,
      kind: state.entry.kind,
      ...(state.entry.era ? { era: state.entry.era } : {}),
    },
    score: scoreOf(state),
    outcome,
    questions: state.turns.length,
    guesses: state.guesses
      .filter((g) => g.correct !== null)
      .map((g) => ({ text: g.text, correct: g.correct === true })),
    durationSeconds: durationSeconds(state),
    keptPages: state.keptPages.map((p) => ({ ...p })),
    openingLine: state.openingLine ?? '',
    exchanges: exchangesOf(state),
    reveal,
  };
}

function defaultTitle(state: RoundState): string {
  const day = state.startedAt.slice(0, 10);
  return `${state.entry.question.replace(/\?$/, '')} — ${day}`;
}

/** `rounds/2026-09-05-1.md` — the day and the round's number that day. */
export function transcriptFilename(date: string, n: number): string {
  return `rounds/${date.slice(0, 10)}-${n}.md`;
}

// ── Render ──────────────────────────────────────────────────────────────────

export const YOU_MARK = '**You:**';

export function renderTranscriptMarkdown(round: RoundTranscript): string {
  const fm: string[] = ['---'];
  fm.push(`title: ${scalar(round.title)}`);
  fm.push(`date: ${scalar(round.date)}`);
  fm.push(`shelf: ${scalar(round.shelf)}`);
  fm.push(`question: ${scalar(round.question)}`);
  fm.push('entry:');
  fm.push(`  name: ${scalar(round.entry.name)}`);
  fm.push(`  kind: ${scalar(round.entry.kind)}`);
  if (round.entry.era) fm.push(`  era: ${scalar(round.entry.era)}`);
  fm.push(`score: ${round.score}`);
  fm.push(`outcome: ${scalar(round.outcome)}`);
  fm.push(`questions: ${round.questions}`);
  if (round.guesses.length === 0) fm.push('guesses: []');
  else {
    fm.push('guesses:');
    for (const g of round.guesses) {
      fm.push(`  - text: ${scalar(g.text)}`);
      fm.push(`    correct: ${g.correct}`);
    }
  }
  fm.push(`durationSeconds: ${round.durationSeconds}`);
  if (round.keptPages.length === 0) fm.push('keptPages: []');
  else {
    fm.push('keptPages:');
    for (const p of round.keptPages) {
      fm.push(`  - url: ${scalar(p.url)}`);
      if (p.title) fm.push(`    title: ${scalar(p.title)}`);
    }
  }
  fm.push('---');

  const body: string[] = [];
  body.push(para(round.openingLine));
  for (const x of round.exchanges) {
    body.push(`${YOU_MARK} ${inline(x.question)}`);
    body.push(para(x.answer));
  }
  if (round.guesses.length > 0) {
    body.push('## Guesses');
    body.push(
      round.guesses
        .map((g) => `- ${g.text.replace(/\n+/g, ' ')} — ${g.correct ? 'that was it' : 'not it'}`)
        .join('\n'),
    );
  }
  if (round.reveal) {
    const r = round.reveal;
    body.push('## Reveal');
    body.push('### This was');
    body.push(para(r.who));
    body.push('### Why it matters');
    body.push(para(r.whyItMatters));
    body.push('### The misses');
    body.push(
      r.misses.length
        ? r.misses
            .map(
              (m) =>
                `- **${m.guess.replace(/\n+/g, ' ')}** — ${m.whyReasonable.replace(/\n+/g, ' ')}`,
            )
            .join('\n')
        : '_No wrong guesses._',
    );
    body.push('### Parting');
    body.push(para(r.parting));
  }
  return `${fm.join('\n')}\n\n${body.join('\n\n')}\n`;
}

/** A voice paragraph: no blank lines inside (they would split it), no leading heading/list marker. */
function para(text: string): string {
  const t = inline(text);
  if (!t) return '_—_';
  return /^(#|-\s|\*\*You:\*\*)/.test(t) ? `\\${t}` : t;
}

/** A question: the `**You:**` prefix already keeps it from reading as a heading or list. */
function inline(text: string): string {
  return text.trim().replace(/\n{2,}/g, '\n');
}

function scalar(v: string | number | boolean): string {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

// ── Parse ───────────────────────────────────────────────────────────────────

export class TranscriptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptParseError';
  }
}

export function parseTranscriptMarkdown(md: string): RoundTranscript {
  const text = md.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new TranscriptParseError('no frontmatter');
  const fm = parseYamlSubset(m[1]!);
  const body = m[2] ?? '';

  const entry = asRecord(fm.entry);
  const outcome = str(fm.outcome);
  if (!['won', 'lost', 'gaveUp', 'timeUp'].includes(outcome)) {
    throw new TranscriptParseError(`bad outcome "${outcome}"`);
  }

  const { openingLine, exchanges, guessesSection, revealSection } = splitBody(body);
  void guessesSection; // frontmatter is authoritative for guesses

  return {
    title: str(fm.title),
    date: str(fm.date),
    shelf: str(fm.shelf),
    question: str(fm.question),
    entry: {
      name: str(entry.name),
      kind: str(entry.kind) as HiddenKind,
      ...(entry.era ? { era: str(entry.era) } : {}),
    },
    score: num(fm.score),
    outcome: outcome as TranscriptOutcome,
    questions: num(fm.questions),
    guesses: list(fm.guesses).map((g) => {
      const r = asRecord(g);
      return { text: str(r.text), correct: r.correct === true };
    }),
    durationSeconds: num(fm.durationSeconds),
    keptPages: list(fm.keptPages).map((p) => {
      const r = asRecord(p);
      return { url: str(r.url), ...(r.title ? { title: str(r.title) } : {}) };
    }),
    openingLine,
    exchanges,
    reveal: revealSection ? parseReveal(revealSection) : null,
  };
}

function splitBody(body: string): {
  openingLine: string;
  exchanges: Exchange[];
  guessesSection: string | null;
  revealSection: string | null;
} {
  // Top-level sections split on "\n## "
  const parts = `\n${body.trim()}`.split(/\n## /);
  const conversation = (parts[0] ?? '').trim();
  let guessesSection: string | null = null;
  let revealSection: string | null = null;
  for (const p of parts.slice(1)) {
    if (p.startsWith('Guesses')) guessesSection = p.slice('Guesses'.length).trim();
    else if (p.startsWith('Reveal')) revealSection = p.slice('Reveal'.length).trim();
  }

  const paras = conversation
    .split(/\n\s*\n/)
    .map((p) => unescapePara(p.trim()))
    .filter(Boolean);
  const openingLine = paras[0] === '—' ? '' : (paras[0] ?? '');
  const exchanges: Exchange[] = [];
  let i = 1;
  while (i < paras.length) {
    const p = paras[i]!;
    if (!p.startsWith(YOU_MARK)) {
      // A stray voice paragraph: attach to the previous answer.
      const last = exchanges[exchanges.length - 1];
      if (last) last.answer = `${last.answer}\n${p}`.trim();
      i++;
      continue;
    }
    const question = p.slice(YOU_MARK.length).trim();
    const answers: string[] = [];
    i++;
    while (i < paras.length && !paras[i]!.startsWith(YOU_MARK)) {
      answers.push(paras[i]!);
      i++;
    }
    exchanges.push({ question, answer: answers.join('\n') });
  }
  return { openingLine, exchanges, guessesSection, revealSection };
}

function unescapePara(p: string): string {
  if (p === '_—_') return '—';
  return p.startsWith('\\') ? p.slice(1) : p;
}

function parseReveal(section: string): Reveal {
  const subs = `\n${section}`.split(/\n### /).slice(1);
  const get = (title: string): string => {
    const s = subs.find((x) => x.startsWith(title));
    if (!s) return '';
    const v = unescapePara(s.slice(title.length).trim());
    return v === '—' ? '' : v;
  };
  const missesRaw = get('The misses');
  const misses =
    missesRaw === '_No wrong guesses._'
      ? []
      : missesRaw
          .split('\n')
          .map((l) => /^- \*\*(.+?)\*\* — (.*)$/.exec(l))
          .filter((x): x is RegExpExecArray => !!x)
          .map((x) => ({ guess: x[1]!, whyReasonable: x[2]! }));
  return {
    who: get('This was'),
    whyItMatters: get('Why it matters'),
    misses,
    parting: get('Parting'),
  };
}

// ── YAML subset ─────────────────────────────────────────────────────────────

type Yaml = string | number | boolean | null | Yaml[] | { [k: string]: Yaml };

/**
 * Parse the subset `renderTranscriptMarkdown` writes: `key: scalar`, `key:`
 * followed by an indented map, `key:` followed by `- ` items (scalars or maps
 * whose first field is on the dash line), `[]`, JSON-quoted strings, numbers,
 * booleans, null. Enough for frontmatter written here or by hand in the same
 * shape; not a YAML parser.
 */
export function parseYamlSubset(src: string): Record<string, Yaml> {
  const lines = src.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  let pos = 0;

  const indentOf = (l: string) => l.length - l.trimStart().length;

  function parseMap(indent: number): Record<string, Yaml> {
    const out: Record<string, Yaml> = {};
    while (pos < lines.length) {
      const line = lines[pos]!;
      const ind = indentOf(line);
      if (ind < indent) break;
      if (ind > indent) throw new TranscriptParseError(`unexpected indent at "${line.trim()}"`);
      const t = line.trim();
      if (t.startsWith('- ')) break;
      const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(t);
      if (!kv) throw new TranscriptParseError(`bad line "${t}"`);
      const key = kv[1]!;
      const rest = kv[2]?.trim();
      pos++;
      if (rest !== undefined && rest !== '') {
        out[key] = parseScalar(rest);
        continue;
      }
      // Block value: a nested map or a list
      const next = lines[pos];
      if (!next) {
        out[key] = null;
        continue;
      }
      const nInd = indentOf(next);
      if (next.trim().startsWith('- ') && nInd >= indent) out[key] = parseList(nInd);
      else if (nInd > indent) out[key] = parseMap(nInd);
      else out[key] = null;
    }
    return out;
  }

  function parseList(indent: number): Yaml[] {
    const out: Yaml[] = [];
    while (pos < lines.length) {
      const line = lines[pos]!;
      const ind = indentOf(line);
      const t = line.trim();
      if (ind !== indent || !t.startsWith('- ')) break;
      const item = t.slice(2).trim();
      pos++;
      const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(item);
      if (kv) {
        // A map item: first field on the dash line, the rest indented by two more
        const map: Record<string, Yaml> = {};
        map[kv[1]!] = kv[2] !== undefined && kv[2].trim() !== '' ? parseScalar(kv[2].trim()) : null;
        const rest = parseMap(indent + 2);
        out.push({ ...map, ...rest });
      } else {
        out.push(parseScalar(item));
      }
    }
    return out;
  }

  function parseScalar(s: string): Yaml {
    if (s === '[]') return [];
    if (s === '{}') return {};
    if (s === 'null' || s === '~') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (s.startsWith('"')) {
      try {
        return JSON.parse(s) as string;
      } catch {
        throw new TranscriptParseError(`bad string ${s}`);
      }
    }
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
    return s;
  }

  const result = parseMap(indentOf(lines[0] ?? ''));
  if (pos < lines.length)
    throw new TranscriptParseError(`trailing content "${lines[pos]!.trim()}"`);
  return result;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0;
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
