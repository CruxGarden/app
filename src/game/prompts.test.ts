import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModel } from 'ai';
import {
  adjudicate,
  answer,
  answerRaw,
  buildAdjudicatePrompt,
  buildAnswerPrompt,
  buildOpeningPrompt,
  buildRevealPrompt,
  cleanLine,
  fallbackReveal,
  openingLine,
  parseJsonObject,
  reveal,
  MARKERS,
  type CallContext,
} from './prompts';
import { disclosureFor, voiceFor, type HiddenState } from './hidden';
import { getMockLanguageModel } from '@/ai/mock-model';

const zola: HiddenState = {
  entryId: 'emile-zola',
  name: 'Émile Zola',
  aliases: ['Zola'],
  kind: 'person',
  era: '1840–1902',
  voiceNote: 'righteous, tireless',
  provenance: 'unsourced',
  mostFamous: ["J'accuse", 'Germinal'],
  question: 'Who am I?',
};

const voyager: HiddenState = {
  entryId: 'voyager-1',
  name: 'Voyager 1',
  aliases: ['Voyager'],
  kind: 'object',
  provenance: 'sourced',
  sources: ['https://en.wikipedia.org/wiki/Voyager_1'],
  question: 'What am I?',
  voicePerson: 'I',
};

const transcript = [
  { question: 'Are you alive?', answer: 'I was. Less every year.' },
  { question: 'Did you write?', answer: 'Twenty volumes.' },
];

/** A model that answers every generate call with the same text, counting calls. */
function scripted(texts: string[]): { model: LanguageModel; calls: () => number } {
  let n = 0;
  const mock = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: texts[Math.min(n++, texts.length - 1)]! }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  return { model: mock as unknown as LanguageModel, calls: () => n };
}

const ctxOf = (model: LanguageModel): CallContext => ({ model });

describe('prompt builders', () => {
  const voice = voiceFor(zola);
  const rule = disclosureFor();

  it('restate the identity in every call — the model is told, never asked to remember', () => {
    const systems = [
      buildOpeningPrompt(zola, voice, rule).system,
      buildAnswerPrompt(zola, voice, rule, transcript, 'q').system,
      buildAdjudicatePrompt(zola, 'Hugo', transcript).system,
      buildRevealPrompt(zola, transcript, ['Hugo'], voice).system,
    ];
    for (const s of systems) {
      expect(s).toContain('Name: Émile Zola');
      expect(s).toContain('1840–1902');
    }
    expect(systems[0]).toContain(MARKERS.opening);
    expect(systems[1]).toContain(MARKERS.answer);
    expect(systems[2]).toContain(MARKERS.adjudicate);
    expect(systems[3]).toContain(MARKERS.reveal);
  });

  it('carry the disclosure rule, the voice and the game name into the voice calls', () => {
    for (const s of [
      buildOpeningPrompt(zola, voice, rule).system,
      buildAnswerPrompt(zola, voice, rule, transcript, 'q').system,
    ]) {
      expect(s).toContain('## What you may never say outright');
      expect(s).toContain('Never who you are: not your name (Émile Zola, Zola)');
      expect(s).toContain("Never name outright: J'accuse; Germinal");
      expect(s).toContain('Never state a false fact');
      expect(s).toContain('Refuse the way YOU would');
      expect(s).toContain('Temperament: righteous, tireless.');
      expect(s).toContain('enjoyable to read even if it tells the player nothing');
      expect(s).toContain('5Ws');
      expect(s).toContain('"Who am I?"');
    }
  });

  it('use the shelf question wording for objects and places', () => {
    const s = buildAnswerPrompt(voyager, voiceFor(voyager), rule, [], 'q').system;
    expect(s).toContain('## What you are');
    expect(s).toContain('Never what you are: not your name (Voyager 1, Voyager)');
    expect(s).toContain('"What am I?"');
    expect(s).toContain('Never name outright the single most famous work');
    expect(s).toContain('checked against: https://en.wikipedia.org/wiki/Voyager_1');
    expect(
      buildOpeningPrompt({ ...voyager, kind: 'place' }, voiceFor(voyager), rule).system,
    ).toContain('Never where you are');
  });

  it('the answer prompt carries the transcript and this question; the rule can be narrowed', () => {
    const built = buildAnswerPrompt(zola, voice, rule, transcript, 'Where were you born?');
    expect(built.prompt).toContain('Q1. Player: Are you alive?\nYou (I): I was. Less every year.');
    expect(built.prompt).toContain('## The player now asks\n\nWhere were you born?');
    const loose = buildAnswerPrompt(
      zola,
      voice,
      disclosureFor({ neverMostFamous: false, extraForbidden: ['Médan'] }),
      [],
      'q',
    ).system;
    expect(loose).not.toContain("Never name outright: J'accuse");
    expect(loose).toContain('Also never say: Médan');
  });

  it('adjudicate receives the ground truth, the accepted forms and the guess', () => {
    const built = buildAdjudicatePrompt(zola, 'Victor Hugo', transcript);
    expect(built.system).toContain('## Ground truth\nName: Émile Zola');
    expect(built.system).toContain('Accepted forms: Émile Zola; Zola');
    expect(built.system).toContain('Reject a different person');
    expect(built.prompt).toContain('## The guess\n\nVictor Hugo');
    expect(built.prompt).toContain('Q1. Are you alive?');
  });

  it('reveal receives the transcript and every miss, and asks for "This was …"', () => {
    const built = buildRevealPrompt(zola, transcript, ['Hugo', 'Balzac'], voice);
    expect(built.system).toContain('"This was …"');
    expect(built.system).toContain('The misses are the curriculum');
    expect(built.prompt).toContain('- Hugo\n- Balzac');
  });
});

describe('callers', () => {
  it('openingLine and answerRaw return the model text, cleaned', async () => {
    const { model } = scripted(['"You took your time."']);
    const ctx = ctxOf(model);
    await expect(openingLine(ctx, zola, voiceFor(zola), disclosureFor())).resolves.toBe(
      'You took your time.',
    );
    await expect(answerRaw(ctx, zola, voiceFor(zola), disclosureFor(), [], 'q')).resolves.toBe(
      'You took your time.',
    );
    expect(cleanLine('*sighs* Fine.')).toBe('Fine.');
  });

  it('answer retries once on a leaked name and redacts a second leak (diacritics included)', async () => {
    const { model, calls } = scripted(['I am Emile Zola, obviously.', 'Call me Zola.']);
    const out = await answer(ctxOf(model), zola, voiceFor(zola), disclosureFor(), [], 'q');
    expect(calls()).toBe(2);
    expect(out).toBe('Call me —.');
    const clean = scripted(['I am nobody you would know.']);
    await expect(
      answer(ctxOf(clean.model), zola, voiceFor(zola), disclosureFor(), [], 'q'),
    ).resolves.toBe('I am nobody you would know.');
    expect(clean.calls()).toBe(1);
  });

  it('the opening line redacts a leaked name rather than start the round over', async () => {
    const { model } = scripted(['Émile Zola, at your service.']);
    await expect(openingLine(ctxOf(model), zola, voiceFor(zola), disclosureFor())).resolves.toBe(
      '—, at your service.',
    );
  });

  it('adjudicate: an exact hit on the name or an alias never calls the model', async () => {
    const { model, calls } = scripted(['{"correct": false, "normalized": "x", "why": "no"}']);
    await expect(adjudicate(ctxOf(model), zola, 'emile zola', [])).resolves.toEqual({
      correct: true,
      normalized: 'Émile Zola',
      why: 'That is the name.',
    });
    await expect(adjudicate(ctxOf(model), zola, 'ZOLA', [])).resolves.toMatchObject({
      correct: true,
    });
    expect(calls()).toBe(0);
  });

  it('adjudicate: anything else goes to the model, structured or JSON-in-text', async () => {
    const { model, calls } = scripted([
      'Here is my verdict: {"correct": false, "normalized": "Victor Hugo", "why": "Different novelist."} done',
    ]);
    await expect(adjudicate(ctxOf(model), zola, 'Hugo', transcript)).resolves.toEqual({
      correct: false,
      normalized: 'Victor Hugo',
      why: 'Different novelist.',
    });
    expect(calls()).toBe(1);
  });

  it('adjudicate throws when no verdict can be read, so the guess can be handed back', async () => {
    const { model } = scripted(['I could not say.']);
    await expect(adjudicate(ctxOf(model), zola, 'Hugo', [])).rejects.toThrow(/could not be judged/);
  });

  it('reveal completes the misses in the player order and falls back to the shelf facts', async () => {
    const good = scripted([
      JSON.stringify({
        who: 'This was Émile Zola.',
        whyItMatters: 'Naturalism.',
        misses: [{ guess: 'balzac', whyReasonable: 'Same shape.' }],
        parting: 'Read.',
      }),
    ]);
    const r = await reveal(
      ctxOf(good.model),
      zola,
      transcript,
      [
        { text: 'Hugo', correct: false },
        { text: 'Balzac', correct: false },
        { text: 'Zola', correct: true },
      ],
      voiceFor(zola),
    );
    expect(r.who).toBe('This was Émile Zola.');
    expect(r.misses).toEqual([
      { guess: 'Hugo', whyReasonable: 'A fair thing to think.' },
      { guess: 'Balzac', whyReasonable: 'Same shape.' },
    ]);

    const bad = scripted(['no json here']);
    const fb = await reveal(
      ctxOf(bad.model),
      zola,
      transcript,
      [{ text: 'Hugo', correct: false }],
      voiceFor(zola),
    );
    expect(fb).toEqual(fallbackReveal(zola, ['Hugo']));
    expect(fb.who).toBe('This was Émile Zola (1840–1902).');
    expect(fb.whyItMatters).toContain("J'accuse");
  });

  it('parseJsonObject finds the first balanced object and ignores braces inside strings', () => {
    expect(parseJsonObject('x {"a": "}", "b": {"c": 1}} y')).toEqual({ a: '}', b: { c: 1 } });
    expect(parseJsonObject('nothing')).toBeNull();
    expect(parseJsonObject('{broken')).toBeNull();
  });

  it('the e2e mock model plays every call without a name', async () => {
    const ctx = ctxOf(getMockLanguageModel());
    const voice = voiceFor(zola);
    const rule = disclosureFor();
    const opening = await openingLine(ctx, zola, voice, rule);
    expect(opening.length).toBeGreaterThan(0);
    const a = await answer(ctx, zola, voice, rule, [], "What's your name?");
    expect(a.toLowerCase()).not.toContain('zola');
    const v = await adjudicate(ctx, zola, 'Hugo', [{ question: "What's your name?", answer: a }]);
    expect(v.correct).toBe(false);
    const r = await reveal(ctx, zola, [], [{ text: 'Hugo', correct: false }], voice);
    expect(r.who).toBe('This was Émile Zola.');
    expect(r.misses).toEqual([{ guess: 'Hugo', whyReasonable: expect.any(String) }]);
  });
});
