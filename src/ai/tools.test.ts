import { describe, it, expect, beforeEach } from 'vitest';
import {
  createToolExecutor,
  TOOL_DEFINITIONS,
  SITE_TOOL_DEFINITIONS,
  defaultToolDefinitions,
  didMutate,
  DELETE_DECLINED,
  MUTATING_TOOLS,
} from './tools';
import { initServices } from '@/services';

describe('TOOL_DEFINITIONS', () => {
  it('defines 8 universal tools', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(8);
  });

  it('includes all expected tool names', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('read_file');
    expect(names).toContain('delete_file');
    expect(names).toContain('list_files');
    expect(names).toContain('generate_image');
    expect(names).toContain('search_files');
    expect(names).toContain('rename_file');
  });

  it('keeps site tools (build capability) out of the universal set', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).not.toContain('check_site');
    expect(SITE_TOOL_DEFINITIONS.map((t) => t.name)).toEqual(['check_site']);
  });

  it('defaultToolDefinitions excludes site tools without the Build capability', () => {
    // Test env has no electron bridge, so Build is unavailable
    expect(defaultToolDefinitions().map((t) => t.name)).not.toContain('check_site');
  });

  it('each tool has valid input_schema', () => {
    for (const tool of [...TOOL_DEFINITIONS, ...SITE_TOOL_DEFINITIONS]) {
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.required).toBeInstanceOf(Array);
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

describe('MUTATING_TOOLS', () => {
  it('lists every tool that changes workspace files', () => {
    expect(MUTATING_TOOLS).toEqual([
      'write_file',
      'edit_file',
      'delete_file',
      'generate_image',
      'rename_file',
    ]);
  });
});

describe('createToolExecutor', () => {
  let execute: ReturnType<typeof createToolExecutor>;
  const cruxId = 'test-crux';

  beforeEach(async () => {
    await initServices('local');
    // Create the crux so the executor has something to work with
    const services = (await import('@/services')).getServices();
    await services.crux.create({ title: 'Test' });
    execute = createToolExecutor(cruxId);
  });

  describe('write_file', () => {
    it('creates a new file', async () => {
      const result = await execute('write_file', {
        path: 'index.html',
        content: '<h1>Hello</h1>',
      });
      expect(result).toBe('Created file: index.html');
    });

    it('blocks overwrite without prior read', async () => {
      // Create the file first
      await execute('write_file', { path: 'app.js', content: 'v1' });

      // Try to overwrite without reading — should be blocked
      const result = await execute('write_file', {
        path: 'app.js',
        content: 'v2',
      });
      expect(result).toContain('already exists');
      expect(result).toContain('read_file');
    });

    it('allows overwrite after read', async () => {
      await execute('write_file', { path: 'style.css', content: 'v1' });
      await execute('read_file', { path: 'style.css' });
      const result = await execute('write_file', {
        path: 'style.css',
        content: 'v2',
      });
      expect(result).toBe('Updated file: style.css');
    });
  });

  describe('read_file', () => {
    it('reads file content', async () => {
      await execute('write_file', { path: 'hello.txt', content: 'hello world' });
      const result = await execute('read_file', { path: 'hello.txt' });
      expect(result).toBe('hello world');
    });

    it('returns error for nonexistent file', async () => {
      const result = await execute('read_file', { path: 'missing.txt' });
      expect(result).toContain('File not found');
    });
  });

  describe('edit_file', () => {
    it('replaces text in a file', async () => {
      await execute('write_file', {
        path: 'page.html',
        content: '<h1>Old Title</h1>',
      });
      // Must read before edit (read-before-edit enforcement)
      await execute('read_file', { path: 'page.html' });
      const result = await execute('edit_file', {
        path: 'page.html',
        old_string: 'Old Title',
        new_string: 'New Title',
      });
      expect(result).toBe('Edited file: page.html');

      // Verify the edit
      const content = await execute('read_file', { path: 'page.html' });
      expect(content).toBe('<h1>New Title</h1>');
    });

    it('returns error when old_string not found', async () => {
      await execute('write_file', {
        path: 'data.txt',
        content: 'actual content',
      });
      await execute('read_file', { path: 'data.txt' });
      const result = await execute('edit_file', {
        path: 'data.txt',
        old_string: 'nonexistent',
        new_string: 'replacement',
      });
      expect(result).toContain('not found');
    });

    it('returns error when editing without reading first', async () => {
      const result = await execute('edit_file', {
        path: 'ghost.txt',
        old_string: 'a',
        new_string: 'b',
      });
      expect(result).toContain('read_file');
    });

    it('returns error for nonexistent file after read', async () => {
      // Read a different file, then try to edit a nonexistent one
      await execute('write_file', { path: 'other.txt', content: 'x' });
      await execute('read_file', { path: 'other.txt' });
      // ghost.txt was never read, so enforcement catches it
      const result = await execute('edit_file', {
        path: 'ghost.txt',
        old_string: 'a',
        new_string: 'b',
      });
      expect(result).toContain('read_file');
    });

    it('handles multiple matches with replace_all', async () => {
      await execute('write_file', {
        path: 'vars.js',
        content: 'const foo = 1;\nconst foo = 2;',
      });
      await execute('read_file', { path: 'vars.js' });

      // Without replace_all — should error about multiple matches
      const result1 = await execute('edit_file', {
        path: 'vars.js',
        old_string: 'foo',
        new_string: 'bar',
      });
      expect(result1).toContain('matches');

      // Need to re-read after failed edit (stale read cleared on success only)
      await execute('read_file', { path: 'vars.js' });

      // With replace_all — should succeed
      const result2 = await execute('edit_file', {
        path: 'vars.js',
        old_string: 'foo',
        new_string: 'bar',
        replace_all: true,
      });
      expect(result2).toContain('Edited file: vars.js');

      const content = await execute('read_file', { path: 'vars.js' });
      expect(content).toBe('const bar = 1;\nconst bar = 2;');
    });
  });

  describe('list_files', () => {
    it('returns "No files yet." when empty', async () => {
      const result = await execute('list_files', {});
      expect(result).toBe('No files yet.');
    });

    it('lists created files', async () => {
      await execute('write_file', { path: 'index.html', content: '<html>' });
      await execute('write_file', { path: 'app.js', content: 'console.log()' });

      const result = await execute('list_files', {});
      expect(result).toContain('index.html');
      expect(result).toContain('app.js');
    });
  });

  describe('delete_file', () => {
    it('deletes a file when no confirmation callback (headless)', async () => {
      await execute('write_file', { path: 'temp.txt', content: 'delete me' });
      const result = await execute('delete_file', { path: 'temp.txt' });
      expect(result).toBe('Deleted file: temp.txt');

      // Verify deleted
      const listResult = await execute('list_files', {});
      expect(listResult).not.toContain('temp.txt');
    });

    it('is honest when the user declines — file survives', async () => {
      const execWithConfirm = createToolExecutor(cruxId, async () => false);
      await execute('write_file', { path: 'keep.txt', content: 'keep' });
      const result = await execWithConfirm('delete_file', { path: 'keep.txt' });
      expect(result).toContain('DECLINED');
      expect(result).toContain('still exists');

      const listResult = await execute('list_files', {});
      expect(listResult).toContain('keep.txt');
    });

    it('reports approval after the app performs the deletion', async () => {
      // The approval callback contract: resolving true means the app already
      // deleted the file (as cruxStore.confirmDelete does).
      const services = (await import('@/services')).getServices();
      const execWithConfirm = createToolExecutor(cruxId, async (_path, artifactId) => {
        await services.artifact.delete(artifactId);
        return true;
      });
      await execute('write_file', { path: 'remove.txt', content: 'bye' });
      const result = await execWithConfirm('delete_file', { path: 'remove.txt' });
      expect(result).toContain('Deleted file: remove.txt');

      const listResult = await execute('list_files', {});
      expect(listResult).not.toContain('remove.txt');
    });

    it('errors before asking for approval when the file does not exist', async () => {
      let asked = false;
      const execWithConfirm = createToolExecutor(cruxId, async () => {
        asked = true;
        return true;
      });
      const result = await execWithConfirm('delete_file', { path: 'ghost.txt' });
      expect(result).toContain('File not found');
      expect(asked).toBe(false);
    });
  });

  describe('search_files', () => {
    it('finds matching lines across files as path:line: text', async () => {
      await execute('write_file', {
        path: 'src/a.js',
        content: 'const title = "Hello";\nconsole.log(title);',
      });
      await execute('write_file', { path: 'src/b.css', content: '.title { color: red; }' });

      const result = await execute('search_files', { query: 'title' });
      expect(result).toContain('src/a.js:1:');
      expect(result).toContain('src/a.js:2:');
      expect(result).toContain('src/b.css:1:');
    });

    it('is case-insensitive by default, exact with case_sensitive', async () => {
      await execute('write_file', { path: 'note.txt', content: 'Hello World' });

      const loose = await execute('search_files', { query: 'hello' });
      expect(loose).toContain('note.txt:1:');

      const strict = await execute('search_files', { query: 'hello', case_sensitive: true });
      expect(strict).toContain('No matches');
    });

    it('supports regex mode and rejects invalid patterns', async () => {
      await execute('write_file', { path: 'post.md', content: 'date: 2026-07-31' });

      const found = await execute('search_files', {
        query: 'date:\\s*\\d{4}',
        regex: true,
      });
      expect(found).toContain('post.md:1:');

      const bad = await execute('search_files', { query: '(unclosed', regex: true });
      expect(bad).toContain('Invalid regular expression');
    });

    it('treats regex metacharacters literally in substring mode', async () => {
      await execute('write_file', { path: 'code.js', content: 'items.map(x => x * 2)' });
      const result = await execute('search_files', { query: '.map(x' });
      expect(result).toContain('code.js:1:');
    });

    it('reports zero matches without erroring', async () => {
      const result = await execute('search_files', { query: 'nothing-matches-this' });
      expect(result).toContain('No matches');
    });
  });

  describe('rename_file', () => {
    it('renames a file, preserving content', async () => {
      await execute('write_file', { path: 'draft.md', content: '# Post' });
      const result = await execute('rename_file', {
        old_path: 'draft.md',
        new_path: 'posts/hello.md',
      });
      expect(result).toContain('Renamed draft.md → posts/hello.md');

      const listResult = await execute('list_files', {});
      expect(listResult).toContain('posts/hello.md');
      expect(listResult).not.toContain('draft.md');

      const content = await execute('read_file', { path: 'posts/hello.md' });
      expect(content).toBe('# Post');
    });

    it('errors when the source file does not exist', async () => {
      const result = await execute('rename_file', {
        old_path: 'ghost.md',
        new_path: 'real.md',
      });
      expect(result).toContain('File not found');
    });

    it('refuses to overwrite an existing file', async () => {
      await execute('write_file', { path: 'one.txt', content: '1' });
      await execute('write_file', { path: 'two.txt', content: '2' });
      const result = await execute('rename_file', {
        old_path: 'one.txt',
        new_path: 'two.txt',
      });
      expect(result).toContain('already exists');

      // Both files untouched
      const listResult = await execute('list_files', {});
      expect(listResult).toContain('one.txt');
      expect(listResult).toContain('two.txt');
    });

    it('rejects identical old and new paths', async () => {
      await execute('write_file', { path: 'same.txt', content: 'x' });
      const result = await execute('rename_file', {
        old_path: 'same.txt',
        new_path: 'same.txt',
      });
      expect(result).toContain('identical');
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const result = await execute('nonexistent_tool', {});
      expect(result).toContain('Unknown tool');
    });
  });

  describe('path resolution', () => {
    it('never resolves a bare filename to a different directory', async () => {
      await execute('write_file', { path: 'images/logo.png', content: 'x' });

      // "logo.png" is not that file — deleting it would remove images/logo.png
      // while telling the user (and the model) it removed "logo.png".
      const deleted = await execute('delete_file', { path: 'logo.png' });
      expect(deleted).toContain('File not found');

      const listResult = await execute('list_files', {});
      expect(listResult).toContain('images/logo.png');
    });

    it('prefers an exact path match over a same-named file elsewhere', async () => {
      await execute('write_file', { path: 'sub/app.js', content: 'nested' });
      await execute('write_file', { path: 'app.js', content: 'root' });

      expect(await execute('read_file', { path: 'app.js' })).toBe('root');
      expect(await execute('read_file', { path: 'sub/app.js' })).toBe('nested');
    });

    it('lets a root file be created even when a nested file shares its name', async () => {
      // The old basename matching reported "already exists" here, making the
      // root file impossible to create.
      await execute('write_file', { path: 'deep/notes.txt', content: 'nested' });
      const result = await execute('write_file', { path: 'notes.txt', content: 'root' });
      expect(result).toBe('Created file: notes.txt');
      expect(await execute('read_file', { path: 'deep/notes.txt' })).toBe('nested');
    });
  });

  describe('edit_file recovery', () => {
    it('keeps the read mark after a failed edit so the retry works', async () => {
      await execute('write_file', { path: 'retry.txt', content: 'hello world' });
      await execute('read_file', { path: 'retry.txt' });

      const failed = await execute('edit_file', {
        path: 'retry.txt',
        old_string: 'not present',
        new_string: 'x',
      });
      expect(failed).toContain('Error');
      // The failure embeds the current contents precisely so the model can
      // retry immediately — clearing the read mark made that impossible.
      const retried = await execute('edit_file', {
        path: 'retry.txt',
        old_string: 'hello',
        new_string: 'goodbye',
      });
      expect(retried).toBe('Edited file: retry.txt');
      expect(await execute('read_file', { path: 'retry.txt' })).toBe('goodbye world');
    });

    it('rejects an empty old_string instead of shredding the file', async () => {
      await execute('write_file', { path: 'intact.txt', content: 'abc' });
      await execute('read_file', { path: 'intact.txt' });
      const result = await execute('edit_file', {
        path: 'intact.txt',
        old_string: '',
        new_string: 'X',
        replace_all: true,
      });
      expect(result).toContain('Error');
      expect(await execute('read_file', { path: 'intact.txt' })).toBe('abc');
    });
  });

  describe('didMutate', () => {
    it('is true only for tools that actually changed something', () => {
      expect(didMutate('write_file', 'Created file: a.txt')).toBe(true);
      expect(didMutate('rename_file', 'Renamed a → b')).toBe(true);
      expect(didMutate('read_file', 'file contents')).toBe(false);
      expect(didMutate('search_files', 'a.txt:1: match')).toBe(false);
      expect(didMutate('write_file', 'Error in write_file: nope')).toBe(false);
      expect(didMutate('delete_file', `${DELETE_DECLINED} the deletion of a.txt.`)).toBe(false);
      expect(didMutate('delete_file', 'Deleted file: a.txt (approved by user)')).toBe(true);
    });
  });

  describe('concurrent tool calls', () => {
    it('serializes writes to the same path instead of duplicating the artifact', async () => {
      // The SDK runs a step's tool calls with Promise.all; the service's
      // check-then-insert would otherwise interleave into two rows.
      await Promise.all([
        execute('write_file', { path: 'race.txt', content: 'one' }),
        execute('write_file', { path: 'race.txt', content: 'two' }),
      ]);
      const services = (await import('@/services')).getServices();
      const artifacts = await services.artifact.findByResource('crux', cruxId);
      const matches = artifacts.filter((a) => (a.meta?.path || a.filename) === 'race.txt');
      expect(matches).toHaveLength(1);
    });
  });
});
