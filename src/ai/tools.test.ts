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
import { GROWTH_TOOL_DEFINITIONS } from './growth-tools';

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

  it('offers the Growth tools on every platform (B0)', () => {
    const names = defaultToolDefinitions().map((t) => t.name);
    for (const name of GROWTH_TOOL_DEFINITIONS.map((t) => t.name)) expect(names).toContain(name);
    expect(GROWTH_TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      'snapshot',
      'list_snapshots',
      'restore',
      'branch',
      'diff',
    ]);
    for (const tool of GROWTH_TOOL_DEFINITIONS) {
      expect(tool.input_schema.type).toBe('object');
      expect(tool.description.length).toBeGreaterThan(10);
    }
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
      // Growth tools that replace files (B0); snapshot/list/diff do not mutate
      'restore',
      'branch',
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

/**
 * Growth tools (B0) through the executor, against the real local services —
 * the headless host path (no workspace store registered), which is what an
 * external agent gets when the crux is not open in the app.
 */
describe('growth tools', () => {
  let execute: ReturnType<typeof createToolExecutor>;
  let cruxId: string;

  beforeEach(async () => {
    await initServices('local');
    const services = (await import('@/services')).getServices();
    const crux = await services.crux.create({
      title: 'Growth',
      type: 'workspace',
      meta: { messages: [{ role: 'user', content: 'hi' }], settings: { model: 'm' } },
    });
    cruxId = crux.id;
    execute = createToolExecutor(cruxId);
    await execute('write_file', { path: 'index.html', content: '<h1>v1</h1>' });
  });

  it('snapshot records a labelled snapshot attributed to the collaborator and returns its id', async () => {
    const result = (await execute('snapshot', { label: 'First' })) as string;
    expect(result).toMatch(/^Snapshot #1 recorded\./);
    const id = /id: (\S+)/.exec(result)![1]!;

    const { getServices } = await import('@/services');
    const { dimension, crux } = getServices();
    const growths = await dimension.findBySourceAndType(cruxId, 'growth');
    expect(growths).toHaveLength(1);
    expect(growths[0]!.targetId).toBe(id);
    expect(growths[0]!.meta?.label).toBe('First');
    expect(growths[0]!.meta?.requestedBy).toBe('collaborator');
    // The captured segment is now history: the workspace segment starts fresh
    const updated = await crux.findById(cruxId);
    expect(updated.meta?.messages).toEqual([]);
    expect(updated.meta?.growthCount).toBe(1);
    const snap = await crux.findById(id);
    expect((snap.meta?.messages as unknown[]).length).toBe(1);
  });

  it('stamps agent attribution when the executor is created for an agent', async () => {
    const agentExecute = createToolExecutor(cruxId, undefined, undefined, {
      requestedBy: 'agent:claude-code',
    });
    await agentExecute('snapshot', {});
    const { getServices } = await import('@/services');
    const growths = await getServices().dimension.findBySourceAndType(cruxId, 'growth');
    expect(growths[0]!.meta?.requestedBy).toBe('agent:claude-code');
  });

  it('list_snapshots lists id, position, label and parent; respects limit', async () => {
    expect(await execute('list_snapshots', {})).toMatch(/No snapshots yet/);
    await execute('snapshot', { label: 'one' });
    await execute('read_file', { path: 'index.html' });
    await execute('write_file', { path: 'index.html', content: '<h1>v2</h1>' });
    const second = (await execute('snapshot', { label: 'two' })) as string;
    const secondId = /id: (\S+)/.exec(second)![1]!;

    const all = (await execute('list_snapshots', {})) as string;
    const lines = all.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^#1 \S+ "one" — .* — parent none — by collaborator$/);
    expect(lines[1]).toMatch(
      new RegExp(`^#2 ${secondId} "two" — .* — parent \\S+ — by collaborator$`),
    );
    // #2 chains from #1
    const firstId = lines[0]!.split(' ')[1]!;
    expect(lines[1]).toContain(`parent ${firstId}`);

    const limited = (await execute('list_snapshots', { limit: 1 })) as string;
    expect(limited.split('\n')).toHaveLength(1);
    expect(limited).toContain('"two"');
  });

  it('restore takes a safety snapshot, puts the files back, and reports the change', async () => {
    const snap = (await execute('snapshot', { label: 'good' })) as string;
    const goodId = /id: (\S+)/.exec(snap)![1]!;
    await execute('read_file', { path: 'index.html' });
    await execute('write_file', { path: 'index.html', content: '<h1>BROKEN</h1>' });
    await execute('write_file', { path: 'extra.css', content: 'body{}' });

    const result = (await execute('restore', { snapshotId: goodId })) as string;
    expect(result).toMatch(/^Restored the workspace to snapshot #1 "good"/);
    expect(result).toContain('Safety snapshot #2 "Before revert"');
    expect(result).toContain('1 removed, 1 modified');
    expect(result).toContain('extra.css');
    expect(didMutate('restore', result)).toBe(true);

    expect(await execute('read_file', { path: 'index.html' })).toBe('<h1>v1</h1>');
    expect(await execute('read_file', { path: 'extra.css' })).toContain('File not found');

    // The restored snapshot is the tip: next snapshot chains from it
    const { getServices } = await import('@/services');
    const crux = await getServices().crux.findById(cruxId);
    expect(crux.meta?.settings?.activeBranch).toBe(goodId);
    const list = (await execute('list_snapshots', {})) as string;
    expect(list.split('\n')).toHaveLength(2);
  });

  it('restore accepts "#N" and "latest" references', async () => {
    await execute('snapshot', { label: 'a' });
    await execute('read_file', { path: 'index.html' });
    await execute('write_file', { path: 'index.html', content: '<h1>v2</h1>' });
    const result = (await execute('restore', { snapshotId: '#1' })) as string;
    expect(result).toMatch(/^Restored the workspace to snapshot #1 "a"/);
    expect(await execute('read_file', { path: 'index.html' })).toBe('<h1>v1</h1>');
    // "latest" is now the safety snapshot (v2) — restoring it brings v2 back
    const again = (await execute('restore', { snapshotId: 'latest' })) as string;
    expect(again).toContain('"Before revert"');
    expect(await execute('read_file', { path: 'index.html' })).toBe('<h1>v2</h1>');
  });

  it('refuses an unknown snapshot id without touching anything', async () => {
    await execute('snapshot', { label: 'a' });
    const result = (await execute('restore', { snapshotId: 'not-a-snapshot' })) as string;
    expect(result).toMatch(/^Error/);
    expect(result).toContain('Unknown snapshot "not-a-snapshot"');
    expect(result).toContain('list_snapshots');
    expect(didMutate('restore', result)).toBe(false);
    const list = (await execute('list_snapshots', {})) as string;
    expect(list.split('\n')).toHaveLength(1); // no safety snapshot was taken
    expect(await execute('read_file', { path: 'index.html' })).toBe('<h1>v1</h1>');
  });

  it('validates inputs before running', async () => {
    expect(await execute('restore', {})).toContain('snapshotId is required');
    expect(await execute('branch', { snapshotId: '#1' })).toContain('label is required');
    expect(await execute('diff', {})).toContain('from is required');
    expect(await execute('list_snapshots', { limit: 0 })).toContain('positive integer');
    expect(await execute('snapshot', { label: 'x'.repeat(200) })).toContain('at most 120');
  });

  it('branch restores the files, marks the branch point active, and seeds the conversation', async () => {
    const snap = (await execute('snapshot', { label: 'base' })) as string;
    const baseId = /id: (\S+)/.exec(snap)![1]!;
    await execute('read_file', { path: 'index.html' });
    await execute('write_file', { path: 'index.html', content: '<h1>v2</h1>' });

    const result = (await execute('branch', { snapshotId: baseId, label: 'Try dark' })) as string;
    expect(result).toMatch(/^Branched as "Try dark" from snapshot #1 "base"/);
    expect(result).toContain('Safety snapshot #2 "Before branch"');
    expect(didMutate('branch', result)).toBe(true);
    expect(await execute('read_file', { path: 'index.html' })).toBe('<h1>v1</h1>');

    const { getServices } = await import('@/services');
    const crux = await getServices().crux.findById(cruxId);
    expect(crux.meta?.settings?.activeBranch).toBe(baseId);
    const msgs = crux.meta?.messages as { content: string }[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.content).toContain('Branching from snapshot "Try dark"');

    // A snapshot taken now chains from the branch point and moves the tip
    const next = (await execute('snapshot', { label: 'on branch' })) as string;
    const nextId = /id: (\S+)/.exec(next)![1]!;
    expect(next).toContain(`parent: ${baseId}`);
    const after = await getServices().crux.findById(cruxId);
    expect(after.meta?.settings?.activeBranch).toBe(nextId);
  });

  it('diff reports added/removed/modified by fingerprint, against a snapshot or the working files', async () => {
    const a = (await execute('snapshot', { label: 'a' })) as string;
    const aId = /id: (\S+)/.exec(a)![1]!;
    await execute('read_file', { path: 'index.html' });
    await execute('write_file', { path: 'index.html', content: '<h1>v2!!</h1>' });
    await execute('write_file', { path: 'new.txt', content: 'n' });

    const working = (await execute('diff', { from: aId })) as string;
    expect(working).toContain('to the current working files');
    expect(working).toMatch(/Added \(1\):\n {2}new.txt \(1 bytes\)/);
    expect(working).toMatch(/Modified \(1\):\n {2}index.html \(11 → 13 bytes\)/);
    expect(working).not.toContain('Removed');

    const b = (await execute('snapshot', { label: 'b' })) as string;
    const bId = /id: (\S+)/.exec(b)![1]!;
    const between = (await execute('diff', { from: aId, to: bId })) as string;
    expect(between).toContain('new.txt');
    expect(await execute('diff', { from: bId })).toMatch(/^No file differences/);
    expect(await execute('diff', { from: 'nope' })).toContain('Unknown snapshot "nope"');
    expect(didMutate('diff', between)).toBe(false);
    expect(didMutate('snapshot', b)).toBe(false);
  });
});

describe('remember and load_skill (B6)', () => {
  beforeEach(async () => {
    await initServices('local');
    const { clearMemory } = await import('@/services/memory');
    await clearMemory();
  });

  it('are offered to every workspace conversation', () => {
    const names = defaultToolDefinitions().map((t) => t.name);
    expect(names).toContain('remember');
    expect(names).toContain('load_skill');
    // Neither changes the workspace — no context rebuild, no auto-snapshot
    expect(MUTATING_TOOLS).not.toContain('remember');
    expect(MUTATING_TOOLS).not.toContain('load_skill');
    expect(didMutate('remember', 'Remembered (Preferences): x')).toBe(false);
  });

  it('remember validates section and note before touching memory', async () => {
    const { getServices } = await import('@/services');
    const { getMemory, isMemoryEmpty } = await import('@/services/memory');
    const created = await getServices().crux.create({ title: 'Mem' });
    const exec = createToolExecutor(created.id);

    expect(await exec('remember', { section: 'Habits', note: 'x' })).toMatch(
      /Error.*section must be one of "Preferences", "Voice", "Decisions", "Notes"/,
    );
    expect(await exec('remember', { section: 'Notes', note: '   ' })).toMatch(
      /Error.*note is required/,
    );
    expect(await exec('remember', { section: 'Notes', note: 'a\nb' })).toMatch(
      /Error.*single line/,
    );
    expect(await exec('remember', { section: 'Notes', note: 'x'.repeat(301) })).toMatch(
      /Error.*at most 300/,
    );
    expect(isMemoryEmpty(getMemory())).toBe(true);

    const ok = await exec('remember', { section: 'Preferences', note: 'prefers British spelling' });
    expect(ok).toBe('Remembered (Preferences): prefers British spelling');
    expect(getMemory()).toContain('## Preferences\n- prefers British spelling');
  });

  it('load_skill returns the skill text and refuses unknown names', async () => {
    const { getServices } = await import('@/services');
    const { getSkill } = await import('./skills');
    const created = await getServices().crux.create({ title: 'Skill' });
    const exec = createToolExecutor(created.id);
    expect(await exec('load_skill', { name: 'mood-design' })).toBe(getSkill('mood-design')!.text);
    expect(await exec('load_skill', { name: 'cooking' })).toMatch(/Error.*Unknown skill "cooking"/);
  });
});
