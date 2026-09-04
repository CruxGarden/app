import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Growth journey: edit → snapshot → edit → snapshot → view the first →
 * revert. Asserts the editor, the History pane, AND the Project Folder all
 * agree after the revert, and that history survives leaving and re-opening
 * the crux (the reload path that used to reconstruct the pre-revert state —
 * revert never advanced activeBranch).
 */
test.describe('snapshots & revert', () => {
  test.setTimeout(120_000);

  test('snapshot, revert, and history survives reopening', async () => {
    const { app, page, dir } = await launchApp();
    const gardenRoot = join(dir, 'garden');
    // null while the file is absent so expect.poll keeps retrying instead of throwing
    const fileOnDisk = (): string | null => {
      try {
        const folder = join(gardenRoot, readdirSync(gardenRoot)[0]!);
        return readFileSync(join(folder, 'note.txt'), 'utf8');
      } catch {
        return null;
      }
    };

    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // A file with content, saved
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('note.txt');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('version one');
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(fileOnDisk).toBe('version one');

      // Snapshot "v1"
      await page.getByRole('button', { name: 'Toggle history' }).click();
      const snapshotWithLabel = async (label: string) => {
        await page
          .getByRole('button', { name: /snapshot/i })
          .first()
          .click();
        const input = page.getByPlaceholder('Label (optional)');
        await input.fill(label);
        await input.press('Enter');
        await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 30_000 });
      };
      await snapshotWithLabel('v1');

      // Edit + save + snapshot "v2"
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      await page.keyboard.press('End');
      await page.keyboard.type(' and version two');
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(fileOnDisk).toBe('version one and version two');
      await snapshotWithLabel('v2');
      await page.screenshot({ path: 'e2e/.results/snapshots-1-two-versions.png' });

      // View v1 → banner → Revert → app confirm dialog
      await page.getByRole('button').filter({ hasText: 'v1' }).first().click();
      await expect(page.getByRole('button', { name: 'Revert' })).toBeVisible();
      await page.getByRole('button', { name: 'Revert' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(/Revert workspace/);
      await dialog.getByRole('button', { name: 'Revert' }).click();

      // Editor, disk, and history agree
      await expect(monaco).toContainText('version one', { timeout: 30_000 });
      await expect(monaco).not.toContainText('version two');
      await expect.poll(fileOnDisk).toBe('version one');
      await expect(page.getByText('Before revert', { exact: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/snapshots-2-reverted.png' });

      // Leave and come back: the reconstructed conversation/history must be
      // the reverted one, not the pre-revert branch.
      await page
        .getByRole('link', { name: /garden|home/i })
        .first()
        .click()
        .catch(async () => {
          await page.evaluate(() => window.history.back());
        });
      await page.getByText('My Crux', { exact: true }).first().click();
      // Tabs are not restored on reopen — open the file from the tree.
      const tree = page.getByRole('tree');
      await expect(tree).toBeVisible({ timeout: 30_000 });
      await tree.getByText('note.txt', { exact: true }).click();
      const reopened = page.locator('.monaco-editor').first();
      await expect(reopened).toBeVisible({ timeout: 30_000 });
      await expect(reopened).toContainText('version one');
      await expect(reopened).not.toContainText('version two');
      if (!(await page.getByText('Before revert', { exact: true }).isVisible())) {
        await page.getByRole('button', { name: 'Toggle history' }).click();
      }
      await expect(page.getByText('v1', { exact: true })).toBeVisible();
      await expect(page.getByText('v2', { exact: true })).toBeVisible();
      await expect(page.getByText('Before revert', { exact: true })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
