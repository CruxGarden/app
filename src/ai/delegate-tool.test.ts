import { describe, it, expect } from 'vitest';
import {
  validateDelegateInput,
  DELEGATE_TOOL_DEFINITION,
  MAX_DELEGATE_TASKS,
} from './delegate-tool';
import { isInScope, scopeViolation, describeScope, normalizeScope } from '@/lib/write-scope';

describe('delegate tool', () => {
  it('is described for the model with its limits and when not to use it', () => {
    expect(DELEGATE_TOOL_DEFINITION.name).toBe('delegate');
    expect(DELEGATE_TOOL_DEFINITION.description).toMatch(
      /never for one file|DO NOT USE for one file/i,
    );
    expect(DELEGATE_TOOL_DEFINITION.description).toContain(`Maximum ${MAX_DELEGATE_TASKS} tasks`);
    expect(DELEGATE_TOOL_DEFINITION.input_schema.required).toEqual(['tasks']);
  });

  it('accepts well-formed tasks and normalizes their scopes', () => {
    const v = validateDelegateInput({
      tasks: [
        {
          title: ' Captions 1–10 ',
          instructions: 'Write them.',
          paths: ['/posts/a.md', 'posts/./b.md'],
        },
        { title: 'Translations', instructions: 'Translate.', folder: 'src/pages/fr/' },
      ],
    });
    expect(v.valid).toBe(true);
    if (!v.valid) return;
    expect(v.tasks[0]).toEqual({
      title: 'Captions 1–10',
      instructions: 'Write them.',
      scope: { paths: ['posts/a.md', 'posts/b.md'] },
    });
    expect(v.tasks[1]!.scope).toEqual({ folder: 'src/pages/fr' });
  });

  it('refuses more than the maximum, empty lists, and duplicate titles', () => {
    expect(validateDelegateInput({ tasks: [] })).toMatchObject({ valid: false });
    expect(validateDelegateInput({})).toMatchObject({ valid: false });
    const many = Array.from({ length: MAX_DELEGATE_TASKS + 1 }, (_, i) => ({
      title: `t${i}`,
      instructions: 'x',
      paths: [`${i}.md`],
    }));
    const tooMany = validateDelegateInput({ tasks: many });
    expect(tooMany.valid).toBe(false);
    if (!tooMany.valid) expect(tooMany.error).toMatch(/Too many tasks \(7\)/);
    const dup = validateDelegateInput({
      tasks: [
        { title: 'Same', instructions: 'a', paths: ['a.md'] },
        { title: 'same', instructions: 'b', paths: ['b.md'] },
      ],
    });
    expect(dup.valid).toBe(false);
    if (!dup.valid) expect(dup.error).toMatch(/unique/);
  });

  it('requires a title, instructions, and a scope for every task', () => {
    const noTitle = validateDelegateInput({ tasks: [{ instructions: 'x', paths: ['a'] }] });
    expect(noTitle).toMatchObject({ valid: false, error: 'tasks[0].title is required.' });
    const noInstr = validateDelegateInput({ tasks: [{ title: 'T', paths: ['a'] }] });
    expect(noInstr).toMatchObject({ valid: false, error: 'tasks[0].instructions is required.' });
    const noScope = validateDelegateInput({ tasks: [{ title: 'T', instructions: 'x' }] });
    expect(noScope.valid).toBe(false);
    if (!noScope.valid) expect(noScope.error).toMatch(/needs a scope/);
    const badPaths = validateDelegateInput({
      tasks: [{ title: 'T', instructions: 'x', paths: [1] }],
    });
    expect(badPaths).toMatchObject({
      valid: false,
      error: 'tasks[0].paths must be an array of strings.',
    });
    // A scope that normalizes to nothing ("/" or "..") is no scope
    const climbs = validateDelegateInput({
      tasks: [{ title: 'T', instructions: 'x', paths: ['../'] }],
    });
    expect(climbs.valid).toBe(false);
  });
});

describe('write scope', () => {
  it('allows listed paths and anything under the folder; refuses the rest', () => {
    const scope = { paths: ['notes.md', 'a/b.md'], folder: 'posts' };
    expect(isInScope('notes.md', scope)).toBe(true);
    expect(isInScope('/notes.md', scope)).toBe(true);
    expect(isInScope('a/./b.md', scope)).toBe(true);
    expect(isInScope('posts/x.md', scope)).toBe(true);
    expect(isInScope('posts/deep/x.md', scope)).toBe(true);
    expect(isInScope('posts', scope)).toBe(true);
    expect(isInScope('postscript.md', scope)).toBe(false);
    expect(isInScope('index.html', scope)).toBe(false);
    expect(isInScope('posts/../index.html', scope)).toBe(false);
    expect(isInScope('', scope)).toBe(false);
  });

  it('a scope with nothing in it allows no writes', () => {
    expect(isInScope('a.md', {})).toBe(false);
    expect(normalizeScope({ paths: [], folder: '' })).toEqual({});
  });

  it('checks only the tools that change a named file, including both ends of a rename', () => {
    const scope = { folder: 'posts' };
    expect(scopeViolation('read_file', { path: 'index.html' }, scope)).toBeNull();
    expect(scopeViolation('list_files', {}, scope)).toBeNull();
    expect(scopeViolation('write_file', { path: 'posts/a.md' }, scope)).toBeNull();
    expect(scopeViolation('write_file', { path: 'index.html' }, scope)).toMatch(
      /"index.html" is outside this task's scope — you may only change the folder posts\//,
    );
    expect(scopeViolation('edit_file', { path: 'x.md' }, scope)).not.toBeNull();
    expect(scopeViolation('delete_file', { path: 'x.md' }, scope)).not.toBeNull();
    expect(scopeViolation('generate_image', { path: 'hero.png' }, scope)).not.toBeNull();
    expect(
      scopeViolation('rename_file', { old_path: 'posts/a.md', new_path: 'b.md' }, scope),
    ).toMatch(/"b.md"/);
    expect(
      scopeViolation('rename_file', { old_path: 'posts/a.md', new_path: 'posts/b.md' }, scope),
    ).toBeNull();
    // No scope: nothing is refused
    expect(scopeViolation('write_file', { path: 'anything' }, undefined)).toBeNull();
  });

  it('describes a scope in words', () => {
    expect(describeScope({ folder: 'posts', paths: ['a.md'] })).toBe(
      'the folder posts/ and the file a.md',
    );
    expect(describeScope({ paths: ['a.md', 'b.md'] })).toBe('the files a.md, b.md');
    expect(describeScope({})).toBe('nothing (read-only)');
  });
});
