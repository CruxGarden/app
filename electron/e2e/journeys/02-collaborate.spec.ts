import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { indexedFiles } from '../content-helpers';

/** Talk to the collaborator: it writes a file, the file is real, and a recovery point is kept. */
test('a turn writes a file and keeps a recovery point', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Notes');
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill('Please write hello');
    await composer.press('Enter');
    await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(async () => Object.keys(await indexedFiles(page, id))).toContain('hello.txt');
    const history = await openPanel(page, 'history', 'Toggle growth');
    await history.getByRole('button', { name: 'Edits', exact: true }).click();
    await expect(
      history.getByRole('button', { name: 'Inspect recovery point 1', exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
  }
});
