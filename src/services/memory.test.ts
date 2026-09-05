import { describe, it, expect, beforeEach } from 'vitest';
import {
  MEMORY_SECTIONS,
  MEMORY_PROMPT_CAP,
  MEMORY_TRUNCATED_NOTE,
  MEMORY_TOOL_DEFINITIONS,
  emptyMemory,
  parseMemory,
  normalizeMemory,
  isMemoryEmpty,
  memoryEntries,
  getMemory,
  setMemory,
  appendMemory,
  forgetMemoryLine,
  clearMemory,
  onMemoryChanged,
  renderMemoryForPrompt,
  runMemoryTool,
  syncMemoryFromDisk,
} from './memory';
import { initServices } from './index';
import { getSetting } from './settings';
import { SettingsKey } from '@/lib/constants';

describe('garden memory (B6)', () => {
  beforeEach(async () => {
    await initServices();
    await clearMemory();
  });

  it('starts as the fixed skeleton with every section and nothing under them', () => {
    const text = getMemory();
    expect(text).toBe(emptyMemory());
    for (const s of MEMORY_SECTIONS) expect(text).toContain(`## ${s}`);
    expect(isMemoryEmpty(text)).toBe(true);
    expect(MEMORY_SECTIONS).toEqual(['Preferences', 'Voice', 'Decisions', 'Notes']);
  });

  it('normalizes free-form edits into the skeleton without losing lines', () => {
    const messy = [
      'stray line before any heading',
      '## voice',
      '- dry, short sentences',
      '',
      '## Something Else',
      '- goes to notes',
      '## Preferences',
      '- British spelling',
    ].join('\n');
    const parsed = parseMemory(messy);
    expect(parsed.Notes).toEqual(['stray line before any heading', '- goes to notes']);
    expect(parsed.Voice).toEqual(['- dry, short sentences']);
    expect(parsed.Preferences).toEqual(['- British spelling']);
    expect(parsed.Decisions).toEqual([]);
    const normalized = normalizeMemory(messy);
    expect(normalized.indexOf('## Preferences')).toBeLessThan(normalized.indexOf('## Voice'));
    expect(normalized.indexOf('## Decisions')).toBeLessThan(normalized.indexOf('## Notes'));
    // Idempotent
    expect(normalizeMemory(normalized)).toBe(normalized);
  });

  it('setMemory persists to the garden settings and clearing removes the row', async () => {
    await setMemory('## Preferences\n- prefers British spelling\n');
    expect(getSetting(SettingsKey.GardenMemory)).toContain('- prefers British spelling');
    expect(getMemory()).toContain('## Preferences\n- prefers British spelling');
    await clearMemory();
    expect(getSetting(SettingsKey.GardenMemory)).toBeNull();
    expect(getMemory()).toBe(emptyMemory());
  });

  it('appendMemory adds one bullet under the section, dedupes, and Forget removes it', async () => {
    const line = await appendMemory('Preferences', 'prefers British spelling');
    expect(line).toBe('- prefers British spelling');
    await appendMemory('Preferences', '  prefers   British spelling ');
    await appendMemory('Voice', 'no exclamation marks');
    expect(memoryEntries(getMemory())).toEqual([
      { section: 'Preferences', line: '- prefers British spelling' },
      { section: 'Voice', line: '- no exclamation marks' },
    ]);
    await forgetMemoryLine('Preferences', '- prefers British spelling');
    expect(memoryEntries(getMemory())).toEqual([
      { section: 'Voice', line: '- no exclamation marks' },
    ]);
  });

  it('notifies listeners on every write', async () => {
    const seen: string[] = [];
    const off = onMemoryChanged((t) => seen.push(t));
    await appendMemory('Notes', 'likes gardens');
    off();
    await appendMemory('Notes', 'not seen');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('- likes gardens');
  });

  describe('prompt rendering', () => {
    it('always carries the section, the rule, and "Nothing remembered yet." when empty', () => {
      const out = renderMemoryForPrompt(emptyMemory());
      expect(out.startsWith('## What you know about this gardener')).toBe(true);
      expect(out).toContain('call remember(section, note)');
      expect(out).toContain('never infer or summarize it');
      expect(out).toContain('Nothing remembered yet.');
      expect(out).not.toContain(MEMORY_TRUNCATED_NOTE);
    });

    it('keeps memory about the gardener distinct from the persona', () => {
      const out = renderMemoryForPrompt('## Voice\n- likes plain words\n');
      expect(out).toContain('It is about them, not you; your own voice comes from Identity.');
      expect(out).toContain('- likes plain words');
    });

    it('caps at ~2k chars by whole lines and says where the rest is', () => {
      const lines = Array.from({ length: 80 }, (_, i) => `- note number ${i} about something`);
      const text = `## Notes\n${lines.join('\n')}\n`;
      const out = renderMemoryForPrompt(text);
      expect(text.length).toBeGreaterThan(MEMORY_PROMPT_CAP);
      const body = out.slice(out.indexOf('## Preferences'));
      expect(body.length).toBeLessThanOrEqual(MEMORY_PROMPT_CAP + MEMORY_TRUNCATED_NOTE.length + 2);
      expect(out).toContain(MEMORY_TRUNCATED_NOTE);
      expect(out).toContain('- note number 0 about something');
      expect(out).not.toContain('- note number 79 about something');
      // Whole lines only — never a cut-off bullet
      for (const l of out.split('\n')) {
        if (l.startsWith('- note number')) expect(l).toMatch(/about something$/);
      }
    });

    it('does not truncate under the cap', () => {
      const out = renderMemoryForPrompt('## Decisions\n- Astro over Next\n');
      expect(out).not.toContain(MEMORY_TRUNCATED_NOTE);
      expect(out).toContain('- Astro over Next');
    });
  });

  describe('remember tool', () => {
    it('is defined with the four sections as an enum', () => {
      const def = MEMORY_TOOL_DEFINITIONS.find((t) => t.name === 'remember')!;
      expect(def).toBeDefined();
      expect(def.input_schema.required).toEqual(['section', 'note']);
      expect((def.input_schema.properties.section as { enum: string[] }).enum).toEqual([
        ...MEMORY_SECTIONS,
      ]);
      expect(def.description).not.toMatch(/\bAI\b/);
    });

    it('saves the line and reports exactly what was remembered', async () => {
      const out = await runMemoryTool({ section: 'preferences', note: 'prefers British spelling' });
      expect(out).toBe('Remembered (Preferences): prefers British spelling');
      expect(getMemory()).toContain('## Preferences\n- prefers British spelling');
      expect(renderMemoryForPrompt()).toContain('- prefers British spelling');
    });
  });

  it('syncMemoryFromDisk is a no-op without a Project Folder (web)', async () => {
    await setMemory('## Notes\n- kept\n');
    expect(await syncMemoryFromDisk()).toBe(getMemory());
    expect(getMemory()).toContain('- kept');
  });
});
