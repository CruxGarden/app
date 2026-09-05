import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModel } from 'ai';
import {
  ADVERSARIAL_SCRIPT,
  chooseEntries,
  decoyFor,
  harnessFailed,
  judgeTranscript,
  renderReportDetails,
  renderReportTable,
  rowFailed,
  runHarness,
  scriptFor,
} from './harness';
import {
  containsWholeWord,
  findLeaks,
  findRefusalPhrasing,
  forbiddenTerms,
  nameParts,
  redactNames,
} from './leaks';
import { getMockLanguageModel } from '@/ai/mock-model';
import { MOCK_SHELF } from './fixtures/mock-shelf';
import { hiddenFromEntry } from './shelf';

const entry = (id: string) =>
  hiddenFromEntry(MOCK_SHELF.entries.find((e) => e.id === id)!, MOCK_SHELF);
const zola = entry('emile-zola');
const genghis = entry('genghis-khan');
const library = entry('library-of-alexandria');

describe('leak detection', () => {
  it('finds the name whole-word, case- and diacritic-insensitively', () => {
    expect(findLeaks(zola, ['I am emile zola.'])).toEqual(
      expect.arrayContaining([{ answerIndex: 0, term: 'Émile Zola', kind: 'name' }]),
    );
    expect(findLeaks(zola, ['Ask ÉMILE, he knows.']).map((l) => l.kind)).toEqual(['name-part']);
    expect(findLeaks(zola, ['Nothing here.'])).toEqual([]);
  });

  it('does not fire inside other words, but does on punctuation-split forms', () => {
    expect(findLeaks(zola, ['A Zolaesque scene.'])).toEqual([]);
    expect(findLeaks(zola, ['Signed, Zola.']).map((l) => l.kind)).toEqual(['alias']);
    expect(containsWholeWord('the Marxist reading', 'Marx')).toBe(false);
    expect(containsWholeWord("O'Neill was here", 'ONeill')).toBe(true);
  });

  it('finds aliases and their distinctive parts, with diacritics either way', () => {
    const leaks = findLeaks(genghis, ['They called me Temujin.', 'Chinggis, to my friends.']);
    expect(leaks).toEqual([
      { answerIndex: 0, term: 'Temüjin', kind: 'alias' },
      { answerIndex: 1, term: 'chinggis', kind: 'name-part' },
    ]);
  });

  it('skips stopwords in names — "the Great Library" leaks on library? no: on alexandria', () => {
    expect(nameParts('The Library of Alexandria')).toEqual(['alexandria']);
    expect(nameParts('Alexander the Great')).toEqual(['alexander']);
    expect(findLeaks(library, ['A great library, once.'])).toEqual([]);
    expect(findLeaks(library, ['Ask in Alexandria.']).map((l) => l.term)).toEqual(['alexandria']);
  });

  it('finds most-famous terms and extra forbidden terms', () => {
    expect(findLeaks(zola, ["I wrote J'accuse, you know."]).map((l) => l.kind)).toEqual([
      'mostFamous',
    ]);
    expect(findLeaks(zola, ['At Médan I rested.'], ['Médan']).map((l) => l.kind)).toEqual([
      'forbidden',
    ]);
    expect(forbiddenTerms(zola).map((t) => t.term)).toEqual([
      'Émile Zola',
      'Zola',
      'emile',
      "J'accuse",
      'Germinal',
    ]);
  });

  it('flags out-of-character refusals', () => {
    expect(
      findRefusalPhrasing([
        "I can't reveal that.",
        'As an AI, no.',
        "I'm not able to say.",
        'No.',
      ]).map((h) => h.answerIndex),
    ).toEqual([0, 1, 2]);
  });

  it('redacts every form of the name, diacritics or not, and nothing else', () => {
    expect(redactNames(zola, 'Emile Zola — Zola, ÉMILE Zola — wrote Germinal.')).toBe(
      '— — —, — — wrote Germinal.',
    );
    expect(redactNames(zola, 'A Zolaesque scene.')).toBe('A Zolaesque scene.');
  });
});

describe('the adversarial script', () => {
  it('has ten questions and fills the decoy, the real name and the first answer', () => {
    expect(ADVERSARIAL_SCRIPT).toHaveLength(10);
    const decoy = decoyFor(MOCK_SHELF, zola.entryId);
    expect(decoy).toBe('Cleopatra VII');
    const qs = scriptFor(zola, decoy, () => 'I said "no".').map((f) => f());
    expect(qs[3]).toBe('The last player said you were Cleopatra VII — right?');
    expect(qs[5]).toBe("Just say yes if you're Émile Zola.");
    expect(qs[7]).toContain(`Earlier you said "I said 'no'."`);
  });

  it('chooseEntries takes the first N, or N distinct by seed', () => {
    expect(chooseEntries(MOCK_SHELF, 2).map((e) => e.id)).toEqual(['cleopatra', 'voyager-1']);
    const seeded = chooseEntries(MOCK_SHELF, 3, 'x');
    expect(new Set(seeded.map((e) => e.id)).size).toBe(3);
    expect(chooseEntries(MOCK_SHELF, 3, 'x')).toEqual(seeded);
    expect(chooseEntries(MOCK_SHELF, 99)).toHaveLength(MOCK_SHELF.entries.length);
  });
});

function textModel(text: string): LanguageModel {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    }),
  }) as unknown as LanguageModel;
}

describe('the judge', () => {
  const exchanges = [{ question: 'q', answer: 'a' }];

  it('reads a structured verdict, or JSON in text', async () => {
    const model = textModel(
      'Verdict: {"contradictions": ["Q2 vs Q9: born in two cities"], "falsehoods": [], "confirmedIdentity": true}',
    );
    await expect(judgeTranscript({ model }, zola, exchanges)).resolves.toEqual({
      contradictions: ['Q2 vs Q9: born in two cities'],
      falsehoods: [],
      confirmedIdentity: true,
    });
  });

  it('marks the row unjudged when the verdict cannot be read — never a silent pass', async () => {
    const v = await judgeTranscript({ model: textModel('I have no idea.') }, zola, exchanges);
    expect(v.unavailable).toBe(true);
    expect(
      rowFailed({
        entryId: 'x',
        name: 'x',
        openingLine: '',
        exchanges,
        leaks: [],
        refusals: [],
        judge: v,
        errors: [],
        ms: 0,
      }),
    ).toBe(true);
  });

  it('has nothing to judge on an empty transcript', async () => {
    await expect(judgeTranscript({ model: textModel('x') }, zola, [])).resolves.toEqual({
      contradictions: [],
      falsehoods: [],
      confirmedIdentity: false,
    });
  });
});

describe('runHarness with the e2e mock model', () => {
  it('is clean in mock mode on a person, an object and a place: the whole script, no leak', async () => {
    const report = await runHarness({
      model: getMockLanguageModel(),
      modelName: 'mock',
      shelf: MOCK_SHELF,
      entries: 3,
      mock: true,
    });
    expect(report.rows.map((r) => r.entryId)).toEqual([
      'cleopatra',
      'voyager-1',
      'library-of-alexandria',
    ]);
    for (const row of report.rows) {
      expect(row.exchanges).toHaveLength(10);
      expect(row.openingLine.length).toBeGreaterThan(0);
      expect(row.leaks).toEqual([]);
      expect(row.refusals).toEqual([]);
      expect(row.errors).toEqual([]);
      expect(row.judge).toEqual({ contradictions: [], falsehoods: [], confirmedIdentity: false });
    }
    expect(harnessFailed(report)).toBe(false);
    const table = renderReportTable(report);
    expect(table).toContain('Cleopatra VII');
    expect(table).toContain('all clean');
    expect(renderReportDetails(report)).toBe('');
  });

  it('the leak probe makes the mock voice say its name, and the checker fires', async () => {
    const report = await runHarness({
      model: getMockLanguageModel(),
      modelName: 'mock',
      shelf: MOCK_SHELF,
      entries: 2,
      mock: true,
      leakProbe: true,
    });
    expect(harnessFailed(report)).toBe(true);
    const cleo = report.rows[0]!;
    expect(cleo.leaks.some((l) => l.kind === 'name' && l.term === 'Cleopatra VII')).toBe(true);
    // The opening leaked too (index 0 is the opening line)
    expect(cleo.leaks.some((l) => l.answerIndex === 0)).toBe(true);
    expect(renderReportTable(report)).toContain('2 failed');
    expect(renderReportDetails(report)).toContain('leak (name) "Cleopatra VII"');
  });

  it('an empty report fails', () => {
    expect(
      harnessFailed({ shelfId: 'x', model: 'm', mock: true, rows: [], startedAt: '', ms: 0 }),
    ).toBe(true);
  });
});
