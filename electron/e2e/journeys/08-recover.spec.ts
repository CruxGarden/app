import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { fileText } from '../content-helpers';
import { writeFirstFile } from './journey-helpers';

/** Delete → Recently deleted → restore: the file comes back exactly. */
test('a deleted Crux is restored whole', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Keepsake');
    await writeFirstFile(page, 'note.txt', 'Do not lose me');
    await expect.poll(() => fileText(page, id, 'note.txt')).toBe('Do not lose me');
    await goHome(page);
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: 'Close Keepsake workspace' }).click();
    const dlg = page.getByRole('dialog', { name: 'Close workspace' });
    if (await dlg.isVisible().catch(() => false))
      await dlg.getByRole('button', { name: 'Save and close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const card = page.getByRole('button', { name: 'Open Keepsake' }).locator('..');
    await card.hover();
    await card.getByRole('button', { name: 'Crux actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    // A question only when there is something to decide (published, or members to move).
    const ask = page.getByRole('dialog', { name: /^Delete (Crux|Garden)$/ });
    if (
      await ask.waitFor({ timeout: 2_000 }).then(
        () => true,
        () => false,
      )
    )
      await ask.getByRole('button', { name: 'Delete', exact: true }).click();
    const row = page.getByTestId('trash-section').locator('li').filter({ hasText: 'Keepsake' });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('button', { name: 'Open Keepsake' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Open Keepsake' }).click();
    await openPanel(page, 'artifacts', 'Toggle artifacts');
    await expect(page.getByRole('tree').getByText('note.txt')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => fileText(page, id, 'note.txt')).toBe('Do not lose me');
  } finally {
    await app.close();
  }
});
