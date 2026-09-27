import { togglePanel } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * A turn with the scripted model (CRUX_AI_MOCK=1, see ai/mock-model.ts) belongs
 * to the crux, not to the Collaboration pane: hiding the pane while the model
 * is "thinking" must not abort the turn. (The plain write → reply → recovery
 * point loop is journeys/02-collaborate.spec.ts.) No provider key, no network.
 */

/** The Plasma Mood opens only Collaboration and Workshop; the tree lives in Artifacts. */
async function showArtifacts(page: import('@playwright/test').Page) {
  if (!(await page.getByTestId('pane-body-artifacts').isVisible()))
    await togglePanel(page, 'Toggle artifacts');
}

test.describe('collaboration (mock AI)', () => {
  test.setTimeout(120_000);

  test('hiding the Collaboration pane mid-turn does not abort the turn', async () => {
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
      await input.fill('Please write slowly'); // the mock holds its tool call ~1.5s
      await input.press('Enter');

      // Hide the pane while the model is "thinking" — the turn belonged to the
      // pane component and used to be aborted right here.
      await togglePanel(page, 'Toggle collaboration');
      await expect(input).toHaveCount(0);

      await expect.poll(() => onDisk('hello.txt'), { timeout: 30_000 }).toBe(true);
      await showArtifacts(page);
      await expect(page.getByRole('tree').getByText('hello.txt', { exact: true })).toBeVisible();

      // Bring the pane back: the completed turn is there
      await togglePanel(page, 'Toggle collaboration');
      await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await app.close();
    }
  });
});
