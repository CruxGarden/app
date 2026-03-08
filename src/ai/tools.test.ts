import { describe, it, expect, beforeEach } from 'vitest';
import { createToolExecutor, TOOL_DEFINITIONS, MUTATING_TOOLS } from './tools';
import { initServices } from '@/services';

describe('TOOL_DEFINITIONS', () => {
  it('defines 5 tools', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(5);
  });

  it('includes all expected tool names', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('read_file');
    expect(names).toContain('delete_file');
    expect(names).toContain('list_files');
  });

  it('each tool has valid input_schema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.required).toBeInstanceOf(Array);
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

describe('MUTATING_TOOLS', () => {
  it('lists write_file, edit_file, delete_file', () => {
    expect(MUTATING_TOOLS).toEqual(['write_file', 'edit_file', 'delete_file']);
  });
});

describe('createToolExecutor', () => {
  let execute: (name: string, input: Record<string, unknown>) => Promise<string>;
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
      expect(result).toBe('Wrote index.html');
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
      expect(result).toContain('Read it first');
    });

    it('allows overwrite after read', async () => {
      await execute('write_file', { path: 'style.css', content: 'v1' });
      await execute('read_file', { path: 'style.css' });
      const result = await execute('write_file', {
        path: 'style.css',
        content: 'v2',
      });
      expect(result).toBe('Wrote style.css');
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
      // edit_file implicitly reads, so no need for read_file first
      const result = await execute('edit_file', {
        path: 'page.html',
        old_string: 'Old Title',
        new_string: 'New Title',
      });
      expect(result).toBe('Edited page.html');

      // Verify the edit
      const content = await execute('read_file', { path: 'page.html' });
      expect(content).toBe('<h1>New Title</h1>');
    });

    it('returns error when old_string not found', async () => {
      await execute('write_file', {
        path: 'data.txt',
        content: 'actual content',
      });
      const result = await execute('edit_file', {
        path: 'data.txt',
        old_string: 'nonexistent',
        new_string: 'replacement',
      });
      expect(result).toContain('not found');
    });

    it('returns error for nonexistent file', async () => {
      const result = await execute('edit_file', {
        path: 'ghost.txt',
        old_string: 'a',
        new_string: 'b',
      });
      expect(result).toContain('File not found');
    });

    it('handles multiple matches with replace_all', async () => {
      await execute('write_file', {
        path: 'vars.js',
        content: 'const foo = 1;\nconst foo = 2;',
      });

      // Without replace_all — should error
      const result1 = await execute('edit_file', {
        path: 'vars.js',
        old_string: 'foo',
        new_string: 'bar',
      });
      expect(result1).toContain('Multiple matches');

      // With replace_all — should succeed
      const result2 = await execute('edit_file', {
        path: 'vars.js',
        old_string: 'foo',
        new_string: 'bar',
        replace_all: true,
      });
      expect(result2).toBe('Edited vars.js');

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
    it('deletes a file when no confirmation callback', async () => {
      await execute('write_file', { path: 'temp.txt', content: 'delete me' });
      const result = await execute('delete_file', { path: 'temp.txt' });
      expect(result).toBe('Deleted temp.txt');

      // Verify deleted
      const listResult = await execute('list_files', {});
      expect(listResult).not.toContain('temp.txt');
    });

    it('respects confirmation callback — denied', async () => {
      const execWithConfirm = createToolExecutor(cruxId, async () => false);
      await execute('write_file', { path: 'keep.txt', content: 'keep' });
      const result = await execWithConfirm('delete_file', { path: 'keep.txt' });
      expect(result).toContain('cancelled');
    });

    it('respects confirmation callback — approved', async () => {
      const execWithConfirm = createToolExecutor(cruxId, async () => true);
      await execute('write_file', { path: 'remove.txt', content: 'bye' });
      const result = await execWithConfirm('delete_file', { path: 'remove.txt' });
      expect(result).toBe('Deleted remove.txt');
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const result = await execute('nonexistent_tool', {});
      expect(result).toContain('Unknown tool');
    });
  });
});
