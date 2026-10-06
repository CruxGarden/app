import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTypstOffline } from '../src/typst-offline';

test('an unreviewed or missing compiler cannot execute a document and releases its listener', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'crux-typst-version-'));
  const output = join(folder, 'previous.pdf');
  const listeners = () =>
    process.getActiveResourcesInfo().filter((name) => name === 'TCPServerWrap').length;
  const before = listeners();
  try {
    await writeFile(output, 'Previous PDF');
    // Real Node is an executable with an unsupported version response. Its
    // document command would overwrite the existing output if admission failed.
    await expect(
      runTypstOffline(
        process.execPath,
        ['-e', `require('node:fs').writeFileSync(${JSON.stringify(output)}, 'overwritten')`],
        folder,
        1000,
      ),
    ).rejects.toThrow('requires Typst 0.15.1');
    await expect(
      runTypstOffline(join(folder, 'missing-compiler'), [], folder, 1000),
    ).rejects.toThrow('ENOENT');
    expect(await readFile(output, 'utf8')).toBe('Previous PDF');
    await expect.poll(listeners).toBe(before);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
