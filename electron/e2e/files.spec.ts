import { test, expect } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Files journey: the Artifacts pane against a real Project Folder.
 *
 *   new file → appears in tree AND on disk → rename → new folder (its .keep
 *   marker stays invisible) → keyboard Delete on the folder → app confirm
 *   dialog → gone from tree and disk → delete file via context menu, cancel,
 *   then confirm.
 *
 * Also the regression suite for: window.confirm (blocked Playwright, stole
 * focus in Electron) → app dialogs; keyboard Delete forwarding folder ids
 * that deleteArtifacts silently skipped; `.keep` rendered as a file.
 */
test.describe('files (Artifacts pane + Project Folder)', () => {
  test.setTimeout(120_000);

  test('create, rename, folder, delete — tree and disk agree', async () => {
    const { app, page, dir } = await launchApp();
    const gardenRoot = join(dir, 'garden');
    const projectFolder = () => join(gardenRoot, readdirSync(gardenRoot)[0]!);
    const onDisk = (rel: string) => existsSync(join(projectFolder(), rel));

    try {
      // Fresh garden → blank crux (its layout opens the Artifacts pane)
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      // An empty crux shows a drop zone, not a tree — the toolbar is the anchor.
      const newFile = page.getByRole('button', { name: 'New file' });
      await expect(newFile).toBeVisible({ timeout: 30_000 });

      // ── New file ─────────────────────────────────────────────────────────
      await newFile.click();
      const tree = page.getByRole('tree'); // appears with the inline name input
      const nameInput = tree.getByRole('textbox');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('notes.md');
      await nameInput.press('Enter');
      await expect(tree.getByText('notes.md', { exact: true })).toBeVisible();
      await expect.poll(() => onDisk('notes.md')).toBe(true); // write-through
      await page.screenshot({ path: 'e2e/.results/files-1-created.png' });

      // ── Rename via context menu ──────────────────────────────────────────
      await tree.getByText('notes.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Rename' }).click();
      const renameInput = tree.getByRole('textbox');
      await renameInput.fill('readme.md');
      await renameInput.press('Enter');
      await expect(tree.getByText('readme.md', { exact: true })).toBeVisible();
      await expect(tree.getByText('notes.md', { exact: true })).toHaveCount(0);
      await expect.poll(() => onDisk('readme.md') && !onDisk('notes.md')).toBe(true);

      // ── New folder: shown as a folder, its .keep marker invisible ────────
      await page.getByRole('button', { name: 'New folder' }).click();
      const folderInput = tree.getByRole('textbox');
      await folderInput.fill('docs');
      await folderInput.press('Enter');
      await expect(tree.getByText('docs', { exact: true })).toBeVisible();
      await expect(tree.getByText('.keep')).toHaveCount(0);
      await expect.poll(() => onDisk('docs/.keep')).toBe(true);
      await page.screenshot({ path: 'e2e/.results/files-2-folder.png' });

      // ── Keyboard Delete on the folder → app dialog (not window.confirm) ──
      await tree.getByText('docs', { exact: true }).click();
      await page.keyboard.press('Delete');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(/Delete this folder/);
      await page.screenshot({ path: 'e2e/.results/files-3-confirm.png' });
      await dialog.getByRole('button', { name: 'Delete' }).click();
      await expect(tree.getByText('docs', { exact: true })).toHaveCount(0);
      await expect.poll(() => onDisk('docs')).toBe(false);

      // ── Delete file: cancel keeps it, confirm removes it ─────────────────
      await tree.getByText('readme.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await expect(tree.getByText('readme.md', { exact: true })).toBeVisible();

      await tree.getByText('readme.md', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
      await expect(tree.getByText('readme.md', { exact: true })).toHaveCount(0);
      await expect.poll(() => onDisk('readme.md')).toBe(false);
      await page.screenshot({ path: 'e2e/.results/files-4-empty.png' });
    } finally {
      await app.close();
    }
  });
});
