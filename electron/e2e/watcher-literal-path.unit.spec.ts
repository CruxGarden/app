import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { ProjectWatcher } = require('../dist/watcher.js') as typeof import('../src/watcher');

test('the native watcher treats braces and brackets in a registered folder as literal path characters', async () => {
  const root = mkdtempSync(join(tmpdir(), 'crux-literal-watch-'));
  const folder = join(root, '{red,blue}[notes]');
  mkdirSync(folder);
  const events: import('../src/watcher').WatchBatch[] = [];
  const watcher = new ProjectWatcher((batch) => events.push(batch));
  try {
    watcher.watch(folder);
    // Repeated external writes also cover the asynchronous initial watch registration.
    await expect(async () => {
      writeFileSync(join(folder, 'external.txt'), String(Date.now()));
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(events.flatMap((batch) => batch.events)).toContainEqual(
        expect.objectContaining({ type: 'write', relPath: 'external.txt' }),
      );
    }).toPass({ timeout: 6000 });
  } finally {
    await watcher.closeAll();
    rmSync(root, { recursive: true, force: true });
  }
});
