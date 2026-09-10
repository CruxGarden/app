import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';

/**
 * The Trash (RESILIENCE-PLAN § Guardrails): deleting a crux from the garden
 * only moves it to "Recently deleted". It can be restored whole — files and
 * all — or deleted for good from there; a new crux with the same title lives
 * alongside it; and the Trash survives a restart.
 */
async function newBlankCrux(page: Page, body: string) {
  await page.getByRole('button', { name: 'Add Crux' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Add files', exact: true }).click();
  await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
  const nameInput = page.getByRole('tree').getByRole('textbox');
  await nameInput.fill('index.html');
  await nameInput.press('Enter');
  const monaco = page.locator('.monaco-editor').first();
  await expect(monaco).toBeVisible({ timeout: 30_000 });
  await monaco.click();
  await page.keyboard.type(body);
  await page.keyboard.press('ControlOrMeta+s');
}

async function closeWorkspace(page: Page, title: string) {
  await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
  await page
    .getByRole('button', { name: `Close ${title} workspace` })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Close workspace' });
  if (await dialog.isVisible().catch(() => false))
    await dialog.getByRole('button', { name: 'Save and close', exact: true }).click();
  await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function deleteFromCard(page: Page, title: string) {
  const card = page
    .getByRole('button', { name: `Open ${title}` })
    .first()
    .locator('..');
  await card.hover();
  await card.getByRole('button', { name: 'Crux actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete Crux' })).toBeVisible();
  await expect(page.getByText(/moves to Recently deleted/)).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
}

test.describe('trash: recently deleted cruxes', () => {
  test.setTimeout(240_000);

  test('delete → Recently deleted → restore whole; same title lives alongside; delete forever; survives restart', async () => {
    const { app, page, dir } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await newBlankCrux(page, '<h1>Keep me</h1>');
      await closeWorkspace(page, 'My Crux');

      // Delete: the card goes, the Trash appears with the crux in it
      await deleteFromCard(page, 'My Crux');
      await expect(page.getByRole('button', { name: 'Open My Crux' })).toHaveCount(0, {
        timeout: 15_000,
      });
      const trash = page.getByTestId('trash-section');
      await expect(trash).toBeVisible();
      const trashRow = trash.locator('li').filter({ hasText: 'My Crux' });
      await expect(trashRow).toContainText('Deleted');

      // A new crux with the same title lives alongside the trashed one
      await newBlankCrux(page, '<h1>Second</h1>');
      await closeWorkspace(page, 'My Crux');
      await expect(page.getByRole('button', { name: 'Open My Crux' })).toHaveCount(1);
      await expect(trashRow).toHaveCount(1);

      // Restore: both live again; the restored one still has its file
      await trashRow.getByRole('button', { name: 'Restore' }).click();
      await expect(trash).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Open My Crux' })).toHaveCount(2);
      await page.getByRole('button', { name: 'Open My Crux' }).last().click(); // oldest = restored
      await expect(page.getByRole('button', { name: 'Toggle artifacts' })).toBeVisible({
        timeout: 30_000,
      });
      const tree = page.getByRole('tree');
      if (!(await tree.isVisible().catch(() => false)))
        await page.getByRole('button', { name: 'Toggle artifacts' }).click();
      await tree.getByText('index.html').click();
      await expect(page.locator('.monaco-editor').first()).toContainText('Keep me', {
        timeout: 30_000,
      });
      await closeWorkspace(page, 'My Crux');

      // Trash the second one; it must still be there after a restart
      await deleteFromCard(page, 'My Crux');
      await expect(trash.locator('li')).toHaveCount(1, { timeout: 15_000 });
    } finally {
      await app.close();
    }

    const again = await launchApp({ dir });
    try {
      const { page } = again;
      await page.getByRole('button', { name: /enter/i }).click();
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 30_000 });
      const row = page.getByTestId('trash-section').locator('li').filter({ hasText: 'My Crux' });
      await expect(row).toBeVisible({ timeout: 15_000 });

      // Delete forever asks first, then the crux is gone from everywhere
      await row.getByRole('button', { name: 'Delete forever' }).click();
      const ask = page.getByRole('dialog').filter({ hasText: 'for good' });
      await expect(ask).toBeVisible();
      await ask.getByRole('button', { name: 'Delete forever' }).click();
      await expect(page.getByTestId('trash-section')).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Open My Crux' })).toHaveCount(1);
    } finally {
      await again.app.close();
    }
  });
});
