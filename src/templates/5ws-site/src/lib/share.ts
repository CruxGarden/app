/**
 * The share block — Wordle's engine. A few lines with no spoiler in them:
 * the game and the day, the score and the time, one glyph per guess in
 * order, and the way in. Never the name.
 *
 *   5Ws · Who am I? · 2026-09-05
 *   8/10 in 3:12   ✗ ✗ ✓
 *   https://…/play/
 */

export type ShareStatus = 'won' | 'lost' | 'gaveUp' | 'timeUp';

export interface ShareInput {
  /** The game's name — the site's, not the shelf's. */
  name: string;
  /** The shelf's question. */
  question: string;
  /** The UTC day of a daily round; null for practice. */
  day: string | null;
  status: ShareStatus;
  /** Points left on a win (the score). */
  score: number;
  /** Points the round started with. */
  total: number;
  seconds: number;
  /** Every settled guess, in order. */
  guesses: readonly { correct: boolean | null }[];
  /** The page to play at. */
  url: string;
}

export const GLYPH = { right: '✓', wrong: '✗', stopped: '—' } as const;

/** One glyph per guess; a round that stopped short (gave up, time up) ends in a dash. */
export function shareGlyphs(
  guesses: readonly { correct: boolean | null }[],
  status: ShareStatus,
): string {
  const marks: string[] = guesses
    .filter((g) => g.correct !== null)
    .map((g) => (g.correct ? GLYPH.right : GLYPH.wrong));
  if (status === 'gaveUp' || status === 'timeUp') marks.push(GLYPH.stopped);
  return marks.join(' ');
}

/** m:ss, floor — the whole seconds the round took. */
export function shareClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function shareResult(input: ShareInput): string {
  const head = `${input.name} · ${input.question} · ${input.day ?? 'Practice'}`;
  const score = input.status === 'won' ? String(input.score) : 'X';
  const line = `${score}/${input.total} in ${shareClock(input.seconds)}   ${shareGlyphs(input.guesses, input.status)}`;
  return `${head}\n${line}\n${input.url}`;
}
