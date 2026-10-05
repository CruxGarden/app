import { describe, expect, it, vi } from 'vitest';
vi.mock('./blobs', () => ({
  readBlob: async (fingerprint: string) => new TextEncoder().encode(`bytes of ${fingerprint}`),
}));
import {
  TEXT_DIFF_LIMIT,
  changeView,
  compareFileLists,
  compareFilesOf,
  countChanges,
  readCompareText,
  type CompareFile,
} from './version-compare';
import type { Artifact } from '@/api/types';

const file = (path: string, fingerprint: string, more: Partial<CompareFile> = {}): CompareFile => ({
  path,
  fingerprint,
  size: 10,
  mimeType: 'text/plain',
  encoding: 'utf-8',
  ...more,
});

describe('compareFileLists', () => {
  it('lists added, removed and changed files by Fingerprint, sorted by path', () => {
    const before = [file('index.html', 'a1'), file('old.txt', 'b1'), file('same.css', 'c1')];
    const after = [file('same.css', 'c1'), file('index.html', 'a2'), file('new/note.md', 'd1')];
    const changes = compareFileLists(before, after);
    expect(changes.map((c) => [c.path, c.status])).toEqual([
      ['index.html', 'changed'],
      ['new/note.md', 'added'],
      ['old.txt', 'removed'],
    ]);
    expect(changes[0]).toMatchObject({
      before: { fingerprint: 'a1' },
      after: { fingerprint: 'a2' },
    });
    expect(changes[1]!.before).toBeUndefined();
    expect(changes[2]!.after).toBeUndefined();
    expect(countChanges(changes)).toEqual({ changed: 1, added: 1, removed: 1 });
  });
  it('reports nothing for identical states, whatever the order', () => {
    const a = [file('a', '1'), file('b', '2')];
    expect(compareFileLists(a, [...a].reverse())).toEqual([]);
  });
  it('treats a rename as one removed and one added file', () => {
    expect(
      compareFileLists([file('a.txt', '1')], [file('b.txt', '1')]).map((c) => c.status),
    ).toEqual(['removed', 'added']);
  });
  it('ignores the recaptured Home thumbnail', () => {
    expect(compareFileLists([file('preview.jpg', '1')], [file('preview.jpg', '2')])).toEqual([]);
  });
  it('calls a file without a Fingerprint changed rather than guessing', () => {
    expect(
      compareFileLists([file('a', undefined as never)], [file('a', undefined as never)])[0]!.status,
    ).toBe('changed');
  });
});

describe('changeView', () => {
  const change = (before?: CompareFile, after?: CompareFile) => ({
    path: (before ?? after)!.path,
    status: 'changed' as const,
    before,
    after,
  });
  it('diffs text, including one-sided changes', () => {
    expect(changeView(change(file('a', '1'), file('a', '2')))).toBe('text');
    expect(changeView(change(undefined, file('a', '2')))).toBe('text');
  });
  it('shows pictures for images and only the fact for other binary files', () => {
    const png = { mimeType: 'image/png', encoding: 'binary' };
    expect(changeView(change(file('a.png', '1', png), file('a.png', '2', png)))).toBe('image');
    const zip = { mimeType: 'application/zip', encoding: 'binary' };
    expect(changeView(change(file('a.zip', '1', zip), file('a.zip', '2', zip)))).toBe('binary');
    expect(changeView(change(file('a', '1'), file('a', '2', zip)))).toBe('binary');
  });
  it('treats SVG as text', () => {
    const svg = { mimeType: 'image/svg+xml' };
    expect(changeView(change(file('a.svg', '1', svg), file('a.svg', '2', svg)))).toBe('text');
  });
  it('declines text beyond the limit on either side', () => {
    const big = { size: TEXT_DIFF_LIMIT + 1 };
    expect(changeView(change(file('a', '1'), file('a', '2', big)))).toBe('too-large');
    expect(changeView(change(file('a', '1', { size: TEXT_DIFF_LIMIT }), file('a', '2')))).toBe(
      'text',
    );
  });
});

describe('reading a side', () => {
  it('reads content from the Blob Store by Fingerprint; a missing side is empty', async () => {
    expect(await readCompareText(file('a', 'f1'))).toBe('bytes of f1');
    expect(await readCompareText(undefined)).toBe('');
    await expect(readCompareText(file('a', undefined as never))).rejects.toThrow(
      'no saved content',
    );
  });
  it('projects Artifacts to comparable files', () => {
    const artifact = {
      id: '1',
      type: 'artifact',
      filename: 'x.md',
      meta: { path: 'notes/x.md' },
      fingerprint: 'f',
      size: 3,
      mimeType: 'text/markdown',
      encoding: 'utf-8',
    } as Artifact;
    expect(compareFilesOf([artifact])).toEqual([
      {
        path: 'notes/x.md',
        fingerprint: 'f',
        size: 3,
        mimeType: 'text/markdown',
        encoding: 'utf-8',
      },
    ]);
  });
});
