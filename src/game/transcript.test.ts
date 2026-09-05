import { describe, it, expect } from 'vitest';
import {
  parseTranscriptMarkdown,
  parseYamlSubset,
  renderTranscriptMarkdown,
  transcriptFilename,
  transcriptOf,
  type RoundTranscript,
} from './transcript';
import {
  ask,
  guess,
  keepPage,
  receiveAnswer,
  receiveOpening,
  receiveVerdict,
  startRound,
  tick,
} from './round';
import type { HiddenState, Reveal } from './hidden';

const hidden: HiddenState = {
  entryId: 'emile-zola',
  name: 'Émile Zola',
  aliases: ['Zola'],
  kind: 'person',
  era: '1840–1902',
  provenance: 'unsourced',
  question: 'Who am I?',
};

const reveal: Reveal = {
  who: 'This was Émile Zola (1840–1902), the novelist who put a whole country on trial.',
  whyItMatters: 'Naturalism, twenty novels, and one open letter: "J\'accuse…!"',
  misses: [
    { guess: 'Victor Hugo', whyReasonable: 'Same century, same appetite for the poor.' },
    { guess: 'Balzac', whyReasonable: 'A cycle of novels about a society — the shape fits.' },
  ],
  parting: 'Go and read something.',
};

function playedRound() {
  let s = receiveOpening(
    startRound(hidden, { shelfId: 'history', startedAt: '2026-09-05T09:00:00.000Z' }),
    'You took your time.',
  );
  s = tick(s, 4_000);
  s = receiveAnswer(ask(s, 'Are you alive?'), 'I was. Less every year — and yet here we are.');
  s = tick(s, 30_000);
  s = receiveVerdict(guess(s, 'Victor Hugo'), {
    correct: false,
    normalized: 'Victor Hugo',
    why: 'No.',
  });
  s = receiveAnswer(
    ask(s, 'Did you write?\nA lot?'),
    'Twenty volumes.\nSome of them are even good.',
  );
  s = keepPage(s, {
    url: 'https://en.wikipedia.org/wiki/Naturalism_(literature)',
    title: 'Naturalism',
  });
  s = receiveVerdict(guess(s, 'Balzac'), {
    correct: false,
    normalized: 'Honoré de Balzac',
    why: 'No.',
  });
  s = tick(s, 20_500);
  s = receiveVerdict(guess(s, 'zola'), { correct: true, normalized: 'Émile Zola', why: 'Yes.' });
  return s;
}

describe('transcriptOf', () => {
  it('captures the facts of a finished round', () => {
    const t = transcriptOf(playedRound(), reveal);
    expect(t).toMatchObject({
      title: 'Who am I — 2026-09-05',
      date: '2026-09-05T09:00:00.000Z',
      shelf: 'history',
      question: 'Who am I?',
      entry: { name: 'Émile Zola', kind: 'person', era: '1840–1902' },
      score: 81, // 40 accuracy (two misses) + 41 speed (54.5 s of 300 used)
      outcome: 'won',
      questions: 2,
      durationSeconds: 55,
      keptPages: [
        { url: 'https://en.wikipedia.org/wiki/Naturalism_(literature)', title: 'Naturalism' },
      ],
      openingLine: 'You took your time.',
    });
    expect(t.guesses).toEqual([
      { text: 'Victor Hugo', correct: false },
      { text: 'Balzac', correct: false },
      { text: 'zola', correct: true },
    ]);
    expect(t.exchanges).toHaveLength(2);
  });

  it('names the file by day and number', () => {
    expect(transcriptFilename('2026-09-05T09:00:00.000Z', 2)).toBe('rounds/2026-09-05-2.md');
  });
});

describe('renderTranscriptMarkdown / parseTranscriptMarkdown', () => {
  it('round-trips a full round with a reveal and kept pages', () => {
    const t = transcriptOf(playedRound(), reveal);
    const md = renderTranscriptMarkdown(t);
    expect(md.startsWith('---\ntitle: "Who am I — 2026-09-05"\n')).toBe(true);
    expect(md).toContain('question: "Who am I?"');
    expect(md).toContain('**You:** Are you alive?');
    expect(md).toContain('\n## Reveal\n\n### This was\n');
    expect(parseTranscriptMarkdown(md)).toEqual(t);
  });

  it('round-trips a round with no guesses, no kept pages and no reveal', () => {
    const s = receiveOpening(
      startRound(hidden, { shelfId: 'h', startedAt: '2026-09-05T09:00:00.000Z' }),
      'Sit.',
    );
    const t = transcriptOf({ ...s, status: 'gaveUp', endedAtMs: 12_000 }, null);
    const md = renderTranscriptMarkdown(t);
    expect(md).toContain('guesses: []');
    expect(md).toContain('keptPages: []');
    expect(md).not.toContain('## Guesses');
    expect(parseTranscriptMarkdown(md)).toEqual(t);
  });

  it('survives awkward text: quotes, colons, hashes, a question that looks like a heading', () => {
    const t: RoundTranscript = {
      title: 'A "quoted": title #1',
      date: '2026-09-05T09:00:00.000Z',
      shelf: 'x',
      question: 'What am I?',
      entry: { name: 'Voyager 1', kind: 'object' },
      score: 0,
      outcome: 'timeUp',
      questions: 2,
      guesses: [{ text: 'Sputnik — "the first"', correct: false }],
      durationSeconds: 300,
      keptPages: [],
      openingLine: '# Not a heading',
      exchanges: [
        { question: '- are you a list?', answer: 'I am **not** a list.' },
        { question: '**You:** nested?', answer: 'No.' },
      ],
      reveal: { who: 'This was Voyager 1.', whyItMatters: '', misses: [], parting: '' },
    };
    const md = renderTranscriptMarkdown(t);
    expect(parseTranscriptMarkdown(md)).toEqual(t);
  });

  it('reads frontmatter written by hand in the same shape', () => {
    const md = [
      '---',
      'title: "Hand written"',
      'date: "2026-09-05T09:00:00.000Z"',
      'shelf: "history"',
      'question: "Who am I?"',
      'entry:',
      '  name: "Ada Lovelace"',
      '  kind: "person"',
      'score: 7',
      'outcome: "won"',
      'questions: 3',
      'guesses:',
      '  - text: "Babbage"',
      '    correct: false',
      '  - text: "Ada"',
      '    correct: true',
      'durationSeconds: 90',
      'keptPages: []',
      '---',
      '',
      'You again.',
      '',
      '**You:** Are you a mathematician?',
      '',
      'Among other inconveniences.',
      '',
    ].join('\n');
    const t = parseTranscriptMarkdown(md);
    expect(t.entry).toEqual({ name: 'Ada Lovelace', kind: 'person' });
    expect(t.guesses).toEqual([
      { text: 'Babbage', correct: false },
      { text: 'Ada', correct: true },
    ]);
    expect(t.exchanges).toEqual([
      { question: 'Are you a mathematician?', answer: 'Among other inconveniences.' },
    ]);
    expect(t.reveal).toBeNull();
  });

  it('rejects text without frontmatter or with an unknown outcome', () => {
    expect(() => parseTranscriptMarkdown('no frontmatter')).toThrow(/no frontmatter/);
    expect(() => parseTranscriptMarkdown('---\ntitle: "x"\noutcome: "maybe"\n---\n')).toThrow(
      /bad outcome/,
    );
  });
});

describe('parseYamlSubset', () => {
  it('parses scalars, nested maps and lists of maps', () => {
    expect(
      parseYamlSubset(
        [
          'a: 1',
          'b: "two"',
          'c: true',
          'd: null',
          'e: []',
          'f:',
          '  g: "h"',
          'i:',
          '  - j: 1',
          '    k: "l"',
          '  - "m"',
        ].join('\n'),
      ),
    ).toEqual({
      a: 1,
      b: 'two',
      c: true,
      d: null,
      e: [],
      f: { g: 'h' },
      i: [{ j: 1, k: 'l' }, 'm'],
    });
  });
});
