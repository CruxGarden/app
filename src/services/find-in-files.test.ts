import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Artifact } from '@/api/types';
import { searchLines } from '@/ai/search-lines';

vi.mock('./index', () => ({ getServices: () => ({ artifact: { readContent: vi.fn() } }) }));
import {
  FIND_RESULT_LIMIT,
  findInFiles,
  locateMatch,
  searchableArtifacts,
  type FindResults,
} from './find-in-files';
import { FindResultsList } from '@/components/artifacts/FindInFiles';
import { revealRange } from '@/components/workspace/editor-reveal';

const contents = new Map<string, string>();
const file = (path: string, content: string, more: Partial<Artifact> = {}): Artifact => {
  contents.set(path, content);
  return {
    id: `id:${path}`,
    type: 'artifact',
    filename: path.split('/').pop()!,
    meta: { path },
    mimeType: 'text/plain',
    encoding: 'utf-8',
    size: content.length,
    ...more,
  } as Artifact;
};
const read = async (artifact: Artifact) => contents.get(artifact.meta!.path!)!;
// The worker runs exactly this function; here it runs in place.
const search = vi.fn(async (input: Parameters<typeof searchLines>[0]) => searchLines(input));
const find = (artifacts: Artifact[], query: string, more = {}) =>
  findInFiles({ artifacts, query, read, search, ...more });

describe('findInFiles', () => {
  it('groups matching lines by file, with line, column and a marked preview', async () => {
    const results = await find(
      [
        file('src/b.css', '.title { color: red; }'),
        file('src/a.js', 'const x = 1;\n  const Title = "Hello";\nconsole.log(title);'),
        file('notes.md', 'nothing here'),
      ],
      'title',
    );
    expect(results.files.map((f) => f.path)).toEqual(['src/a.js', 'src/b.css']);
    expect(results.total).toBe(3);
    expect(results.truncated).toBe(false);
    const [first, second] = results.files[0]!.matches;
    expect(first).toMatchObject({ line: 2, column: 9, length: 5, previewStart: 6 });
    expect(first!.preview).toBe('const Title = "Hello";');
    expect(first!.preview.slice(first!.previewStart, first!.previewStart + 5)).toBe('Title');
    expect(second).toMatchObject({ line: 3, column: 13 });
    expect(results.files[1]!.id).toBe('id:src/b.css');
  });

  it('is case-insensitive unless match case is on', async () => {
    const files = [file('n.txt', 'Hello World')];
    expect((await find(files, 'hello')).total).toBe(1);
    expect((await find(files, 'hello', { caseSensitive: true })).total).toBe(0);
    expect((await find(files, 'Hello', { caseSensitive: true })).total).toBe(1);
  });

  it('searches literally: regex characters mean themselves', async () => {
    const files = [file('c.js', 'items.map(x => x * 2)\nitemsXmap')];
    const results = await find(files, '.map(x');
    expect(results.total).toBe(1);
    expect(results.files[0]!.matches[0]).toMatchObject({ line: 1, column: 6, length: 6 });
  });

  it('skips binary files and the thumbnail, as the collaborator tool does', async () => {
    const files = [
      file('a.png', 'needle', { mimeType: 'image/png', encoding: 'binary' }),
      file('b.bin', 'needle', { mimeType: 'application/octet-stream' }),
      file('folder', 'needle', { type: 'folder' }),
      file('ok.txt', 'needle'),
    ];
    expect(searchableArtifacts(files).map((f) => f.id)).toEqual(['id:ok.txt']);
    expect((await find(files, 'needle')).files.map((f) => f.path)).toEqual(['ok.txt']);
  });

  it('caps the results and says so', async () => {
    const many = Array.from({ length: FIND_RESULT_LIMIT + 50 }, () => 'needle').join('\n');
    const results = await find([file('big.txt', many), file('later.txt', 'needle')], 'needle');
    expect(results.total).toBe(FIND_RESULT_LIMIT);
    expect(results.truncated).toBe(true);
    expect(results.files.map((f) => f.path)).toEqual(['big.txt']);
  });

  it('counts files too large to search and carries on', async () => {
    const results = await find(
      [file('huge.txt', 'x'.repeat(2 * 1024 * 1024 + 1)), file('ok.txt', 'x marks')],
      'x',
    );
    expect(results.skipped).toBe(1);
    expect(results.files.map((f) => f.path)).toEqual(['ok.txt']);
  });

  it('skips an unreadable file without failing the search', async () => {
    const files = [file('bad.txt', 'needle'), file('good.txt', 'needle')];
    const results = await findInFiles({
      artifacts: files,
      query: 'needle',
      search,
      read: async (a) => {
        if (a.id === 'id:bad.txt') throw new Error('gone');
        return read(a);
      },
    });
    expect(results.files.map((f) => f.path)).toEqual(['good.txt']);
  });

  it('returns nothing for an empty query and only spends a worker on files that match', async () => {
    search.mockClear();
    expect((await find([file('a.txt', 'abc')], '')).total).toBe(0);
    await find([file('a.txt', 'abc'), file('b.txt', 'xyz')], 'xyz');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('abandons a search that was typed past', async () => {
    const abort = new AbortController();
    const files = [file('a.txt', 'needle'), file('b.txt', 'needle')];
    const pending = findInFiles({
      artifacts: files,
      query: 'needle',
      search,
      signal: abort.signal,
      read: async (a) => {
        abort.abort();
        return read(a);
      },
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('locateMatch', () => {
  it('keeps a match far along a long line in the preview', () => {
    const line = `${'a'.repeat(500)}needle${'b'.repeat(500)}`;
    const match = locateMatch(line, 7, /needle/i)!;
    expect(match).toMatchObject({ line: 7, column: 501, length: 6 });
    expect(match.preview.length).toBeLessThanOrEqual(200);
    expect(match.preview.slice(match.previewStart, match.previewStart + 6)).toBe('needle');
  });
});

describe('FindResultsList', () => {
  const results: FindResults = {
    files: [
      {
        id: '1',
        path: 'src/a.js',
        matches: [{ line: 2, column: 9, length: 5, preview: 'const Title = 1;', previewStart: 6 }],
      },
    ],
    total: 1,
    truncated: false,
    skipped: 0,
  };
  const render = (value: FindResults) =>
    renderToStaticMarkup(
      createElement(FindResultsList, { results: value, query: 'title', onOpen: () => {} }),
    );

  it('lists files with their line previews and marks the match', () => {
    const html = render(results);
    expect(html).toContain('src/a.js');
    expect(html).toContain('1 match in 1 file');
    expect(html).toMatch(/<mark[^>]*>Title<\/mark>/);
    expect(html).toContain('title="src/a.js:2"');
  });
  it('says when only the first matches are shown and when files were skipped', () => {
    const html = render({ ...results, total: 200, truncated: true, skipped: 2 });
    expect(html).toContain('Showing the first 200 matches');
    expect(html).toContain('2 files were too large to search.');
  });
  it('says plainly when nothing matched', () => {
    expect(render({ files: [], total: 0, truncated: false, skipped: 0 })).toContain(
      'No matches for “title”.',
    );
  });
});

describe('revealRange', () => {
  const lengths = [10, 4, 0];
  const range = (line: number, column: number, length: number) =>
    revealRange({ line, column, length }, lengths.length, (n) => lengths[n - 1]!);
  it('selects the match on its line', () => {
    expect(range(1, 3, 4)).toEqual({
      startLineNumber: 1,
      startColumn: 3,
      endLineNumber: 1,
      endColumn: 7,
    });
  });
  it('stays inside text that has changed since the search', () => {
    expect(range(9, 3, 4)).toMatchObject({ startLineNumber: 3, startColumn: 1, endColumn: 1 });
    expect(range(2, 3, 40)).toMatchObject({ startLineNumber: 2, startColumn: 3, endColumn: 5 });
  });
});
