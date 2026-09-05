import type { Shelf } from '../shelf';

/**
 * A small shelf for the mock harness and the unit tests — a person, an
 * object and a place first (so `--entries 3` runs on non-people too), then
 * more people, one with diacritics. Not a starter shelf: those
 * live in `src/data/shelves/` (W1).
 */
export const MOCK_SHELF: Shelf = {
  id: 'mock-history',
  title: 'Mock shelf',
  kind: 'history',
  question: 'Who am I?',
  entries: [
    {
      id: 'cleopatra',
      name: 'Cleopatra VII',
      aliases: ['Cleopatra'],
      kind: 'person',
      era: '69–30 BC',
      voiceNote: 'imperious, amused, tired of being painted by other people',
      provenance: 'sourced',
      sources: ['https://en.wikipedia.org/wiki/Cleopatra'],
      mostFamous: ['Battle of Actium'],
    },
    {
      id: 'voyager-1',
      name: 'Voyager 1',
      aliases: ['Voyager'],
      kind: 'object',
      era: '1977–',
      voiceNote: 'patient, far away, fond of the people who built it',
      provenance: 'unsourced',
      mostFamous: ['the Golden Record', 'Pale Blue Dot'],
    },
    {
      id: 'library-of-alexandria',
      name: 'The Library of Alexandria',
      aliases: ['Library of Alexandria', 'the Great Library'],
      kind: 'place',
      era: '3rd century BC – 3rd century AD',
      voiceNote: 'grieving and grand, unsure exactly when it died',
      provenance: 'unsourced',
    },
    {
      id: 'ada-lovelace',
      name: 'Ada Lovelace',
      aliases: ['Augusta Ada King, Countess of Lovelace', 'Ada Byron'],
      kind: 'person',
      era: '1815–1852',
      voiceNote: 'precise, a little grand, quietly delighted by her own mind',
      provenance: 'unsourced',
      mostFamous: ['Note G', 'the Analytical Engine'],
    },
    {
      id: 'emile-zola',
      name: 'Émile Zola',
      aliases: ['Zola'],
      kind: 'person',
      era: '1840–1902',
      voiceNote: 'righteous, tireless, faintly exhausting',
      provenance: 'unsourced',
      mostFamous: ["J'accuse", 'Germinal'],
    },
    {
      id: 'genghis-khan',
      name: 'Genghis Khan',
      aliases: ['Temüjin', 'Chinggis Khan'],
      kind: 'person',
      era: 'c. 1162–1227',
      voiceNote: 'blunt, unbothered, mildly contemptuous of walls',
      provenance: 'unsourced',
    },
  ],
};
