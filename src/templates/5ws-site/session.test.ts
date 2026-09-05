import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModel } from 'ai';
import { RoundSession, messageOf } from './src/lib/session';
import { getMockLanguageModel, FIVE_WS_OPENING, fiveWsLineFor } from '@/ai/mock-model';
import type { HiddenState } from '@/game/hidden';

/**
 * The driver over the pure reducers: the voice is composing when the session
 * opens, the clock is paused while composing and runs otherwise, wrong guesses
 * cost a point, the right one wins and the reveal follows, and a failing model
 * hands the move back uncharged with a retry.
 */
const hidden: HiddenState = {
  entryId: 'hypatia',
  name: 'Hypatia',
  aliases: ['Hypatia of Alexandria'],
  kind: 'person',
  era: 'c. 355–415',
  provenance: 'unsourced',
  question: 'Who am I?',
};

/** A hand-driven clock and interval so tests never wait. */
function harness(model: LanguageModel = getMockLanguageModel()) {
  let t = 1_000_000;
  let fn: (() => void) | null = null;
  const session = new RoundSession({
    entry: hidden,
    shelfId: 'history',
    model,
    now: () => t,
    setInterval: (f) => {
      fn = f;
      return 1;
    },
    clearInterval: () => {
      fn = null;
    },
  });
  const advance = (ms: number) => {
    t += ms;
    fn?.();
  };
  return { session, advance, clockStopped: () => fn === null };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const until = async (pred: () => boolean, tries = 50) => {
  for (let i = 0; i < tries && !pred(); i++) await settle();
  expect(pred()).toBe(true);
};

describe('RoundSession', () => {
  it('opens composing; the opening line arrives and the clock runs only after it', async () => {
    const { session, advance } = harness();
    session.start();
    expect(session.get().state.composing).toBe(true);
    advance(2000); // latency is never charged
    expect(session.get().state.elapsedMs).toBe(0);
    await until(() => session.get().state.openingLine !== null);
    expect(session.get().state.openingLine).toBe(FIVE_WS_OPENING);
    advance(1000);
    expect(session.get().state.elapsedMs).toBe(1000);
  });

  it('asks (free), pauses the clock while composing, and the voice answers in script', async () => {
    const { session, advance } = harness();
    session.start();
    await until(() => !session.get().state.composing);
    advance(500);
    session.ask('Were you a ruler?');
    expect(session.get().state.questionsLeft).toBe(9);
    expect(session.get().state.composing).toBe(true);
    advance(3000);
    expect(session.get().state.elapsedMs).toBe(500);
    await until(() => session.get().state.turns[0]?.answer !== null);
    expect(session.get().state.turns[0]!.answer).toBe(fiveWsLineFor('Were you a ruler?'));
    expect(session.get().state.points).toBe(10);
  });

  it('a wrong guess costs a point with the verdict’s reason; the right one wins and reveals the misses', async () => {
    const { session, advance, clockStopped } = harness();
    session.start();
    await until(() => !session.get().state.composing);
    session.guess('Cleopatra');
    await until(() => session.get().state.guesses[0]?.correct !== null);
    expect(session.get().state.points).toBe(9);
    expect(session.get().state.guesses[0]!.why).toMatch(/Not this one/);
    advance(250);
    session.guess('hypatia of alexandria'); // an alias, any case — no model needed
    await until(() => session.get().phase === 'done');
    const snap = session.get();
    expect(snap.state.status).toBe('won');
    expect(snap.state.points).toBe(9);
    expect(clockStopped()).toBe(true);
    expect(snap.reveal?.who).toBe('This was Hypatia.');
    expect(snap.reveal?.misses.map((m) => m.guess)).toEqual(['Cleopatra']);
  });

  it('time up ends the round from the clock alone; give up is allowed mid-compose', async () => {
    const a = harness();
    a.session.start();
    await until(() => !a.session.get().state.composing);
    a.advance(300_000);
    await until(() => a.session.get().phase === 'done');
    expect(a.session.get().state.status).toBe('timeUp');

    const b = harness();
    b.session.start();
    b.session.giveUp(); // the opening is still composing
    await until(() => b.session.get().phase === 'done');
    expect(b.session.get().state.status).toBe('gaveUp');
    expect(b.session.get().reveal?.misses).toEqual([]);
  });

  it('a failing model hands the question back uncharged, with a sentence and a retry', async () => {
    let fail = true;
    const flaky = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        if (fail) throw new Error('boom: provider down\nstack…');
        return (getMockLanguageModel() as MockLanguageModelV4).doGenerate(opts);
      },
    });
    const { session } = harness(flaky);
    session.start();
    await until(() => !session.get().state.composing); // opening failed → blank line, clock runs
    expect(session.get().state.openingLine).toBe('');
    expect(session.get().error).toBe('boom: provider down.');
    session.ask('Are you alive?');
    await until(() => session.get().error !== null);
    expect(session.get().state.questionsLeft).toBe(10);
    expect(session.get().state.turns).toEqual([]);
    expect(session.get().error).toBe('boom: provider down.');
    expect(session.get().retry).toEqual({ kind: 'ask', text: 'Are you alive?' });
    fail = false;
    session.retry();
    await until(() => session.get().state.turns[0]?.answer != null);
    expect(session.get().error).toBeNull();
    expect(session.get().state.questionsLeft).toBe(9);
  });

  it('dispose stops the clock and drops late results', async () => {
    const { session, advance, clockStopped } = harness();
    session.start();
    session.dispose();
    expect(clockStopped()).toBe(true);
    await settle();
    await settle();
    expect(session.get().state.openingLine).toBeNull();
    advance(1000);
    expect(session.get().state.elapsedMs).toBe(0);
  });
});

describe('messageOf', () => {
  it('keeps the first line, ends it with a stop, and has a default', () => {
    expect(messageOf(new Error('401 Unauthorized\nat …'))).toBe('401 Unauthorized.');
    expect(messageOf(new Error('Nope!'))).toBe('Nope!');
    expect(messageOf(null)).toBe('The model did not answer.');
  });
});
