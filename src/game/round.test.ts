import { describe, it, expect } from 'vitest';
import {
  ask,
  closeBrowser,
  durationSeconds,
  exchangesOf,
  giveUp,
  guess,
  isOver,
  keepPage,
  missesOf,
  openBrowser,
  receiveAnswer,
  receiveOpening,
  receiveVerdict,
  remainingMs,
  scoreOf,
  scoreBreakdown,
  speedBonusNow,
  startRound,
  tick,
  withdrawAsk,
  withdrawGuess,
  type RoundState,
} from './round';
import type { HiddenState } from './hidden';

const hidden: HiddenState = {
  entryId: 'cleopatra',
  name: 'Cleopatra VII',
  aliases: ['Cleopatra'],
  kind: 'person',
  provenance: 'unsourced',
  question: 'Who am I?',
};

const wrong = { correct: false, normalized: 'Nefertiti', why: 'Different queen.' };
const right = { correct: true, normalized: 'Cleopatra VII', why: 'That is the name.' };

/** A round with the opening line already delivered — the usual starting point. */
function open(): RoundState {
  return receiveOpening(
    startRound(hidden, { shelfId: 'mock', startedAt: '2026-09-05T09:00:00.000Z' }),
    'Sit.',
  );
}

describe('startRound / receiveOpening', () => {
  it('opens with ten points, ten questions, five minutes, and the figure already composing', () => {
    const s = startRound(hidden);
    expect(s).toMatchObject({
      points: 10,
      questionsLeft: 10,
      budgetMs: 300_000,
      elapsedMs: 0,
      composing: true,
      awaiting: 'opening',
      status: 'open',
      browserOpen: false,
    });
    // No clock while the opening line composes — no dead first second.
    expect(tick(s, 5000).elapsedMs).toBe(0);
    const o = receiveOpening(s, '  You took your time.  ');
    expect(o.openingLine).toBe('You took your time.');
    expect(o.composing).toBe(false);
  });

  it('takes a custom config', () => {
    const s = startRound(hidden, { points: 5, questions: 3, budgetMs: 60_000 });
    expect(s.points).toBe(5);
    expect(s.questionsLeft).toBe(3);
    expect(s.budgetMs).toBe(60_000);
  });
});

describe('questions', () => {
  it('are free: ten of them, no points spent', () => {
    let s = open();
    for (let i = 0; i < 10; i++) {
      s = receiveAnswer(ask(s, `q${i}`), `a${i}`);
    }
    expect(s.points).toBe(10);
    expect(s.questionsLeft).toBe(0);
    expect(s.turns).toHaveLength(10);
    // The eleventh is refused, unchanged state
    const eleventh = ask(s, 'one more');
    expect(eleventh).toBe(s);
  });

  it('refuses while composing, refuses blanks, and records the time asked', () => {
    let s = tick(open(), 12_000);
    s = ask(s, 'Where were you born?');
    expect(s.composing).toBe(true);
    expect(s.awaiting).toBe('answer');
    expect(s.turns[0]).toEqual({ question: 'Where were you born?', answer: null, atMs: 12_000 });
    expect(ask(s, 'and again?')).toBe(s);
    expect(guess(s, 'Cleopatra')).toBe(s);
    const fresh = open();
    expect(ask(fresh, '   ')).toBe(fresh);
  });

  it('receiveAnswer fills the turn; a stray answer is ignored', () => {
    const asked = ask(open(), 'q');
    const s = receiveAnswer(asked, ' a ');
    expect(s.turns[0]!.answer).toBe('a');
    expect(s.composing).toBe(false);
    expect(receiveAnswer(s, 'again')).toBe(s);
    expect(exchangesOf(s)).toEqual([{ question: 'q', answer: 'a' }]);
    expect(exchangesOf(asked)).toEqual([]);
  });

  it('withdrawAsk hands the question back uncharged when the model fails', () => {
    const s = withdrawAsk(ask(open(), 'q'));
    expect(s.turns).toEqual([]);
    expect(s.questionsLeft).toBe(10);
    expect(s.composing).toBe(false);
  });
});

describe('guesses', () => {
  it('a wrong guess costs one point', () => {
    const s = receiveVerdict(guess(open(), 'Nefertiti'), wrong);
    expect(s.points).toBe(9);
    expect(s.status).toBe('open');
    expect(s.guesses[0]).toMatchObject({
      text: 'Nefertiti',
      correct: false,
      normalized: 'Nefertiti',
    });
  });

  it('the right guess costs nothing: a first-try hit on the first second is a clean 100', () => {
    const s = receiveVerdict(guess(open(), 'Cleopatra'), right);
    expect(s.status).toBe('won');
    expect(scoreOf(s)).toBe(100);
    expect(scoreBreakdown(s)).toEqual({ accuracy: 50, speed: 50, total: 100 });
    expect(isOver(s)).toBe(true);
    expect(s.endedAtMs).toBe(0);
  });

  it('a right guess after misses scores what is left', () => {
    let s = open();
    s = receiveVerdict(guess(s, 'a'), wrong);
    s = receiveVerdict(guess(s, 'b'), wrong);
    s = receiveVerdict(guess(s, 'Cleopatra'), right);
    expect(scoreOf(s)).toBe(90);
    expect(scoreBreakdown(s)).toEqual({ accuracy: 40, speed: 50, total: 90 });
    expect(missesOf(s)).toEqual(['a', 'b']);
  });

  it('two roads to a score: time spent costs speed, misses cost accuracy, and they trade', () => {
    // Cautious: every second used, one clean guess — all accuracy, no speed
    let slow = tick(open(), 299_000);
    slow = receiveVerdict(guess(slow, 'Cleopatra'), right);
    expect(scoreBreakdown(slow)).toEqual({ accuracy: 50, speed: 0, total: 50 });
    // Bold: guessed at once, four misses on the way — all speed, accuracy bled
    let bold = open();
    for (const g of ['a', 'b', 'c', 'd']) bold = receiveVerdict(guess(bold, g), wrong);
    bold = receiveVerdict(guess(bold, 'Cleopatra'), right);
    expect(scoreBreakdown(bold)).toEqual({ accuracy: 30, speed: 50, total: 80 });
    // Middle: half the clock, one miss
    let mid = tick(open(), 150_000);
    mid = receiveVerdict(guess(mid, 'a'), wrong);
    mid = receiveVerdict(guess(mid, 'Cleopatra'), right);
    expect(scoreBreakdown(mid)).toEqual({ accuracy: 45, speed: 25, total: 70 });
    expect(speedBonusNow(tick(open(), 60_000))).toBe(40);
  });

  it('points floor at 0, and reaching 0 ends the round as lost with score 0', () => {
    let s = open();
    for (let i = 0; i < 9; i++) s = receiveVerdict(guess(s, `g${i}`), wrong);
    expect(s.points).toBe(1);
    expect(s.status).toBe('open');
    s = receiveVerdict(guess(s, 'g9'), wrong);
    expect(s.points).toBe(0);
    expect(s.status).toBe('lost');
    expect(scoreOf(s)).toBe(0);
    // Nothing more can happen
    expect(guess(s, 'x')).toBe(s);
    expect(ask(s, 'x')).toBe(s);
  });

  it('a guess is a wager, not a question: it does not spend a question', () => {
    const s = receiveVerdict(guess(open(), 'x'), wrong);
    expect(s.questionsLeft).toBe(10);
  });

  it('withdrawGuess hands the guess back uncharged', () => {
    const s = withdrawGuess(guess(open(), 'x'));
    expect(s.guesses).toEqual([]);
    expect(s.points).toBe(10);
  });
});

describe('the clock', () => {
  it('runs while the player thinks and pauses while the model composes', () => {
    let s = tick(open(), 10_000);
    expect(s.elapsedMs).toBe(10_000);
    s = ask(s, 'q');
    s = tick(s, 60_000); // latency — never charged
    expect(s.elapsedMs).toBe(10_000);
    s = receiveAnswer(s, 'a');
    s = tick(s, 5_000);
    expect(s.elapsedMs).toBe(15_000);
    s = guess(s, 'x');
    s = tick(s, 60_000);
    expect(s.elapsedMs).toBe(15_000);
    expect(remainingMs(s)).toBe(285_000);
  });

  it('does not pause while the browser is open — searching costs seconds', () => {
    let s = openBrowser(open());
    expect(s.browserOpen).toBe(true);
    s = tick(s, 30_000);
    expect(s.elapsedMs).toBe(30_000);
    s = closeBrowser(s);
    expect(s.browserOpen).toBe(false);
    expect(closeBrowser(s)).toBe(s);
  });

  it('ends the round at the budget: timeUp, score 0, browser closed', () => {
    let s = openBrowser(open());
    s = tick(s, 299_999);
    expect(s.status).toBe('open');
    s = tick(s, 5_000);
    expect(s.status).toBe('timeUp');
    expect(s.elapsedMs).toBe(300_000);
    expect(s.browserOpen).toBe(false);
    expect(scoreOf(s)).toBe(0);
    expect(durationSeconds(s)).toBe(300);
    expect(tick(s, 1000)).toBe(s);
    expect(openBrowser(s)).toBe(s);
  });

  it('ignores non-positive ticks', () => {
    const s = open();
    expect(tick(s, 0)).toBe(s);
    expect(tick(s, -5)).toBe(s);
  });
});

describe('giving up and keeping pages', () => {
  it('giveUp ends the round even mid-compose; a second giveUp is a no-op', () => {
    const s = giveUp(ask(open(), 'q'));
    expect(s.status).toBe('gaveUp');
    expect(s.composing).toBe(false);
    expect(scoreOf(s)).toBe(0);
    expect(giveUp(s)).toBe(s);
  });

  it('keepPage adds a page once, deliberately', () => {
    let s = keepPage(open(), { url: 'https://example.org/a', title: ' A ' });
    s = keepPage(s, { url: 'https://example.org/a' });
    s = keepPage(s, { url: '  ' });
    expect(s.keptPages).toEqual([{ url: 'https://example.org/a', title: 'A' }]);
  });
});
