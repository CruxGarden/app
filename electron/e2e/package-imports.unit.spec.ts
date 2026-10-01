import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, mkdir, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PackageImports } from '../src/package-imports';

test('OS package queue deduplicates, ignores flags and only reads admitted IDs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'crux-open-unit-'));
  try {
    const queue = new PackageImports(() => {});
    await writeFile(join(dir, 'a.crux'), 'project');
    await writeFile(join(dir, 'b.CRUXTOOL'), 'tool');
    await writeFile(join(dir, 'c.cruxmood'), 'mood');
    queue.add(
      ['a.crux', './a.crux', 'b.CRUXTOOL', 'c.cruxmood', '--trace=x.crux', 'secret.txt'],
      dir,
    );
    expect(queue.pending().map((item) => item.name)).toEqual([
      'a.crux',
      'b.CRUXTOOL',
      'c.cruxmood',
    ]);
    await expect(queue.read(join(dir, 'a.crux'))).rejects.toThrow('no longer available');
    const first = queue.pending()[0]!;
    expect(new TextDecoder().decode(await queue.read(first.id))).toBe('project');
    queue.dismiss(first.id);
    await expect(queue.read(first.id)).rejects.toThrow('no longer available');
    await writeFile(join(dir, 'oversize.crux'), '');
    await truncate(join(dir, 'oversize.crux'), 500 * 1024 * 1024 + 1);
    queue.add(['oversize.crux'], dir);
    await expect(queue.read(queue.pending().at(-1)!.id)).rejects.toThrow('500 MB');
    await mkdir(join(dir, 'folder.crux'));
    queue.add(['folder.crux'], dir);
    await expect(queue.read(queue.pending().at(-1)!.id)).rejects.toThrow('package file');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
