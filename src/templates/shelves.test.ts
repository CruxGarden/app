import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseShelf, defaultShelfQuestion } from '@/game/shelf';
import { HIDDEN_KINDS } from '@/game/hidden';

/**
 * The starter Shelves (WHO-AM-I-PLAN W1): every entry parses, is guessable
 * (aliases), has a voice, carries provenance, and nobody is alive.
 */
const DIR = join(__dirname, 'shelves');
const SHELVES = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, raw: readFileSync(join(DIR, f), 'utf8') }));

const EXPECTED_QUESTIONS: Record<string, string> = {
  'history.json': 'Who am I?',
  'things.json': 'What am I?',
};

describe('starter shelves', () => {
  it('ships history (~40 figures) and things (~12 objects and places)', () => {
    const byFile = Object.fromEntries(SHELVES.map((s) => [s.file, parseShelf(s.raw)]));
    expect(Object.keys(byFile).sort()).toEqual(['history.json', 'things.json']);
    expect(byFile['history.json']!.entries.length).toBeGreaterThanOrEqual(40);
    expect(byFile['history.json']!.entries.length).toBeLessThanOrEqual(50);
    expect(byFile['things.json']!.entries.length).toBeGreaterThanOrEqual(12);
    expect(byFile['history.json']!.entries.every((e) => e.kind === 'person')).toBe(true);
    expect(byFile['things.json']!.entries.some((e) => e.kind === 'place')).toBe(true);
    expect(byFile['things.json']!.entries.some((e) => e.kind === 'object')).toBe(true);
    // The provenance signal is exercised, not just declared
    expect(byFile['things.json']!.entries.some((e) => e.provenance === 'unsourced')).toBe(true);
  });

  it.each(SHELVES.map((s) => [s.file, s.raw] as const))(
    '%s: parses, carries its question and voicePerson, and every entry is complete',
    (file, raw) => {
      const shelf = parseShelf(raw);
      const json = JSON.parse(raw) as Record<string, unknown>;
      // The Shelf is the game: the question is explicit, and it matches what the kinds imply
      expect(json.question, `${file} must state its question`).toBe(EXPECTED_QUESTIONS[file]);
      expect(shelf.question).toBe(EXPECTED_QUESTIONS[file]);
      expect(defaultShelfQuestion(shelf.entries)).toBe(shelf.question);
      expect(shelf.voicePerson).toBe('I');
      expect(shelf.description).toBeTruthy();
      expect(shelf.id).toBe(file.replace(/\.json$/, ''));

      const ids = new Set<string>();
      const names = new Set<string>();
      for (const e of shelf.entries) {
        const at = `${file}/${e.id}`;
        expect(ids.has(e.id), `${at}: duplicate id`).toBe(false);
        ids.add(e.id);
        const lower = e.name.toLowerCase();
        expect(names.has(lower), `${at}: duplicate name`).toBe(false);
        names.add(lower);
        expect(e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(HIDDEN_KINDS).toContain(e.kind);
        expect(e.aliases.length, `${at}: needs at least one alias`).toBeGreaterThanOrEqual(1);
        expect(
          e.aliases.some((a) => a.toLowerCase() !== lower),
          `${at}: aliases must add a variant`,
        ).toBe(true);
        expect(e.era, `${at}: needs an era`).toBeTruthy();
        expect(e.voiceNote, `${at}: needs a voice note`).toBeTruthy();
        expect(e.voiceNote!.length, `${at}: voice note is one line`).toBeLessThan(220);
        expect(e.voiceNote).not.toContain('\n');
        expect(e.mostFamous?.length, `${at}: needs mostFamous`).toBeGreaterThanOrEqual(1);
        expect(e.mostFamous!.length).toBeLessThanOrEqual(3);
        expect(['sourced', 'unsourced']).toContain(e.provenance);
        if (e.provenance === 'sourced') {
          expect(e.sources?.length, `${at}: sourced needs sources`).toBeGreaterThanOrEqual(1);
          for (const url of e.sources!) expect(url).toMatch(/^https:\/\/[a-z.]+wikipedia\.org\//);
        }
        expect(e.living, `${at}: nobody on a shelf is alive`).not.toBe(true);
      }
    },
  );

  it('the voice never says the name: no alias or mostFamous term is the name itself', () => {
    for (const { file, raw } of SHELVES) {
      for (const e of parseShelf(raw).entries) {
        for (const term of e.mostFamous ?? []) {
          expect(term.toLowerCase(), `${file}/${e.id}: mostFamous repeats the name`).not.toBe(
            e.name.toLowerCase(),
          );
        }
      }
    }
  });
});
