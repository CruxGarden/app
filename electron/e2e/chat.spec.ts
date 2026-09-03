import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * The core loop with a scripted model (CRUX_AI_MOCK=1, see ai/mock-model.ts):
 * ask the AI to write a file → the tool runs against the real store and
 * Project Folder → the reply streams in → the auto-snapshot fires. No provider
 * key, no network.
 */
test.describe('collaboration (mock AI)', () => {
  test.setTimeout(120_000);

  test('a chat turn writes a file, replies, and snapshots', async () => {
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const gardenRoot = join(dir, 'garden');
    const onDisk = (rel: string) => {
      try {
        return existsSync(join(gardenRoot, readdirSync(gardenRoot)[0]!, rel));
      } catch {
        return false;
      }
    };
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      const input = page.getByPlaceholder('Send a message...');
      await expect(input).toBeVisible({ timeout: 30_000 });
      await input.fill('Please write hello');
      await input.press('Enter');

      // Tool ran for real: file in the tree and on disk
      await expect(page.getByRole('tree').getByText('hello.txt', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => onDisk('hello.txt')).toBe(true);
      expect(readFileSync(join(gardenRoot, readdirSync(gardenRoot)[0]!, 'hello.txt'), 'utf8')).toBe('Hello from the mock AI.\n');

      // The reply after the tool result streamed into the conversation
      await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/chat-1-turn.png' });

      // Auto-snapshot (default: every AI turn that mutated files)
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await expect(page.getByText('#1', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('hello.txt', { exact: true })).toHaveCount(2); // tree + snapshot card
      await page.screenshot({ path: 'e2e/.results/chat-2-snapshot.png' });
    } finally {
      await app.close();
    }
  });
});
