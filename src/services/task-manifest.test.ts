import { it, expect } from 'vitest';
import { mergeTaskManifests, validateTaskPaths, type TaskFile } from './task-manifest';
import { hashContent } from './sqlite/helpers';
it('three-way text merge preserves whitespace and independently edited lines', async () => {
  const blobs = new Map<string, Uint8Array>();
  async function file(text: string): Promise<TaskFile> {
    const data = new TextEncoder().encode(text);
    const fingerprint = await hashContent(data);
    blobs.set(fingerprint, data);
    return { fingerprint, mimeType: 'text/plain', encoding: 'utf-8', mode: 0o644 };
  }
  const base = { 'a.txt': await file('one\n  two\nthree\nfour\n') };
  const main = { 'a.txt': await file('ONE\n  two\nthree\nfour\n') };
  const task = { 'a.txt': await file('one\n  two\nthree\nFOUR\n') };
  const merged = await mergeTaskManifests(
    base,
    main,
    task,
    async (fp) => blobs.get(fp)!,
    async (fp, data) => {
      blobs.set(fp, data);
    },
  );
  expect(merged.conflicts).toEqual([]);
  expect(new TextDecoder().decode(blobs.get(merged.manifest['a.txt']!.fingerprint))).toBe(
    'ONE\n  two\nthree\nFOUR\n',
  );
});
it('does not guess binary conflicts, delete/edit conflicts, or executable mode conflicts', async () => {
  const b: TaskFile = {
    fingerprint: 'base',
    mimeType: 'image/png',
    encoding: 'binary',
    mode: 0o644,
  };
  const read = async () => new Uint8Array();
  const write = async () => {};
  expect(
    (
      await mergeTaskManifests(
        { x: b },
        { x: { ...b, fingerprint: 'main' } },
        { x: { ...b, fingerprint: 'task' } },
        read,
        write,
      )
    ).conflicts,
  ).toHaveLength(1);
  expect(
    (await mergeTaskManifests({ x: b }, {}, { x: { ...b, fingerprint: 'task' } }, read, write))
      .conflicts,
  ).toHaveLength(1);
  const mode = await mergeTaskManifests(
    { x: b },
    { x: { ...b, mode: 0o755 } },
    { x: { ...b, fingerprint: 'task' } },
    read,
    write,
  );
  expect(mode.conflicts).toHaveLength(1);
});
it('rejects unsafe and cross-platform ambiguous paths', () => {
  const file: TaskFile = {
    fingerprint: 'x',
    mimeType: 'text/plain',
    encoding: 'utf-8',
    mode: 0o644,
  };
  for (const paths of [
    ['../outside'],
    ['/absolute'],
    ['x\\y'],
    ['a', 'A'],
    ['a', 'a/b'],
    ['.env.local'],
    ['.git/config'],
  ]) {
    expect(() => validateTaskPaths(Object.fromEntries(paths.map((p) => [p, file])))).toThrow();
  }
});
